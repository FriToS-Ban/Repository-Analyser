import os
import hashlib
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

from repo_parser import parse_repo
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
    # (e.g. file_path="../../../../etc/passwd").
    if os.path.commonpath([repo_abs, file_abs]) != repo_abs:
        raise HTTPException(status_code=400, detail="Invalid file_path: must be inside repo_path.")

    if not os.path.exists(file_abs):
        raise HTTPException(status_code=404, detail=f"File {request.file_path} not found in repository.")
        
    try:
        if os.path.getsize(file_abs) > 500_000:  # 500KB
            return {"summary": "File too large to summarise.", "cached": False}

        # Read the file content
        with open(file_abs, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        # Tokenate to ~1500 tokens (2000 is too risky for 8B model)
        # 1 token ≈ 4 chars
        max_chars = 1500 * 4 
        if len(content) > max_chars:
            content = content[:max_chars] + "\n[TRUNCATED]..."
            
        # Calculate SHA256 content hash
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        
        # Check cache
        cached_summary = cache.get_summary(request.file_path, content_hash)
        if cached_summary:
            return {"summary": cached_summary, "cached": True}
            
        # If cache miss, request AI summary from NVIDIA NIM
        api_key = os.environ.get("NVIDIA_API_KEY")
        if not api_key:
            # Fallback mock summary for testing if API key is not set
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
        
        # Cache the result
        cache.set_summary(request.file_path, content_hash, summary)
        
        return {"summary": summary, "cached": False}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))