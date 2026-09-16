# DECISIONS.md — Why Repository-Analyser Is Built the Way It Is

This document records every significant decision made in Repository-Analyser — what I chose, what I rejected, and why. It exists because architectural choices without recorded reasoning are dead weight: six months later you have code you can’t change safely because nobody remembers what constraint it was solving.

If you hit a limitation in Repository-Analyser and want to understand why it exists, this is where to look. If you’re thinking of changing something fundamental, start here.

---

## Why this project exists

Most developers who need to understand a codebase eventually hit the same wall. They open a large repository, stare at hundreds of files, and try to answer questions like:

- How do these modules actually depend on each other?
- Where are the circular dependencies?
- Which files are the “god modules” that everything imports?
- What does this architecture even look like at a high level?
- How did the structure change between `main` and my feature branch?

The usual answers are bad. You either:
- Manually explore the code for hours,
- Use a heavy IDE plugin that only works inside one editor,
- Or spin up a complex static-analysis tool that requires a lot of configuration and produces static reports that are hard to explore.

Repository-Analyser exists to fill that gap. It is a **local-first, interactive architecture exploration tool**. You point it at any Git repository on disk and get:

1. A live, colour-coded dependency graph you can pan, zoom, search, and filter.
2. One-click AI explanations of any file.
3. Automatic detection of high fan-in bottlenecks and circular dependencies.
4. The ability to compare any two Git refs (branches or commits) and see exactly how the architecture changed — without ever checking files out.
5. A real-time file-system watcher so the graph updates as you edit code in your IDE.

The target user is a developer or software architect who already has the code on their machine and wants to understand its structure quickly, without setting up infrastructure or paying for a hosted service.

---

## What Repository-Analyser actually is (and what it is not)

The tempting way to describe this project is “a dependency graph visualiser with AI.” That framing is incomplete and slightly misleading.

It is not trying to compete with Sourcegraph, CodeScene, or large enterprise architecture platforms. Those tools are servers, they index remote repositories, they have heavy operational overhead, and they are designed for organisations.

Repository-Analyser is something different. It is a **local developer tool** that runs entirely on your machine. You give it a path, it parses the repository, and it shows you an interactive graph in the browser. There is no remote indexing, no authentication, no cloud component (except the optional NVIDIA NIM calls for AI explanations).

The closest analogy is a combination of:
- A lightweight, modern version of `dependency-cruiser` or `madge`,
- Combined with an interactive React Flow canvas,
- Plus local AI explanations,
- Plus the ability to diff the architecture across Git history without touching the working tree.

It is deliberately scoped to be useful for individual developers and small teams, not enterprise-scale monorepos with tens of thousands of files (although it can handle reasonably large codebases).

---

## Technical decisions

### 1. Local filesystem + Git object store (not a remote GitHub API)

Most similar tools start with “paste a GitHub URL.” That approach has several problems:
- Rate limits
- Authentication friction for private repositories
- Inability to analyse uncommitted or local-only work
- Network dependency even for basic analysis

I rejected the remote-first approach. The tool works exclusively on a local path. Later this decision paid off when I added non-destructive Git-ref parsing: the tool can build a complete dependency graph for any branch or commit SHA by reading directly from Git’s object store (`git ls-tree` + `git show`) without ever checking files out into the working tree.

This is a deliberate constraint. It makes the tool less convenient for one-off public-repo exploration, but dramatically more useful for real day-to-day architecture work on code you already have.

### 2. Hybrid static analysis: Python `ast` + regex for JS/TS

I needed dependency extraction for both Python and modern JavaScript/TypeScript codebases.

Alternatives considered:
- **tree-sitter** — excellent multi-language support, but heavier dependency and more complex bindings.
- **TypeScript compiler API** — perfect accuracy for TS/JS, but requires Node.js on the backend and significantly more setup.
- **Pure regex for everything** — too brittle.

I chose a hybrid approach:
- Python uses the built-in `ast` module (perfect accuracy, zero cost).
- JS/TS uses carefully written regex for relative/absolute imports and `require()` calls, plus a small resolution layer that tries multiple extensions (`.ts`, `.tsx`, `.js`, `index.ts`, etc.).

