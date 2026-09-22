from __future__ import annotations

import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[2] / "paperpilot-ml"
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))


def _merge_fill(base: dict, extra: dict) -> dict:
    """Keep regex/extracted values; fill only keys the rule engine did not set."""
    out = dict(base or {})
    for key, value in (extra or {}).items():
        if isinstance(value, dict):
            current = out.get(key) if isinstance(out.get(key), dict) else {}
            merged = dict(value)
            merged.update(current)
            if key == "font":
                families = list(current.get("families") or [])
                for family in value.get("families") or []:
                    if family not in families:
                        families.append(family)
                if families:
                    merged["families"] = families
                    merged.setdefault("type", families[0])
                sizes = list(current.get("sizes_points") or [])
                for size in value.get("sizes_points") or []:
                    if size not in sizes:
                        sizes.append(size)
                if sizes:
                    merged["sizes_points"] = sizes
            out[key] = merged
        elif isinstance(value, list):
            current = list(out.get(key) or [])
            for item in value:
                if item not in current:
                    current.append(item)
            out[key] = current[:12]
        elif key not in out or out.get(key) in (None, "", [], {}):
            out[key] = value
    return out


def enrich_mechanics_rules(text: str, rules: dict) -> dict:
    try:
        from train.mechanics_extract import extract_mechanics_with_ml, model_available
    except Exception:
        return rules
    if not model_available():
        return rules
    try:
        predicted = extract_mechanics_with_ml(text)
    except Exception:
        return rules
    return _merge_fill(rules, predicted)
