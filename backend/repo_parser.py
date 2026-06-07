import os
import ast
import re

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
        # Count non-empty lines
        return sum(1 for line in lines if line.strip())
    except Exception:
        return 0

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
    except Exception:
        pass
    return imports

def extract_js_ts_imports(file_path: str) -> list[str]:
    """
    Extracts relative imports from JS/TS files using regex.
    """
    imports = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        # Matches import x from './y' or import './y' or require('./y')
        # We target strings starting with ./ or ../
        import_patterns = [
            r"import\s+(?:(?:\s*[a-zA-Z0-9_${},*\s]+\s+from\s+)|(?:\s*))['\"](\.\.?/[^'\"]+)['\"]",
            r"require\(\s*['\"](\.\.?/[^'\"]+)['\"]\s*\)",
            r"import\(\s*['\"](\.\.?/[^'\"]+)['\"]\s*\)"
        ]
        
        for pattern in import_patterns:
            matches = re.findall(pattern, content)
            for m in matches:
                imports.append(m)
    except Exception:
        pass
    return imports

def parse_repo(root_path: str) -> dict:
    root_path = os.path.abspath(root_path)
    if not os.path.exists(root_path):
        return {"nodes": [], "edges": []}

    all_files = []
    
    # 1. Walk the directory tree and find all files
    for root, dirs, files in os.walk(root_path):
        # Exclude directories in-place to avoid traversing them
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

    # Create a quick lookup set of all relative paths for matching
    rel_path_set = {f["rel_path"] for f in all_files}
    
    nodes = []
    edges = []

    # 2. Extract dependencies for each file
    for f_info in all_files:
        rel_path = f_info["rel_path"]
        full_path = f_info["full_path"]
        lang = f_info["language"]
        loc = f_info["loc"]
        
        nodes.append({
            "id": rel_path,
            "language": lang,
            "loc": loc
        })
        
        dependencies = []
        
        if lang == "python":
            raw_imports = extract_python_imports(full_path)
            current_dir = os.path.dirname(rel_path)
            
            for mod_name, level in raw_imports:
                resolved_rel = None
                
                # Relative import
                if level > 0:
                    # level 1 = current dir, level 2 = parent dir, etc.
                    parts = current_dir.split("/") if current_dir else []
                    for _ in range(level - 1):
                        if parts:
                            parts.pop()
                    base_dir = "/".join(parts) if parts else ""
                    
                    # Convert module name (e.g., 'utils.foo') to path
                    mod_path = mod_name.replace(".", "/")
                    target = f"{base_dir}/{mod_path}".strip("/") if base_dir else mod_path
                    
                    # Check target.py or target/__init__.py
                    if f"{target}.py" in rel_path_set:
                        resolved_rel = f"{target}.py"
                    elif f"{target}/__init__.py" in rel_path_set:
                        resolved_rel = f"{target}/__init__.py"
                
                # Absolute or relative package-level import
                else:
                    mod_path = mod_name.replace(".", "/")
                    
                    # Try resolving from current directory first
                    target_local = f"{current_dir}/{mod_path}".strip("/") if current_dir else mod_path
                    if f"{target_local}.py" in rel_path_set:
                        resolved_rel = f"{target_local}.py"
                    elif f"{target_local}/__init__.py" in rel_path_set:
                        resolved_rel = f"{target_local}/__init__.py"
                    
                    # If not found, try resolving from repo root
                    if not resolved_rel:
                        if f"{mod_path}.py" in rel_path_set:
                            resolved_rel = f"{mod_path}.py"
                        elif f"{mod_path}/__init__.py" in rel_path_set:
                            resolved_rel = f"{mod_path}/__init__.py"
                
                if resolved_rel and resolved_rel != rel_path:
                    dependencies.append(resolved_rel)
                    
        elif lang in ("javascript", "typescript"):
            raw_imports = extract_js_ts_imports(full_path)
            current_dir = os.path.dirname(rel_path)
            
            for imp_path in raw_imports:
                # Resolve the relative path
                resolved_rel = None
                target_base = os.path.normpath(os.path.join(current_dir, imp_path)).replace("\\", "/")
                if target_base.startswith("../"):
                    # Outside repository root
                    continue
                
                # Check directly if it exists
                if target_base in rel_path_set:
                    resolved_rel = target_base
                else:
                    # Try common extensions
                    for ext in [".ts", ".tsx", ".js", ".jsx", ".d.ts"]:
                        if f"{target_base}{ext}" in rel_path_set:
                            resolved_rel = f"{target_base}{ext}"
                            break
                    
                    # Try index files inside directory
                    if not resolved_rel:
                        for ext in [".ts", ".tsx", ".js", ".jsx"]:
                            if f"{target_base}/index{ext}" in rel_path_set:
                                resolved_rel = f"{target_base}/index{ext}"
                                break
                                
                if resolved_rel and resolved_rel != rel_path:
                    dependencies.append(resolved_rel)
                    
        # Add edges, deduplicated
        for dep in sorted(set(dependencies)):
            edges.append({
                "source": rel_path,
                "target": dep
            })

    return {"nodes": nodes, "edges": edges}
