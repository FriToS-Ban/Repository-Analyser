import sqlite3
import os

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
    conn.commit()
    conn.close()

def get_summary(file_path: str, content_hash: str) -> str | None:
    init_db()
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
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO summaries (file_path, content_hash, summary) VALUES (?, ?, ?)",
        (file_path, content_hash, summary)
    )
    conn.commit()
    conn.close()
