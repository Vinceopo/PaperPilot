"""Catch common call/signature mismatches in compliance.py via AST + inspect."""
from __future__ import annotations

import ast
import importlib.util
import inspect
import sys
from pathlib import Path


def load_module(path: Path):
    spec = importlib.util.spec_from_file_location("compliance_under_audit", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    # Ensure package-relative imports work when loading ML/API compliance.
    root = path.parents[1]
    sys.path.insert(0, str(root))
    try:
        spec.loader.exec_module(module)
    finally:
        if sys.path and sys.path[0] == str(root):
            sys.path.pop(0)
    return module


def audit(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src, filename=str(path))
    module = load_module(path)
    errors: list[str] = []

    # Map function defs to their Call nodes that use Name targets.
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for child in ast.walk(node):
            if not (isinstance(child, ast.Call) and isinstance(child.func, ast.Name)):
                continue
            name = child.func.id
            target = getattr(module, name, None)
            if target is None or not callable(target):
                # Undefined names are covered by the other audit.
                continue
            try:
                sig = inspect.signature(target)
            except (TypeError, ValueError):
                continue
            # Count positional args actually passed (starargs make this uncertain).
            if any(isinstance(arg, ast.Starred) for arg in child.args):
                continue
            positional = len(child.args)
            keywords = {kw.arg for kw in child.keywords if kw.arg}
            try:
                sig.bind_partial(
                    *[f"arg{i}" for i in range(positional)],
                    **{k: True for k in keywords if k},
                )
            except TypeError as exc:
                errors.append(f"{node.name}:{child.lineno} call {name}(...): {exc}")
    return errors


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    if not paths:
        root = Path(__file__).resolve().parents[1]
        paths = [
            root / "machinelearning" / "app" / "compliance.py",
            root / "api" / "app" / "compliance.py",
        ]
    code = 0
    for path in paths:
        print(f"=== {path} ===")
        errs = audit(path)
        if not errs:
            print("OK: no signature bind errors found")
            continue
        code = 1
        for err in errs:
            print(" ", err)
        print(f"count={len(errs)}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
