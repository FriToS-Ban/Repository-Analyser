# Repository Structure Analysis & Visualisation System

An interactive tool that parses a local Git repository, builds a visual dependency graph using React Flow, and generates AI-powered file summaries using the NVIDIA NIM API.

## Project Architecture

```text
repo-analyser/
├── backend/
│   ├── main.py            # FastAPI app, routing, NIM connection
│   ├── parser.py          # Python AST & JS/TS regex dependency parser
│   ├── cache.py           # SQLite caching for file summaries
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Graph.tsx           # React Flow container
│   │   │   ├── FileNode.tsx        # Custom language-styled nodes
│   │   │   ├── FolderGroupNode.tsx # Folder-cluster container nodes
│   │   │   └── SidePanel.tsx       # Detailed info, AI summaries, copy to clipboard
│   │   ├── App.tsx
│   │   └── main.tsx
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

Navigate to the `backend` directory, install python packages, and start the development server:

```bash
cd backend
pip install -r requirements.txt

# On Windows (PowerShell)
$env:NVIDIA_API_KEY="your_api_key_here"
uvicorn main:app --reload --port 8000

# On Linux/macOS
NVIDIA_API_KEY="your_api_key_here" uvicorn main:app --reload --port 8000
```

*Note: If `NVIDIA_API_KEY` is not provided, the backend falls back to generating a mock placeholder summary for local testing.*

### 2. Running the Frontend

Navigate to the `frontend` directory, install node modules, and spin up the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- **Folder-Based Clustering**: Group files by their parent directories visually into containers. Columns are sorted by average dependency depth, resulting in a cleaner, cluster-based mental model.
- **Circular Dependency Detection**: Custom iterative Tarjan's Strongly Connected Components (SCC) algorithm detects cyclic loops. Circular dependency edges are highlighted in **Red** with increased stroke thickness.
- **HD Image Export**: One-click **Export as PNG** functionality using `html-to-image`. Hides controls, minimaps, and overlay panels temporarily during generation for a clean export at `pixelRatio: 2`.
- **Live Language Filters**: Interactive pills to highlight specific languages (Python, TS, JS, etc.) dynamically, fading out other nodes.
- **Repository Statistics**: Header dashboard displaying total analyzed files, cumulative lines of code (LOC), and a relative percentage breakdown of the codebase languages.
- **AST-Based Parsing**: Resolves Python `import` statements natively using Python's `ast` library.
- **Regex Parsing**: Resolves relative JavaScript and TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`) imports and dynamic requires.
- **AI File Summaries**: One-click AI explanation queries using NVIDIA NIM `meta/llama-3.1-8b-instruct` with a "Copy Summary" clipboard helper in the side panel.
- **SQLite Performance Caching**: Fast reload on cached file hashes so that identical files don't cost API credits or cause lag.

