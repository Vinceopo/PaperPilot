"""Deterministic scoring for a compliance scan.

This module is the single source of truth for every number shown on the results screen.
It is kept byte-identical in ``machinelearning/app/scoring.py`` and ``api/app/scoring.py``
(a test enforces this). No machine learning runs here — only counting and division.

Vocabulary
----------
formatting unit
    One measured element inside a category (a text line or a heading's style for Fonts,
    one page side for Margins, the first line of a multi-line paragraph for Indentation,
    a pair of adjacent lines or a paragraph's word spacing for Spacing, a long body line
    for Alignment, one page-number placement for Pagination).
    A unit either passes or fails its category's rule.
issue occurrence
    One detected violation of one issue type at one location. A failed unit produces at
    least one occurrence and may produce several (a line in the wrong font family *and*
    size is one failed Fonts unit but two occurrences). Some checks are document-level and
    produce occurrences without any unit (paper size/orientation, captions, citations).

Percentages are returned at full precision as ``{value, numerator, denominator, meaning}``;
``value`` is ``None`` when the denominator is 0. Rounding is a display concern.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

SCORING_VERSION = "units-v2"
BREAKDOWN_ORDER = ("Fonts", "Margins", "Indentation", "Spacing", "Alignment", "Pagination")
SEVERITIES = ("critical", "moderate", "minor")
OTHER_CATEGORY = "Other"

STATUS_PASS = "pass"
STATUS_FAIL = "fail"
STATUS_NOT_EVALUATED = "not_evaluated"
STATUS_NOT_APPLICABLE = "not_applicable"

_EPSILON = 1e-9


def pct_metric(numerator: int | float, denominator: int | float, meaning: str) -> dict:
    value = (100.0 * numerator / denominator) if denominator else None
    return {
        "value": value,
        "numerator": numerator,
        "denominator": denominator,
        "meaning": meaning,
    }


def issue_occurrences(issue: dict) -> int:
    count = issue.get("count")
    if count is None:
        count = len(issue.get("locations") or [])
    return max(0, int(count))


def issue_category(issue: dict) -> str:
    category = issue.get("category")
    if not category:
        for location in issue.get("locations") or []:
            if location.get("section"):
                category = location["section"]
                break
    return str(category or OTHER_CATEGORY)


def _normalized_severity(issue: dict) -> str:
    severity = str(issue.get("severity") or "").lower()
    return severity if severity in SEVERITIES else "minor"


def _category_entry(name: str, stats, occurrences: int, issue_types: list[str], total_failed: int) -> dict:
    checked = int(getattr(stats, "checked", 0) or 0)
    failed = int(getattr(stats, "failed", 0) or 0)
    passed = checked - failed
    applicable = bool(getattr(stats, "applicable", True))
    if checked == 0:
        status = STATUS_NOT_EVALUATED if applicable else STATUS_NOT_APPLICABLE
    else:
        status = STATUS_FAIL if failed else STATUS_PASS
    return {
        "category": name,
        "status": status,
        "applicable": applicable,
        "units_checked": checked,
        "units_passed": passed,
        "units_failed": failed,
        "score": pct_metric(passed, checked, f"{name} units that passed / {name} units checked"),
        "failed_share": pct_metric(
            failed, total_failed, f"{name} failed units / failed units in all categories"
        ),
        "issue_occurrences": occurrences,
        "issue_types": issue_types,
    }


def build_scoring_payload(stats: dict, issues: list[dict]) -> dict:
    """Build the full scoring result from per-category unit counters and the issue list.

    ``stats`` maps a category name to an object with ``checked``, ``failed`` and optionally
    ``applicable`` (False when the mechanics file has no rule for that category).
    """
    occurrences_by_category: dict[str, int] = {}
    types_by_category: dict[str, set[str]] = {}
    occurrences_by_severity = {key: 0 for key in SEVERITIES}
    types_by_severity = {key: 0 for key in SEVERITIES}
    for issue in issues:
        category = issue_category(issue)
        count = issue_occurrences(issue)
        severity = _normalized_severity(issue)
        occurrences_by_category[category] = occurrences_by_category.get(category, 0) + count
        types_by_category.setdefault(category, set()).add(str(issue.get("issue_type") or ""))
        occurrences_by_severity[severity] += count
        types_by_severity[severity] += 1
    total_occurrences = sum(occurrences_by_severity.values())

    total_checked = sum(int(getattr(stats.get(n), "checked", 0) or 0) for n in BREAKDOWN_ORDER)
    total_failed = sum(int(getattr(stats.get(n), "failed", 0) or 0) for n in BREAKDOWN_ORDER)
    total_passed = total_checked - total_failed

    categories = [
        _category_entry(
            name,
            stats.get(name),
            occurrences_by_category.get(name, 0),
            sorted(types_by_category.get(name, set())),
            total_failed,
        )
        for name in BREAKDOWN_ORDER
    ]

    evaluated = [item for item in categories if item["units_checked"] > 0]
    overall_value = (
        sum(item["score"]["value"] for item in evaluated) / len(evaluated) if evaluated else None
    )
    overall = {
        "value": overall_value,
        "status": "evaluated" if evaluated else STATUS_NOT_EVALUATED,
        "method": "unweighted mean of the scores of categories with at least one checked unit",
        "categories": [item["category"] for item in evaluated],
        "category_count": len(evaluated),
    }

    extra_categories = sorted(c for c in occurrences_by_category if c not in BREAKDOWN_ORDER)
    by_category = [
        {
            "category": name,
            "occurrences": occurrences_by_category.get(name, 0),
            "has_units": name in BREAKDOWN_ORDER,
            "share": pct_metric(
                occurrences_by_category.get(name, 0),
                total_occurrences,
                f"{name} issue occurrences / all issue occurrences",
            ),
        }
        for name in (*BREAKDOWN_ORDER, *extra_categories)
    ]
    by_severity = {
        key: {
            "occurrences": occurrences_by_severity[key],
            "issue_types": types_by_severity[key],
            "share": pct_metric(
                occurrences_by_severity[key],
                total_occurrences,
                f"{key} issue occurrences / all issue occurrences",
            ),
        }
        for key in SEVERITIES
    }

    scoring = {
        "version": SCORING_VERSION,
        "units": {"checked": total_checked, "passed": total_passed, "failed": total_failed},
        "passed_pct": pct_metric(total_passed, total_checked, "units passed / units checked"),
        "failed_pct": pct_metric(total_failed, total_checked, "units failed / units checked"),
        "overall": overall,
        "categories": categories,
        "issues": {
            "total_occurrences": total_occurrences,
            "issue_types": len(issues),
            "occurrences_without_units": sum(
                occurrences_by_category.get(name, 0) for name in extra_categories
            ),
            "by_category": by_category,
            "by_severity": by_severity,
        },
    }
    scoring["consistency"] = validate_scoring(scoring)
    if not scoring["consistency"]["ok"]:
        logger.error("Scoring consistency check failed: %s", scoring["consistency"]["errors"])

    return {
        "scoring": scoring,
        "overall_score": overall_value,
        "right_pct": scoring["passed_pct"]["value"],
        "wrong_pct": scoring["failed_pct"]["value"],
        "category_wrong_pct": [
            {
                "category": item["category"],
                "wrong_pct": item["failed_share"]["value"],
                "failed_units": item["units_failed"],
            }
            for item in categories
        ],
        "severity_pct": {
            key: by_severity[key]["share"]["value"] for key in SEVERITIES
        },
        "units_checked": total_checked,
        "units_passed": total_passed,
        "units_failed": total_failed,
    }


def build_sections(scoring: dict) -> list[dict]:
    """Per-category rows for the Score Breakdown, derived only from ``scoring``."""
    return [
        {
            "section": item["category"],
            "formatting_score": item["score"]["value"],
            "status": item["status"],
            "units_checked": item["units_checked"],
            "units_passed": item["units_passed"],
            "units_failed": item["units_failed"],
            "issue_count": item["issue_occurrences"],
            "issues": item["issue_types"],
        }
        for item in scoring["categories"]
    ]


def _check_metric(errors: list[str], name: str, metric: dict) -> None:
    numerator, denominator, value = metric["numerator"], metric["denominator"], metric["value"]
    if numerator < 0 or denominator < 0 or numerator > denominator:
        errors.append(f"{name}: numerator {numerator} is outside 0..{denominator}")
    if denominator == 0 and value is not None:
        errors.append(f"{name}: has a value but the denominator is 0")
    if denominator and (value is None or abs(value - 100.0 * numerator / denominator) > _EPSILON):
        errors.append(f"{name}: value does not equal numerator / denominator")


def validate_scoring(scoring: dict) -> dict:
    """Check the invariants every scan must satisfy; returns ``{ok, errors}``."""
    errors: list[str] = []
    units = scoring["units"]
    categories = scoring["categories"]
    issues = scoring["issues"]

    if units["checked"] != units["passed"] + units["failed"]:
        errors.append("units checked != units passed + units failed")
    for key in ("checked", "passed", "failed"):
        if sum(item[f"units_{key}"] for item in categories) != units[key]:
            errors.append(f"category units_{key} do not add up to the total")
    for item in categories:
        name = item["category"]
        if item["units_checked"] != item["units_passed"] + item["units_failed"]:
            errors.append(f"{name}: checked != passed + failed")
        _check_metric(errors, f"{name} score", item["score"])
        _check_metric(errors, f"{name} failed share", item["failed_share"])
        if item["units_checked"] == 0 and item["status"] not in {STATUS_NOT_EVALUATED, STATUS_NOT_APPLICABLE}:
            errors.append(f"{name}: no units checked but status is {item['status']}")

    _check_metric(errors, "passed_pct", scoring["passed_pct"])
    _check_metric(errors, "failed_pct", scoring["failed_pct"])
    if units["checked"]:
        total_pct = scoring["passed_pct"]["value"] + scoring["failed_pct"]["value"]
        if abs(total_pct - 100.0) > 1e-6:
            errors.append("passed_pct + failed_pct != 100")
        if units["failed"]:
            share_total = sum(item["failed_share"]["value"] for item in categories)
            if abs(share_total - 100.0) > 1e-6:
                errors.append("failed-unit shares do not add up to 100")

    overall = scoring["overall"]
    evaluated = [item for item in categories if item["units_checked"] > 0]
    if (overall["value"] is None) != (not evaluated):
        errors.append("overall score must be null exactly when no category was evaluated")
    if overall["value"] is not None and not 0.0 <= overall["value"] <= 100.0:
        errors.append("overall score is outside 0..100")
    if evaluated:
        measured_scores = [item["score"]["value"] for item in evaluated]
        if any(score is None for score in measured_scores):
            errors.append("a measured category is missing its score")
        elif overall["value"] is None or abs(
            overall["value"] - sum(measured_scores) / len(measured_scores)
        ) > _EPSILON:
            errors.append("overall score is not the unweighted mean of measured category scores")

    total = issues["total_occurrences"]
    if sum(row["occurrences"] for row in issues["by_category"]) != total:
        errors.append("issue occurrences by category do not add up to the total")
    if sum(row["occurrences"] for row in issues["by_severity"].values()) != total:
        errors.append("issue occurrences by severity do not add up to the total")
    if sum(row["issue_types"] for row in issues["by_severity"].values()) != issues["issue_types"]:
        errors.append("issue types by severity do not add up to the total")
    for row in issues["by_category"]:
        _check_metric(errors, f"{row['category']} issue share", row["share"])
    for key, row in issues["by_severity"].items():
        _check_metric(errors, f"{key} severity share", row["share"])

    return {"ok": not errors, "errors": errors}
