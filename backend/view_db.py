import os
import sqlite3

# Connect to the local cache database (relative to this script's folder)
db_path = os.path.join(os.path.dirname(__file__), "cache.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("==================================================")
print("              DATABASE SCHEMAS & TABLES           ")
print("==================================================")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(f"Detected Tables: {tables}")

print("\n==================================================")
print("    FILE PARSES DATA (file_parses Table)          ")
print("==================================================")
try:
    cursor.execute("SELECT rel_path, content_hash, language, loc FROM parse_cache LIMIT 2;")
    rows = cursor.fetchall()
    if not rows:
        print("Table is currently empty.")
    for row in rows:
        print(f"File Path   : {row[0]}")
        print(f"SHA256 Hash : {row[1][:20]}...")
        print(f"Language    : {row[2]}")
        print(f"Lines of Code: {row[3]}")
        print("-" * 35)
except Exception as e:
    print(f"Error: {e}")

print("\n==================================================")
print("    AI EXPLANATION SUMMARIES (summaries Table)    ")
print("==================================================")
try:
    cursor.execute("SELECT file_path, content_hash, summary FROM summaries LIMIT 2;")
    rows = cursor.fetchall()
    if not rows:
        print("Table is currently empty.")
    for row in rows:
        print(f"File Path   : {row[0]}")
        print(f"SHA256 Hash : {row[1][:20]}...")
        print(f"AI Summary  : {row[2][:120]}...")
        print("-" * 35)
except Exception as e:
    print(f"Error: {e}")

conn.close()
