from __future__ import annotations

import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "machinelearning"
sys.path.insert(0, str(ROOT))

mods = [
    "app.compliance",
    "app.scoring",
    "app.documents",
    "app.mechanics_validate",
    "app.mechanics_options",
    "app.indent_check",
    "app.main",
    "app.jobs",
]
failed = False
for name in mods:
    try:
        importlib.import_module(name)
        print("OK", name)
    except Exception as exc:  # noqa: BLE001
        failed = True
        print("FAIL", name, type(exc).__name__, exc)

from app.compliance import (  # noqa: E402
    CAPTION_LINE_ONE,
    CategoryStats,
    IssueCollector,
    _check_captions,
    _parse_caption_line_structure,
    _pdf_spacing_multiple,
    run_compliance_scan,
)

assert callable(_pdf_spacing_multiple)
print("parse", _parse_caption_line_structure("Table number and title on one line"))
assert _parse_caption_line_structure("Table number and title on one line") == CAPTION_LINE_ONE

units = [
    {
        "text": "Table 1",
        "page_index": 0,
        "line_index": 0,
        "source": "body",
        "role": "caption",
        "spans": [{"text": "Table 1", "size": 12, "bold": False, "italic": False}],
        "bbox": [72, 72, 200, 90],
    },
    {
        "text": "Results",
        "page_index": 0,
        "line_index": 1,
        "source": "body",
        "role": "caption",
        "spans": [{"text": "Results", "size": 12, "bold": False, "italic": False}],
        "bbox": [72, 92, 200, 110],
    },
]
rules = {
    "table_layout_requirements": ["Table number and title on one line, above the table."],
}
collector = IssueCollector()
stats = CategoryStats()
_check_captions(units, rules, collector, stats)
print(
    "caption issues",
    [issue["issue_type"] for issue in collector.result()],
    "checked",
    stats.checked,
    "failed",
    stats.failed,
)

parsed = {
    "text": "hello",
    "metadata": {"format": "pdf"},
    "pages": [
        {
            "width_points": 612,
            "height_points": 792,
            "lines": [
                {
                    "text": "Body line one for spacing check here.",
                    "bbox": [72, 100, 500, 112],
                    "spans": [
                        {
                            "text": "Body line one for spacing check here.",
                            "font": "TimesNewRoman",
                            "size": 12,
                        }
                    ],
                },
                {
                    "text": "Body line two for spacing check here.",
                    "bbox": [72, 124, 500, 136],
                    "spans": [
                        {
                            "text": "Body line two for spacing check here.",
                            "font": "TimesNewRoman",
                            "size": 12,
                        }
                    ],
                },
            ],
            "images": [],
            "drawings": [],
        }
    ],
}
result = run_compliance_scan(
    parsed,
    {"line_spacing": 2.0, "font": {"families": ["Times New Roman"], "sizes_points": [12]}},
)
print("scan ok checked", result["units_checked"], "failed", result["units_failed"])
raise SystemExit(1 if failed else 0)