This was the pragmatic choice for an MVP. The 90% solution is acceptable for a visualisation tool. Perfect accuracy is not required on day one. tree-sitter remains the natural next step if accuracy becomes a bottleneck.

### 3. SQLite content-hash cache for both parse results and LLM summaries

Re-parsing a large repository on every page load is slow. Calling the LLM for the same file multiple times wastes tokens and money.

I introduced a two-tier SQLite cache (`cache.db`):
- Parse cache stores language, LOC, and dependency list keyed by file path + content hash.
- Summary cache stores the LLM response keyed by the same content hash.

Because the key is a SHA-256 of the actual file contents, the cache is automatically invalidated when the file changes, regardless of timestamps. This is more correct than mtime-based caching.

Trade-off: the cache can grow over time. This is acceptable because the tool is local and single-user.

### 4. Background job queue with progress reporting (ThreadPoolExecutor)

**Commit**  
`Added Background Job Queue`

Parsing a medium-sized monorepo can take 5–15 seconds. Doing it synchronously blocked the FastAPI event loop and made the UI feel frozen.

I introduced a small in-memory job queue backed by `ThreadPoolExecutor(max_workers=4)`:
- `POST /api/graph/start` returns a `job_id` immediately.
- `GET /api/graph/status/{job_id}` returns progress + result.
- Frontend polls every 500 ms and shows a progress indicator.

I deliberately did **not** use Celery, Redis, or any external queue. Those are overkill for a single-user local tool. The in-memory approach is zero-config and perfectly adequate.

Difficulties encountered:
- Job lifetime management (must delete the job after the result is delivered to avoid memory leaks).
- Race conditions between the progress callback and the final result required a lock.

### 5. Non-destructive Git-ref parsing + visual architecture diff

**Commit**  
`Added Git Branch comparison`

This is one of the most important features in the project.

Architects frequently need to understand “what changed between `main` and my feature branch” at the **dependency-graph level**, not just at the line-diff level.

I added:
- `parse_repo_at_ref(repo_path, ref)` — builds a complete dependency graph for any ref without touching the working tree.
- `diff_graphs(base_graph, head_graph)` — labels every node and edge with a status: `added` / `removed` / `changed` / `unchanged`.
- Frontend renders green (added), red (removed), yellow (changed) overlays.
- `/api/refs` endpoint populates a dropdown with local branches + the 20 most recent commits.

This design is powerful because you can compare any two points in history (or even two tags) and instantly see how the architecture evolved.

Difficulties:
- Resolving the correct blob for a given path at a given ref required careful handling of trees.
- Content-hash comparison for “changed” status had to be robust.

### 6. Real-time file-system watcher via WebSockets + debouncing

**Commit**  
`Added websocket live updates`

After the initial graph is loaded, any edit the developer makes in their IDE should refresh the graph without a manual reload.

I mounted a `watchdog` observer on the repository root. On any create/modify/delete event, a 400 ms debounce timer is started. When the timer fires, the graph is re-parsed (or incrementally updated) and pushed over a WebSocket (`/ws/watch`).

Debouncing is essential. Without it, saving a file that triggers multiple IDE writes would flood the client with updates.

### 7. High fan-in bottleneck detection + LLM-powered refactor suggestions

A visual graph alone does not tell you *which* modules are architectural problems.

I compute fan-in (number of incoming edges) for every node. High-fan-in modules are flagged with a warning badge in the side panel. When the user requests a refactor suggestion, the file content + fan-in score is sent to the LLM, which is asked to propose concrete helper modules that could be extracted and explain how the split reduces coupling.

This turned the tool from a pure visualiser into an actionable architecture assistant.

### 8. “Explain Repo” high-level architectural summary

Looking at hundreds of nodes is still overwhelming. Users want a short natural-language overview of the whole system.

I rank the top ~15 most important files by a combination of fan-in and LOC, feed their dependency relationships + the first ~50 lines of each into the LLM, and ask for a 5–8 sentence architectural overview. The result is cached (with a force-regenerate option).

### 9. Contract View mode

**Commit**  
`Added contract view`

When analysing a large monorepo it is often more useful to see only the public API boundaries between packages rather than every internal file.

I added a toggle that filters the graph to show only edges that cross directory boundaries. Internal implementation details are hidden, leaving a clean “contract” view of how major modules talk to each other.

