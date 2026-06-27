import sqlite3
import os
import json as _json

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS summaries (
      file_path TEXT PRIMARY KEY,
      content_hash TEXT,
      summary TEXT
    )
    """)
    # Incremental parse cache: stores per-file parse results so only changed
    # files need to be re-parsed on subsequent calls to parse_repo().
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS parse_cache (
      rel_path     TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      language     TEXT NOT NULL,
      loc          INTEGER NOT NULL,
      deps         TEXT NOT NULL,
      PRIMARY KEY (rel_path, content_hash)
    )
    """)
    conn.commit()
    conn.close()

def get_summary(file_path: str, content_hash: str) -> str | None:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT summary FROM summaries WHERE file_path = ? AND content_hash = ?",
        (file_path, content_hash)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        return row[0]
    return None

def set_summary(file_path: str, content_hash: str, summary: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO summaries (file_path, content_hash, summary) VALUES (?, ?, ?)",
        (file_path, content_hash, summary)
    )
    conn.commit()
    conn.close()

# ---------------------------------------------------------------------------
# Per-file parse cache (used by parse_repo for incremental re-analysis)
# ---------------------------------------------------------------------------

def get_file_parse(rel_path: str, content_hash: str) -> dict | None:
    """
    Return cached parse result for a file if the content hash matches.
    Returns a dict with keys: language, loc, deps (list[str]).
    Returns None on a cache miss.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT language, loc, deps FROM parse_cache WHERE rel_path = ? AND content_hash = ?",
        (rel_path, content_hash)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"language": row[0], "loc": row[1], "deps": _json.loads(row[2])}
    return None

def set_file_parse(rel_path: str, content_hash: str, language: str, loc: int, deps: list[str]):
    """Persist a file's parse result so future runs can skip re-parsing unchanged files."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO parse_cache (rel_path, content_hash, language, loc, deps) VALUES (?, ?, ?, ?, ?)",
        (rel_path, content_hash, language, loc, _json.dumps(deps))
    )
    conn.commit()
    conn.close()

init_db()