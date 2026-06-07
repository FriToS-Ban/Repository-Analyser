# Repository Structure Analysis & Visualisation System

An interactive tool that parses a local Git repository, builds a visual dependency graph using React Flow, and generates AI-powered file summaries using the NVIDIA NIM API.

## Project Architecture

```text
repo-analyser/
├── backend/
│   ├── main.py          # FastAPI app, routing, NIM connection
│   ├── parser.py        # Python AST & JS/TS regex dependency parser
│   ├── cache.py         # SQLite caching for file summaries
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Graph.tsx       # React Flow container
│   │   │   ├── FileNode.tsx    # Custom language-styled nodes
│   │   │   └── SidePanel.tsx   # Detailed info and AI summaries
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

- **AST-Based Parsing**: Resolves Python `import` statements natively using Python's `ast` library.
- **Regex Parsing**: Resolves relative JavaScript and TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`) imports and dynamic requires.
- **Interactive Visualisation**: Beautiful color-coded node graph indicating file types (Python = Blue, JS = Yellow, TS = Cyan, Other = Grey), lines of code, and relationship lines (smooth-step layout).
- **AI File Summaries**: One-click AI explanation queries using NVIDIA NIM `meta/llama-3.1-8b-instruct`.
- **SQLite Performance Caching**: Fast reload on cached file hashes so that identical files don't cost API credits or cause lag.
