import os
import sys
import ast
import re
import subprocess
import tempfile
import shutil

# Excluded directories
EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    "dist",
    "build",
    ".venv",
    "venv",
    ".idea",
    ".vscode"
}

# Top-level stdlib module names, used to avoid resolving e.g. `import types`
# to a local types.py file that happens to share the name.
STDLIB_MODULES = set(sys.stdlib_module_names)

def get_language(extension: str) -> str:
    ext = extension.lower()
    if ext == ".py":
        return "python"
    elif ext in (".js", ".jsx"):
        return "javascript"
    elif ext in (".ts", ".tsx"):
        return "typescript"
    return "other"

def count_loc(file_path: str) -> int:
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        return sum(1 for line in lines if line.strip())
    except Exception as e:
        print(f"[parser] Failed to read {file_path}: {e}", file=sys.stderr)
        return 0

def count_loc_from_content(content: str) -> int:
    return sum(1 for line in content.splitlines() if line.strip())

def extract_python_imports(file_path: str) -> list[tuple[str, int]]:
    """
    Extracts imports using python's AST.
    Returns a list of tuples: (module_name, level)
    Where level is the relative import level (0 for absolute, >0 for relative).
    """
    imports = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        tree = ast.parse(content, filename=file_path)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append((alias.name, 0))
            elif isinstance(node, ast.ImportFrom):
                imports.append((node.module or "", node.level))
    except Exception as e:
        print(f"[parser] Failed to parse Python imports in {file_path}: {e}", file=sys.stderr)
    return imports

def extract_python_imports_from_content(content: str, filename: str = "<unknown>") -> list[tuple[str, int]]:
    """AST-based Python import extraction from a content string (for git-ref parsing)."""
    imports = []
    try:
        tree = ast.parse(content, filename=filename)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append((alias.name, 0))
            elif isinstance(node, ast.ImportFrom):
                imports.append((node.module or "", node.level))
    except Exception as e:
        print(f"[parser] Failed to parse Python imports in {filename}: {e}", file=sys.stderr)
    return imports

def extract_js_ts_imports(file_path: str) -> list[str]:
    """
    Extracts relative imports from JS/TS files using regex.
    """
    imports = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        import_patterns = [
            r"import\s+(?:(?:\s*[a-zA-Z0-9_${},*\s]+\s+from\s+)|(?:\s*))['\"](\.\.?/[^'\"]+)['\"]",
            r"require\(\s*['\"](\.\.?/[^'\"]+)['\"]\s*\)",
            r"import\(\s*['\"](\.\.?/[^'\"]+)['\"]\s*\)"
        ]
        
        for pattern in import_patterns:
            matches = re.findall(pattern, content)
            for m in matches:
                imports.append(m)
    except Exception as e:
        print(f"[parser] Failed to parse JS/TS imports in {file_path}: {e}", file=sys.stderr)
    return imports

def extract_js_ts_imports_from_content(content: str) -> list[str]:
    """Regex-based JS/TS import extraction from a content string (for git-ref parsing)."""
    imports = []
    import_patterns = [
        r"import\s+(?:(?:\s*[a-zA-Z0-9_${},*\s]+\s+from\s+)|(?:\s*))['\"](\.\.?/[^'\"]+)['\"]",
        r"require\(\s*['\"](\.\.?/[^'\"]+)['\"]\s*\)",
        r"import\(\s*['\"](\.\.?/[^'\"]+)['\"]\s*\)"
    ]
    for pattern in import_patterns:
        matches = re.findall(pattern, content)
        imports.extend(matches)
    return imports


# ---------------------------------------------------------------------------
# Core parse logic — shared between filesystem parse and git-ref parse
# ---------------------------------------------------------------------------

def _resolve_python_deps(
    rel_path: str,
    raw_imports: list[tuple[str, int]],
    rel_path_set: set[str]
) -> list[str]:
    """Resolve raw Python import tuples to relative repo paths."""
    deps = []
    current_dir = os.path.dirname(rel_path)
    for mod_name, level in raw_imports:
        resolved_rel = None
        if level > 0:
            parts = current_dir.split("/") if current_dir else []
            for _ in range(level - 1):
                if parts:
                    parts.pop()
            base_dir = "/".join(parts) if parts else ""
            mod_path = mod_name.replace(".", "/")
            target = f"{base_dir}/{mod_path}".strip("/") if base_dir else mod_path
            if f"{target}.py" in rel_path_set:
                resolved_rel = f"{target}.py"
            elif f"{target}/__init__.py" in rel_path_set:
                resolved_rel = f"{target}/__init__.py"
        else:
            top_level_mod = mod_name.split(".")[0]
            if top_level_mod in STDLIB_MODULES:
                continue
            mod_path = mod_name.replace(".", "/")
            target_local = f"{current_dir}/{mod_path}".strip("/") if current_dir else mod_path
            if f"{target_local}.py" in rel_path_set:
                resolved_rel = f"{target_local}.py"
            elif f"{target_local}/__init__.py" in rel_path_set:
                resolved_rel = f"{target_local}/__init__.py"
            if not resolved_rel:
                if f"{mod_path}.py" in rel_path_set:
                    resolved_rel = f"{mod_path}.py"
                elif f"{mod_path}/__init__.py" in rel_path_set:
                    resolved_rel = f"{mod_path}/__init__.py"
        if resolved_rel and resolved_rel != rel_path:
            deps.append(resolved_rel)
    return deps


