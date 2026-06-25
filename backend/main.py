import os
import hashlib
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

from repo_parser import parse_repo, parse_repo_at_ref, diff_graphs
import cache

app = FastAPI(title="Repository Structure Analysis & Visualisation System")

# Enable CORS for frontend communications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SummariseRequest(BaseModel):
    file_path: str
    repo_path: str


# ---------------------------------------------------------------------------
# Existing endpoints (unchanged)
# ---------------------------------------------------------------------------

@app.get("/api/graph")
def get_graph(path: str = Query(..., description="Absolute path of the Git repository")):
    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Repository path not found.")
    try:
        graph_data = parse_repo(abs_path)
        return graph_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/summarise")
def summarise_file(request: SummariseRequest):
    repo_abs = os.path.abspath(request.repo_path)
    file_abs = os.path.abspath(os.path.join(repo_abs, request.file_path))

    # Ensure file_abs stays inside repo_abs to prevent path traversal
    if os.path.commonpath([repo_abs, file_abs]) != repo_abs:
        raise HTTPException(status_code=400, detail="Invalid file_path: must be inside repo_path.")

    if not os.path.exists(file_abs):
        raise HTTPException(status_code=404, detail=f"File {request.file_path} not found in repository.")
        
    try:
        if os.path.getsize(file_abs) > 500_000:  # 500KB
            return {"summary": "File too large to summarise.", "cached": False}

        with open(file_abs, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        max_chars = 1500 * 4
        if len(content) > max_chars:
            content = content[:max_chars] + "\n[TRUNCATED]..."
            
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        
        cached_summary = cache.get_summary(request.file_path, content_hash)
        if cached_summary:
            return {"summary": cached_summary, "cached": True}
            
        api_key = os.environ.get("NVIDIA_API_KEY")
        if not api_key:
            mock_summary = f"This is a placeholder summary for {request.file_path}. Please set NVIDIA_API_KEY to generate live AI summaries."
            cache.set_summary(request.file_path, content_hash, mock_summary)
            return {"summary": mock_summary, "cached": False}
            
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key
        )
        
        prompt = f"Explain what this code file does in 3 simple sentences. Be concise. File: {request.file_path}\n\n{content}"
        
        response = client.chat.completions.create(
            model="meta/llama-3.1-8b-instruct",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        
        summary = response.choices[0].message.content.strip()
        cache.set_summary(request.file_path, content_hash, summary)
        
        return {"summary": summary, "cached": False}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# New: /api/refs — list branches and recent commits for the ref selector UI
# ---------------------------------------------------------------------------

@app.get("/api/refs")
def get_refs(path: str = Query(..., description="Absolute path of the Git repository")):
    """
    Returns local branches and the 20 most recent commits (short SHA + message)
    so the frontend can populate its ref-selector dropdowns without the user
    having to type raw SHAs.
    """
    import subprocess

    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Repository path not found.")

    def run(args: list[str]):
        return subprocess.run(
            ["git"] + args,
            cwd=abs_path,
            capture_output=True,
        )

    # Branches
    branch_result = run(["branch", "--format=%(refname:short)"])
    if branch_result.returncode != 0:
        raise HTTPException(status_code=500, detail="Failed to list git branches. Is this a git repository?")
    branches = [b.strip() for b in branch_result.stdout.decode().splitlines() if b.strip()]

    # Current branch (for default selection)
    head_result = run(["rev-parse", "--abbrev-ref", "HEAD"])
    current_branch = head_result.stdout.decode().strip() if head_result.returncode == 0 else ""

    # Recent commits: short SHA + subject line
    log_result = run([
        "log", "--oneline", "--no-decorate", "-20",
        "--pretty=format:%h|||%s"
    ])
    commits = []
    if log_result.returncode == 0:
        for line in log_result.stdout.decode().splitlines():
            if "|||" in line:
                sha, _, subject = line.partition("|||")
                commits.append({"sha": sha.strip(), "subject": subject.strip()})

    return {
        "branches": branches,
        "current_branch": current_branch,
        "recent_commits": commits,
    }


# ---------------------------------------------------------------------------
# New: /api/diff — compare two git refs and return a full diff graph
# ---------------------------------------------------------------------------

@app.get("/api/diff")
def get_diff(
    path: str = Query(..., description="Absolute path of the Git repository"),
    base: str = Query(..., description="Base git ref (branch name, tag, or commit SHA)"),
    head: str = Query(..., description="Head git ref to compare against base"),
):
    """
    Parses the repository dependency graph at both `base` and `head` refs
    (without touching the working tree) and returns a diff graph where every
    node and edge carries a `status` field:

    - Node status: "added" | "removed" | "changed" | "unchanged"
    - Edge status: "added" | "removed" | "unchanged"

    Also returns `summary` counts and the resolved commit SHAs for both refs.

    Example:
        GET /api/diff?path=/home/user/myrepo&base=main&head=feature/my-branch
    """
    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Repository path not found.")

    if not base.strip():
        raise HTTPException(status_code=422, detail="'base' ref must not be empty.")
    if not head.strip():
        raise HTTPException(status_code=422, detail="'head' ref must not be empty.")

    try:
        base_graph = parse_repo_at_ref(abs_path, base.strip())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse base ref '{base}': {e}")

    try:
        head_graph = parse_repo_at_ref(abs_path, head.strip())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse head ref '{head}': {e}")

    try:
        result = diff_graphs(base_graph, head_graph)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diff computation failed: {e}")

    return result