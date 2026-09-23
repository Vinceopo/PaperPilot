from __future__ import annotations

BREAKDOWN_ORDER = ("Fonts", "Margins", "Indentation", "Spacing", "Alignment")


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, value)), 2)


def build_scoring_payload(stats: dict, issues: list[dict]) -> dict:
    total_checked = sum(item.checked for item in stats.values())
    total_failed = sum(item.failed for item in stats.values())
    total_passed = max(0, total_checked - total_failed)
    right_pct = _clamp(100.0 * total_passed / total_checked) if total_checked else 100.0
    wrong_pct = round(100.0 - right_pct, 2)

    fail_by_category = {name: stats[name].failed for name in BREAKDOWN_ORDER if name in stats}
    total_category_failures = sum(fail_by_category.values())
    category_wrong_pct: list[dict] = []
    for name in BREAKDOWN_ORDER:
        failed = fail_by_category.get(name, 0)
        share = (100.0 * failed / total_category_failures) if total_category_failures else 0.0
        category_wrong_pct.append(
            {
                "category": name,
                "wrong_pct": round(share, 2),
                "failed_units": failed,
            }
        )

    severity_weights = {"critical": 0, "moderate": 0, "minor": 0}
    for issue in issues:
        severity = issue.get("severity") or "minor"
        if severity not in severity_weights:
            severity = "minor"
        count = int(issue.get("count") or len(issue.get("locations") or []))
        severity_weights[severity] += count
    total_weighted = sum(severity_weights.values())
    severity_pct = {
        key: round(100.0 * severity_weights[key] / total_weighted, 2) if total_weighted else 0.0
        for key in ("critical", "moderate", "minor")
    }

    return {
        "right_pct": right_pct,
        "wrong_pct": wrong_pct,
        "category_wrong_pct": category_wrong_pct,
        "severity_pct": severity_pct,
        "units_checked": total_checked,
        "units_failed": total_failed,
    }