def _resolve_js_ts_deps(
    rel_path: str,
    raw_imports: list[str],
    rel_path_set: set[str],
    root_path: str
) -> list[str]:
    """Resolve raw JS/TS import strings to relative repo paths."""
    deps = []
    current_dir = os.path.dirname(rel_path)
    for imp_path in raw_imports:
        resolved_rel = None
        target_base = os.path.normpath(os.path.join(current_dir, imp_path)).replace("\\", "/")
        target_abs = os.path.abspath(os.path.join(root_path, target_base))
        if os.path.commonpath([root_path, target_abs]) != root_path:
            continue
        if target_base in rel_path_set:
            resolved_rel = target_base
        else:
            for ext in [".ts", ".tsx", ".js", ".jsx", ".d.ts"]:
                if f"{target_base}{ext}" in rel_path_set:
                    resolved_rel = f"{target_base}{ext}"
                    break
            if not resolved_rel:
                for ext in [".ts", ".tsx", ".js", ".jsx"]:
                    if f"{target_base}/index{ext}" in rel_path_set:
                        resolved_rel = f"{target_base}/index{ext}"
                        break
        if resolved_rel and resolved_rel != rel_path:
            deps.append(resolved_rel)
    return deps


# ---------------------------------------------------------------------------
# Filesystem-based parse (original behaviour)
# ---------------------------------------------------------------------------

def parse_repo(root_path: str) -> dict:
    root_path = os.path.abspath(root_path)
    if not os.path.exists(root_path):
        return {"nodes": [], "edges": []}

    all_files = []
    
    for root, dirs, files in os.walk(root_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, root_path).replace("\\", "/")
            _, ext = os.path.splitext(file)
            lang = get_language(ext)
            loc = count_loc(full_path)
            all_files.append({
                "rel_path": rel_path,
                "full_path": full_path,
                "language": lang,
                "loc": loc,
                "ext": ext.lower()
            })

    rel_path_set = {f["rel_path"] for f in all_files}
    nodes = []
    edges = []

    for f_info in all_files:
        rel_path = f_info["rel_path"]
        full_path = f_info["full_path"]
        lang = f_info["language"]
        loc = f_info["loc"]
        
        nodes.append({"id": rel_path, "language": lang, "loc": loc})
        
        dependencies = []
        if lang == "python":
            raw_imports = extract_python_imports(full_path)
            dependencies = _resolve_python_deps(rel_path, raw_imports, rel_path_set)
        elif lang in ("javascript", "typescript"):
            raw_imports = extract_js_ts_imports(full_path)
            dependencies = _resolve_js_ts_deps(rel_path, raw_imports, rel_path_set, root_path)

        for dep in sorted(set(dependencies)):
            edges.append({"source": rel_path, "target": dep})

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Git-ref-based parse (for diff mode)
# ---------------------------------------------------------------------------

def _run_git(args: list[str], cwd: str) -> subprocess.CompletedProcess:
    """Run a git command and return the CompletedProcess result."""
    return subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True
    )

def _list_git_ref_files(repo_path: str, ref: str) -> list[str]:
    """
    Return all tracked file paths at a given git ref.
    Uses `git ls-tree -r --name-only <ref>` which is fast and allocation-free.
    """
    result = _run_git(["ls-tree", "-r", "--name-only", ref], cwd=repo_path)
    if result.returncode != 0:
        err = result.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(f"git ls-tree failed for ref '{ref}': {err}")
    paths = result.stdout.decode("utf-8", errors="replace").splitlines()
    # Filter out excluded directories (match first path component)
    filtered = []
    for p in paths:
        parts = p.replace("\\", "/").split("/")
        if not any(part in EXCLUDE_DIRS for part in parts):
            filtered.append(p.replace("\\", "/"))
    return filtered

def _read_git_file(repo_path: str, ref: str, rel_path: str) -> str | None:
    """
    Read a file's content at a specific git ref using `git show <ref>:<path>`.
    Returns None if the file cannot be read.
    """
    result = _run_git(["show", f"{ref}:{rel_path}"], cwd=repo_path)
    if result.returncode != 0:
        return None
    return result.stdout.decode("utf-8", errors="replace")

