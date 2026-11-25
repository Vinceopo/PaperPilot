"""Find module-level call targets that are not defined in compliance.py."""
from __future__ import annotations

import ast
import builtins
import sys
from pathlib import Path


def audit(path: Path) -> dict[str, list[str]]:
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src, filename=str(path))

    defined: set[str] = set(dir(builtins))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    defined.add(target.id)
                elif isinstance(target, (ast.Tuple, ast.List)):
                    for elt in target.elts:
                        if isinstance(elt, ast.Name):
                            defined.add(elt.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            defined.add(node.target.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                defined.add(alias.asname or alias.name.split(".")[0])

    missing: dict[str, list[str]] = {}
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        local = {arg.arg for arg in node.args.args}
        local |= {arg.arg for arg in node.args.kwonlyargs}
        if node.args.vararg:
            local.add(node.args.vararg.arg)
        if node.args.kwarg:
            local.add(node.args.kwarg.arg)
        for child in ast.walk(node):
            if child is node:
                continue
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                local.add(child.name)
            if isinstance(child, ast.Assign):
                for target in child.targets:
                    if isinstance(target, ast.Name):
                        local.add(target.id)
            if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
                local.add(child.target.id)
            if isinstance(child, (ast.Import, ast.ImportFrom)):
                for alias in child.names:
                    local.add(alias.asname or alias.name.split(".")[0])
        for child in ast.walk(node):
            if not (isinstance(child, ast.Call) and isinstance(child.func, ast.Name)):
                continue
            name = child.func.id
            if name in defined or name in local or name.startswith("__"):
                continue
            missing.setdefault(name, []).append(f"{node.name}:{child.lineno}")
    return missing


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        root = Path(__file__).resolve().parents[1]
        paths = [
            root / "machinelearning" / "app" / "compliance.py",
            root / "api" / "app" / "compliance.py",
        ]
    exit_code = 0
    for path in paths:
        print(f"=== {path} ===")
        if not path.exists():
            print("MISSING FILE")
            exit_code = 1
            continue
        missing = audit(path)
        if not missing:
            print("OK: no undefined module-level call targets found")
            continue
        exit_code = 1
        for name, locs in sorted(missing.items()):
            shown = ", ".join(locs[:10])
            extra = f" (+{len(locs) - 10} more)" if len(locs) > 10 else ""
            print(f"  {name}: {shown}{extra}")
        print(f"count={len(missing)}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
