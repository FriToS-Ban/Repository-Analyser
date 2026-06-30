# Repository Structure Analysis & Visualisation System

A full-stack, enterprise-grade developer tool designed to parse local Git repositories, construct interactive dependency graphs using React Flow, highlight architectural bottlenecks, and generate AI-powered codebase explanations via the NVIDIA NIM API (`minimaxai/minimax-m3` or dynamic).

---

## Table of Contents

- [Overview & System Architecture](#overview--system-architecture)
- [Project Directory Structure](#project-directory-structure)
- [Core Features Deep-Dive](#core-features-deep-dive)
  - [1. Visual Dependency Graph & Layout Engine](#1-visual-dependency-graph--layout-engine)
  - [2. AI-Powered Code Explanations & LLM Integration](#2-ai-powered-code-explanations--llm-integration)
  - [3. High Fan-In Bottleneck Detection & Refactoring Engine](#3-high-fan-in-bottleneck-detection--refactoring-engine)
  - [4. Repository Architectural Overview ("Explain Repo")](#4-repository-architectural-overview-explain-repo)
  - [5. Git Branch & Commit Diffing Engine](#5-git-branch--commit-diffing-engine)
  - [6. Contract View Mode](#6-contract-view-mode)
  - [7. Real-Time File System Watcher (WebSockets)](#7-real-time-file-system-watcher-websockets)
  - [8. High-Performance SQLite Caching Layer](#8-high-performance-sqlite-caching-layer)
- [Installation & Setup Guide](#installation--setup-guide)
  - [Prerequisites](#prerequisites)
  - [Backend Setup (FastAPI)](#backend-setup-fastapi)
  - [Frontend Setup (Vite + React)](#frontend-setup-vite--react)
- [Troubleshooting & Common Issues](#troubleshooting--common-issues)
- [Complete API Specification](#complete-api-specification)
- [Database & Caching Schema](#database--caching-schema)

---

## Overview & System Architecture

The System provides developers and software architects with dynamic insights into complex codebases. It combines filesystem parsing, Abstract Syntax Tree (AST) analysis, Git object inspection, and Large Language Models (LLMs) to automatically detect coupling, circular dependencies, and structural bottlenecks.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           React Frontend (Vite)                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ React Flow Canvas│  │   Side Panel     │  │ Repo Overview Modal   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────────┬───────────┘  │
└───────────┼─────────────────────┼────────────────────────┼──────────────┘
            │ HTTP / JSON         │ HTTP / JSON            │ WebSocket
            ▼                     ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           FastAPI Backend                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Thread Pool Jobs │  │   NVIDIA NIM     │  │ Watchdog FS Observer  │  │
│  │ (Async Parser)   │  │   (LLM Service)  │  │ (Live WS Watcher)     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────────┬───────────┘  │
└───────────┼─────────────────────┼────────────────────────┼──────────────┘
            │                     │                        │
            ▼                     ▼                        ▼
┌──────────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│ SQLite Cache         │  │ Local Git Repo   │  │ Raw Source Files      │  │
│ (cache.db)           │  │ (git objects)    │  │ (.py, .js, .ts, etc.) │  │
└──────────────────────┘  └──────────────────┘  └───────────────────────┘  │
```

---

## Project Directory Structure

```text
repo-analyser/
├── backend/
│   ├── main.py            # FastAPI application routes, background job queue, WS endpoints
│   ├── repo_parser.py     # AST/Regex static analysis, Git ref object reader, diff engine
│   ├── cache.py           # SQLite persistence layer for AST hashes and LLM completions
│   ├── cache.db           # Local SQLite database file (auto-generated)
│   └── requirements.txt   # Backend dependencies with pinned compatibility bounds
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Topbar controls, application layout, state orchestrator
│   │   ├── main.tsx       # React DOM mount point
│   │   ├── components/
│   │   │   ├── Graph.tsx            # React Flow canvas engine, search, language filter, PNG exporter
│   │   │   ├── FileNode.tsx         # Individual code module node renderer
│   │   │   ├── FolderGroupNode.tsx  # Group node container for directory clusters
│   │   │   └── SidePanel.tsx        # Inspection panel for AI explanations & refactor guidance
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── .gitignore             # Git ignore configuration for venvs and databases
└── README.md              # Project documentation
```

---

## Core Features Deep-Dive

### 1. Visual Dependency Graph & Layout Engine
- **Language Detection & Color Coding**: Parses source files into distinct visual nodes color-coded by language (Python in blue, JavaScript in yellow, TypeScript in cyan, and generic files in slate).
- **Directory Clustering**: Groups nodes inside parent container boxes matching their relative directory paths.
- **Metrics**: Displays Lines of Code (LOC) per file node and computes total file count and LOC breakdown in the application topbar.
- **Circular Dependency Highlighting**: Analyzes edges using graph algorithms to detect and visually highlight circular dependencies in red.
- **Canvas Tools**: Includes minimap navigation, fit-to-view auto-centering, instant filename search filtering, language filtering pills, and one-click high-resolution PNG canvas export using `html-to-image`.

### 2. AI-Powered Code Explanations & LLM Integration
- **NVIDIA NIM Integration**: Connects to NVIDIA's hosted LLM endpoint (defaults to `minimaxai/minimax-m3` or loaded via `NVIDIA_MODEL` env variable) via the standard OpenAI SDK format.
- **Context Management**: Reads file contents, truncating files larger than 500KB or capping prompts at 6,000 characters to optimize token usage and prevent payload overflow.
- **Concise Summaries**: Generates 3-sentence explanations explaining what each module does upon clicking a node in the graph.
- **Fallback Capability**: If `NVIDIA_API_KEY` is not provided, the system seamlessly outputs structured local placeholders so UI testing remains functional.

### 3. High Fan-In Bottleneck Detection & Refactoring Engine
- **Fan-In Computation**: Calculates how many other files import each module across the codebase graph.
- **Bottleneck Warning**: Files with high incoming dependencies are visually flagged with prominent warning badges in the inspector side panel.
- **Actionable Refactoring**: Submits the file content and fan-in score to the LLM, prompting it to output JSON-formatted proposals detailing specific helper submodules to extract (e.g. `auth_utils.py` or `types.ts`) and explaining how splitting them reduces coupling.

### 4. Repository Architectural Overview ("Explain Repo")
- **High-Level Synthesis**: Generates a 5-8 sentence architectural breakdown of the entire repository structure.
- **Smart Sampling**: Identifies the top 15 most critical files in the codebase (ranked by highest fan-in and LOC count) and feeds their combined dependency mappings and code headers into the LLM.
- **Single-Click Regeneration**: Features a scrollable modal view with an instant **Regenerate** button that passes a `force: true` payload to bypass SQLite cache lookup and query fresh AI completions immediately.

### 5. Git Branch & Commit Diffing Engine
- **Non-Destructive Object Parsing**: Uses `git ls-tree` and `git show` in `repo_parser.py` to parse dependency graphs directly from Git's underlying object store at any branch or commit SHA—without modifying or checking out files in your active working tree.
- **Visual Status Markers**: Compares base and head branches/commits and renders graph elements with explicit visual statuses:
  - **Added Nodes/Edges**: Highlighted in Green.
  - **Removed Nodes/Edges**: Highlighted in Red.
  - **Changed Nodes**: Highlighted in Yellow (detected via SHA256 content hashes).
  - **Unchanged**: Standard styling.
- **Ref Selector Dropdown**: Automatically populates local Git branches and recent 20 commit SHAs via `/api/refs`.

### 6. Contract View Mode
- **API Boundary Isolation**: Toggling "Contract View" dynamically filters out internal directory implementation details, showing only cross-directory dependencies to help software architects analyze public API boundaries between packages and modules.

### 7. Real-Time File System Watcher (WebSockets)
- **Live Watcher (`/ws/watch`)**: Mounts a Python `watchdog` background observer on the target repository directory.
- **Debounced Event Processing**: Uses a 400ms thread timer to debounce fast successive disk events (e.g. multi-file edits or IDE saves) before pushing an updated graph payload over WebSockets to dynamically refresh the React Flow canvas.

### 8. High-Performance SQLite Caching Layer
- **Two-Tier Caching**: Persists both AST parsing data (`loc`, `deps`, language) and LLM summary completions into a local SQLite database (`cache.db`).
- **SHA256 Content Hashing**: Uses content-based hashing rather than timestamps, guaranteeing that unchanged files immediately return cached summaries without invoking network API calls.

---

## Installation & Setup Guide

### Prerequisites
- **Python 3.11+**
- **Node.js (v18+)** and **npm**
- **NVIDIA NIM API Key** (Sign up at [build.nvidia.com](https://build.nvidia.com/))

---

### Backend Setup (FastAPI)

#### Windows (PowerShell)

1. Open PowerShell and navigate to the backend folder:
   ```powershell
   cd repo-analyser/backend
   ```

2. Create a virtual environment:
   ```powershell
   python -m venv env
   ```

3. Enable script execution for the active session (if blocked by default execution policy):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
   ```

4. Activate the virtual environment and install dependencies:
   ```powershell
   .\env\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

5. Set your NVIDIA API Key (either by creating a `backend/.env` file with `NVIDIA_API_KEY="your_key"` or in your shell env) and start the server:
   ```powershell
   $env:NVIDIA_API_KEY="your_nvidia_api_key_here"
   uvicorn main:app --reload --port 8000
   ```

*(Alternative for Windows Command Prompt `cmd.exe`: Use `env\Scripts\activate.bat` and set environment variables using `set NVIDIA_API_KEY=your_key` with no spaces, or use the `.env` file).*

#### Linux / macOS

```bash
cd repo-analyser/backend
python3 -m venv env
source env/bin/activate
pip install -r requirements.txt

NVIDIA_API_KEY="your_nvidia_api_key_here" uvicorn main:app --reload --port 8000
```

The backend API runs on `http://localhost:8000`.

---

### Frontend Setup (Vite + React)

Open a **second terminal window** and run:

```bash
cd repo-analyser/frontend
npm install
npm run dev
```

The web UI will launch at `http://localhost:5173`.

---

## Troubleshooting & Common Issues

| Issue / Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `TypeError: Client.__init__() got an unexpected keyword argument 'proxies'` | Incompatibility between `openai==1.30.1` and `httpx>=0.28.0`. | Ensure `httpx<0.28.0` is installed. Run `.\env\Scripts\python.exe -m pip install "httpx<0.28.0"`. |
| `Activate.ps1 cannot be loaded because running scripts is disabled` | Windows default PowerShell execution policy blocks unsigned scripts. | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` before activating. |
| `The filename, directory name, or volume label syntax is incorrect.` | Entered PowerShell environment variable syntax (`$env:...`) into Command Prompt (`cmd.exe`). | Use `set NVIDIA_API_KEY=your_key` in CMD (without spaces around `=`) or switch to PowerShell. |
| `Site cannot be reached on localhost:5173` | Frontend dev server is not running. | Open a second terminal, navigate to `repo-analyser/frontend`, and run `npm run dev`. |
| App stuck on loading after clicking **Analyse** | Backend server is offline or path entered contains surrounding quotes. | Ensure Uvicorn is running on port 8000 and enter paths without quotation marks (e.g. `C:\Users\Name\Project`). |

---

## Complete API Specification

### 1. Start Graph Parse Job
- **Endpoint**: `POST /api/graph/start`
- **Query Parameter**: `path` (string, absolute repository path)
- **Response**:
  ```json
  {
    "job_id": "c9bf9e57-1685-4c89-bafb-ff5af830be8a"
  }
  ```

### 2. Poll Graph Job Status
- **Endpoint**: `GET /api/graph/status/{job_id}`
- **Response (Running)**:
  ```json
  {
    "status": "running",
    "progress": 14,
    "total": 30
  }
  ```
- **Response (Completed)**:
  ```json
  {
    "status": "done",
    "progress": 30,
    "total": 30,
    "result": {
      "nodes": [{"id": "main.py", "language": "python", "loc": 150}],
      "edges": [{"source": "main.py", "target": "repo_parser.py"}]
    }
  }
  ```

### 3. Generate File Explanation
- **Endpoint**: `POST /api/summarise`
- **Payload**:
  ```json
  {
    "file_path": "backend/main.py",
    "repo_path": "C:/Users/Name/Project"
  }
  ```
- **Response**:
  ```json
  {
    "summary": "This file implements the FastAPI backend server routing, defining REST endpoints for graph analysis and WebSocket observers.",
    "cached": true
  }
  ```

### 4. Repository Architectural Summary ("Explain Repo")
- **Endpoint**: `POST /api/repo-summary`
- **Payload**:
  ```json
  {
    "repo_path": "C:/Users/Name/Project",
    "force": false
  }
  ```
- **Response**:
  ```json
  {
    "summary": "The repository is structured into a Python FastAPI backend and a React Flow frontend. The backend handles static AST analysis while the frontend renders the interactive dependency graph...",
    "cached": false
  }
  ```

### 5. AI Refactor Suggestions
- **Endpoint**: `POST /api/refactor-suggest`
- **Payload**:
  ```json
  {
    "file_path": "backend/models.py",
    "repo_path": "C:/Users/Name/Project",
    "fan_in": 12
  }
  ```
- **Response**:
  ```json
  {
    "suggestions": [
      "Extract database connection utilities into `db_config.py` to decouple core models.",
      "Move data validation schemas into a dedicated `schemas/` directory."
    ],
    "cached": false
  }
  ```

### 6. Fetch Git References
- **Endpoint**: `GET /api/refs?path=<abs_path>`
- **Response**:
  ```json
  {
    "branches": ["main", "feature/diff-view"],
    "current_branch": "main",
    "recent_commits": [
      {"sha": "a1b2c3d", "subject": "Fix modal scrolling issue"}
    ]
  }
  ```

### 7. Compare Git References (Diff Mode)
- **Endpoint**: `GET /api/diff?path=<abs_path>&base=main&head=feature/diff-view`
- **Response**:
  ```json
  {
    "base_sha": "a1b2c3d4e5f...",
    "head_sha": "f9e8d7c6b5a...",
    "nodes": [
      {"id": "new_feature.py", "language": "python", "loc": 85, "status": "added"}
    ],
    "edges": [
      {"source": "main.py", "target": "new_feature.py", "status": "added"}
    ],
    "summary": {"added": 1, "removed": 0, "changed": 2, "unchanged": 25}
  }
  ```

---

## Database & Caching Schema

The local SQLite database (`backend/cache.db`) uses the following table schemas:

### Table: `summaries`
Stores AI-generated explanations and architectural overviews indexed by file path and content hash.
```sql
CREATE TABLE IF NOT EXISTS summaries (
    file_path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    summary TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `file_parses`
Stores static AST file analysis (language, LOC, dependencies) indexed by relative path.
```sql
CREATE TABLE IF NOT EXISTS file_parses (
    rel_path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    lang TEXT NOT NULL,
    loc INTEGER NOT NULL,
    deps TEXT NOT NULL, -- JSON formatted string array of relative paths
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