def parse_repo_at_ref(repo_path: str, ref: str) -> dict:
    """
    Parse a repository's dependency graph at a specific git ref (branch name,
    tag, or commit SHA) WITHOUT checking out the branch. Reads file contents
    directly from git's object store via `git show`.

    Returns the same shape as `parse_repo`: {"nodes": [...], "edges": [...]}
    with an additional "content_hash" key per node used for change detection.
    """
    import hashlib

    repo_path = os.path.abspath(repo_path)

    # Validate that this is actually a git repo
    check = _run_git(["rev-parse", "--git-dir"], cwd=repo_path)
    if check.returncode != 0:
        raise ValueError(f"'{repo_path}' is not a git repository.")

    # Resolve the ref to a full commit SHA for stability
    rev_result = _run_git(["rev-parse", "--verify", ref], cwd=repo_path)
    if rev_result.returncode != 0:
        err = rev_result.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(f"Cannot resolve git ref '{ref}': {err}")
    resolved_sha = rev_result.stdout.decode().strip()

    all_rel_paths = _list_git_ref_files(repo_path, resolved_sha)

    # Build a lookup: rel_path -> (language, content, loc, content_hash)
    file_info_map: dict[str, dict] = {}
    for rel_path in all_rel_paths:
        _, ext = os.path.splitext(rel_path)
        lang = get_language(ext)
        content = _read_git_file(repo_path, resolved_sha, rel_path)
        if content is None:
            continue
        loc = count_loc_from_content(content)
        content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()
        file_info_map[rel_path] = {
            "language": lang,
            "content": content,
            "loc": loc,
            "content_hash": content_hash,
        }

    rel_path_set = set(file_info_map.keys())
    nodes = []
    edges = []

    for rel_path, info in file_info_map.items():
        lang = info["language"]
        nodes.append({
            "id": rel_path,
            "language": lang,
            "loc": info["loc"],
            "content_hash": info["content_hash"],
        })

        dependencies = []
        content = info["content"]

        if lang == "python":
            raw_imports = extract_python_imports_from_content(content, filename=rel_path)
            dependencies = _resolve_python_deps(rel_path, raw_imports, rel_path_set)
        elif lang in ("javascript", "typescript"):
            raw_imports = extract_js_ts_imports_from_content(content)
            # JS/TS boundary check needs an absolute root — use repo_path as the anchor
            dependencies = _resolve_js_ts_deps(rel_path, raw_imports, rel_path_set, repo_path)

        for dep in sorted(set(dependencies)):
            edges.append({"source": rel_path, "target": dep})

    return {
        "nodes": nodes,
        "edges": edges,
        "resolved_sha": resolved_sha,
    }


# ---------------------------------------------------------------------------
# Diff computation
# ---------------------------------------------------------------------------

def diff_graphs(base_graph: dict, head_graph: dict) -> dict:
    """
    Compare two parsed graphs (from parse_repo_at_ref) and produce a diff.

    Node status:
        "added"   — present in head, absent in base
        "removed" — present in base, absent in head
        "changed" — present in both, but content_hash differs
        "unchanged" — present in both, same hash

    Edge status:
        "added"   — present in head, absent in base
        "removed" — present in base, absent in head
        "unchanged" — present in both

    Returns:
    {
        "base_sha": str,
        "head_sha": str,
        "nodes": [{"id", "language", "loc", "status"}, ...],
        "edges": [{"source", "target", "status"}, ...],
        "summary": {
            "added": int, "removed": int, "changed": int, "unchanged": int
        }
    }
    """
    base_nodes: dict[str, dict] = {n["id"]: n for n in base_graph["nodes"]}
    head_nodes: dict[str, dict] = {n["id"]: n for n in head_graph["nodes"]}

    all_node_ids = set(base_nodes) | set(head_nodes)

    diff_nodes = []
    summary = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}

    for node_id in sorted(all_node_ids):
        in_base = node_id in base_nodes
        in_head = node_id in head_nodes

        if in_head and not in_base:
            status = "added"
            node = head_nodes[node_id]
        elif in_base and not in_head:
            status = "removed"
            node = base_nodes[node_id]
        else:
            base_hash = base_nodes[node_id].get("content_hash", "")
            head_hash = head_nodes[node_id].get("content_hash", "")
            status = "changed" if base_hash != head_hash else "unchanged"
            node = head_nodes[node_id]

        summary[status] += 1
        diff_nodes.append({
            "id": node["id"],
            "language": node.get("language", "other"),
            "loc": node.get("loc", 0),
            "status": status,
        })

    # Edge diff — use frozenset-safe tuple keys
    base_edges: set[tuple[str, str]] = {(e["source"], e["target"]) for e in base_graph["edges"]}
    head_edges: set[tuple[str, str]] = {(e["source"], e["target"]) for e in head_graph["edges"]}
    all_edges = base_edges | head_edges

    diff_edges = []
    for source, target in sorted(all_edges):
        if (source, target) in head_edges and (source, target) not in base_edges:
            edge_status = "added"
        elif (source, target) in base_edges and (source, target) not in head_edges:
            edge_status = "removed"
        else:
            edge_status = "unchanged"

        diff_edges.append({
            "source": source,
            "target": target,
            "status": edge_status,
        })

    return {
        "base_sha": base_graph.get("resolved_sha", ""),
        "head_sha": head_graph.get("resolved_sha", ""),
        "nodes": diff_nodes,
        "edges": diff_edges,
        "summary": summary,
    }