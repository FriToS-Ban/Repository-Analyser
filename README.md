# Repository Structure Analysis & Visualisation System

An interactive tool that parses a local Git repository, builds a visual dependency graph using React Flow, and generates AI-powered file summaries using the NVIDIA NIM API.

## Project Architecture

```text
repo-analyser/
├── backend/
│   ├── main.py            # FastAPI app, routes, NIM integration
│   ├── repo_parser.py     # filesystem and git-ref dependency parser
│   ├── cache.py           # SQLite cache for AI summaries
│   ├── cache.db           # local SQLite cache file (auto-created)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── Graph.tsx
│   │   │   ├── FileNode.tsx
│   │   │   ├── FolderGroupNode.tsx
│   │   │   └── SidePanel.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Quick Start Setup

### Prerequisites

- Python 3.11+
- Node.js (v18+) and npm
- NVIDIA NIM API Key (Sign up at [build.nvidia.com](https://build.nvidia.com/))

### 1. Running the Backend

```bash
cd repo-analyser/backend
pip install -r requirements.txt

# Windows PowerShell
$env:NVIDIA_API_KEY="your_api_key_here"
uvicorn main:app --reload --port 8000

# Linux/macOS
NVIDIA_API_KEY="your_api_key_here" uvicorn main:app --reload --port 8000
```

### 2. Running the Frontend

```bash
cd repo-analyser/frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

> If `NVIDIA_API_KEY` is not set, the backend returns a local placeholder summary so the UI remains usable during development.

## Backend Overview

### API Routes

- `GET /api/graph?path=<absolute_repo_path>`
  - Parses the repository filesystem and returns `nodes` + `edges`.
- `POST /api/summarise`
  - Body: `{ "file_path": str, "repo_path": str }`
  - Returns a cached or live AI summary for the selected file.
- `GET /api/refs?path=<absolute_repo_path>`
  - Returns local Git branches and recent commits for the diff selector.
- `GET /api/diff?path=<absolute_repo_path>&base=<ref>&head=<ref>`
  - Returns node/edge diff status between two Git refs.

### Backend Implementation

- `backend/repo_parser.py` walks the repository tree while skipping `node_modules`, `.git`, `__pycache__`, `dist`, `build`, `.venv`, `venv`, `.idea`, and `.vscode`.
- Python dependencies are extracted using `ast` and resolved only if they map to files inside the repo.
- JS/TS dependencies are extracted using regex for relative imports (`./` / `../`) and dynamic `require(...)` / `import(...)` paths.
- `backend/cache.py` uses SQLite to cache summaries by file path and content hash.

## Frontend Overview

- `frontend/src/App.tsx` accepts an absolute local repo path and loads the graph from `/api/graph`.
- `frontend/src/components/Graph.tsx` renders React Flow nodes and edges with:
  - folder grouping,
  - minimap,
  - fit-to-view,
  - language filters,
  - search,
  - PNG export,
  - circular dependency highlighting,
  - diff-mode edge styling.
- `frontend/src/components/SidePanel.tsx` slides in on node click and displays:
  - full file path,
  - language,
  - lines of code,
  - AI summary,
  - copy-to-clipboard button,
  - loading state.

## Key Features

- Language-colored graph nodes for Python, JavaScript, TypeScript, and other supported file types.
- Line-of-code metadata per node.
- Click a file node to load an AI-generated explanation from NVIDIA NIM.
- Local SQLite caching so unchanged files reuse previously generated summaries.
- Git diff mode with branch/commit selectors and added/removed/changed highlights.
- Export the graph canvas as a PNG image.
- Search file names and filter by language.

## Dependencies

### Backend

- `fastapi`
- `uvicorn[standard]`
- `openai`
- `pydantic`

### Frontend

- `react`
- `react-dom`
- `reactflow`
- `lucide-react`
- `html-to-image`
- `vite`
- `typescript`
- `tailwindcss`

## Notes

- The frontend expects the backend at `http://localhost:8000`.
- The backend reads `NVIDIA_API_KEY` from the environment to call NVIDIA NIM via the OpenAI-compatible SDK.
- Files larger than 500KB are not summarised by AI and return a friendly message instead.