### 10. Progressive enhancement of the React Flow canvas

Over a series of commits the canvas gained:
- Folder clustering (nodes grouped inside parent directory containers)
- Language filter pills
- Floating search bar
- Node pinning
- Improved minimap
- One-click high-resolution PNG export (html-to-image)
- Edge colouring based on dependency direction
- Orphan-file detection
- Churn heatmap

Each of these was driven by real usability friction observed while using the tool on real repositories.

### 11. Model evolution (Llama-3.1-8B → minimax-m3 / dynamic)

The original model was `meta/llama-3.1-8b-instruct`. Later commits switched the default to `minimaxai/minimax-m3` (or whatever is supplied via `NVIDIA_MODEL`) because it produced more consistent structured refactor suggestions and better high-level architectural summaries. The OpenAI-compatible client made the swap trivial.

---

## Edge cases, failure modes, and correctness decisions

### Path traversal protection
The summarise endpoint originally accepted a relative `file_path`. Without protection, a malicious path such as `../../../../etc/passwd` could escape the repository. The fix is an explicit `os.path.commonpath` check that the resolved file path stays inside the repository root. Invalid paths return a 400.

### Large file handling
Files larger than 500 KB are rejected for summarisation. Prompt content is also capped at ~6 000 characters. This prevents token overflow and keeps costs predictable.

### Empty / invalid inputs
Empty or whitespace-only files are handled gracefully. The parser skips common junk directories (`node_modules`, `.git`, `__pycache__`, `dist`, `build`, `.venv`, etc.).

### WebSocket lifecycle
The frontend carefully tears down any existing WebSocket and polling timers before starting a new analysis. Failing to do this caused stale connections and duplicate updates.

### Job memory management
Background jobs are deleted from the in-memory map after the result is delivered. Without this, long-running sessions would slowly leak memory.

### Cache correctness
Because the cache key is a content hash rather than a timestamp, the cache remains correct even if the user reverts a file or switches branches.

---

## Concurrency and correctness issues discovered during development

Several subtle issues appeared once the tool started being used on real repositories:

- Race between progress callbacks and job completion required a lock.
- WebSocket updates arriving while the user was already starting a new analysis caused UI flicker and state corruption.
- Concurrent parse jobs on the same repository path could collide; the job system now serialises work per path where necessary.

These were fixed incrementally as they surfaced.

---

## What I would do differently next time

1. Start with tree-sitter (or a language-server-based approach) for dependency extraction instead of a hybrid AST + regex solution.
2. Make the background job system slightly more robust (cancellation, better error reporting) even for a local tool.
3. Add an optional “analyse remote GitHub repo” mode that clones into a temporary directory, so the tool is useful for quick one-off explorations.
4. Persist the graph layout positions so the canvas does not re-layout on every reload.
5. Introduce a simple plugin system for additional language parsers.
6. Add unit tests for the graph-diff algorithm and the import resolvers earlier — these became critical as features accumulated.

---

## Evolution Timeline

| Date (approx) | Milestone |
|---------------|-----------|
| 7 Jun 2026    | Initial commit — basic parse → React Flow graph → AI summary + SQLite cache |
| 8–9 Jun       | Search bar, popularity counts, edge colouring, re-center, file explorer sidebar |
| 21 Jun        | Language filter, repo stats, PNG export, circular-dependency detection, folder clustering |
| 22 Jun        | Dependency chain view, orphan-file detection |
| 25 Jun        | **Git branch / commit diff mode** (non-destructive object-store parsing) |
| 27 Jun        | Background job queue with progress, WebSocket live watcher, incremental re-analysis, codebase-level summary, refactor suggestions |
| 28 Jun        | Contract view, churn heatmap, node pinning, improved minimap |
| 29–30 Jun     | Frontend state fixes, model updates, README polish, database inspection helper |

---

## Closing note

Every major feature in Repository-Analyser was added in response to a real limitation I hit while using the tool on actual codebases. The design prioritises local-first operation, interactive exploration, and actionable insights over raw scale or remote collaboration features.

The architecture is intentionally simple in places (in-memory job queue, hybrid parser, SQLite cache) because the tool is meant to be a developer utility, not a distributed system. That constraint is the source of both its strengths and its current limitations.