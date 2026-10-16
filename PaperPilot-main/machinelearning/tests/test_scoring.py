import copy
import unittest

from app.compliance import IssueCollector, run_compliance_scan
from app.scoring import BREAKDOWN_ORDER, build_scoring_payload, validate_scoring

LONG = "This body sentence is long enough to count as a measured line of prose text"

RULES = {
    "font": {"families": ["Times New Roman"], "sizes_points": [12]},
    "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
    "line_spacing": 2.0,
    "first_line_indent_inches": 0.5,
    "alignment": "justify",
}


def para(index, font="Times New Roman", size=12, spacing=2.0, align="justify", indent=0.5, lines=3, style="Normal"):
    text = " ".join([LONG] * lines)
    return {
        "paragraph_index": index,
        "style": style,
        "text": text,
        "lines": [{"line_index": index * lines + k, "text": LONG} for k in range(lines)],
        "runs": [{"text": text, "font": font, "size": size}],
        "formatting": {"line_spacing": spacing, "alignment": align, "first_line_indent_inches": indent},
    }


def doc(paragraphs, margin=1.0):
    return {
        "text": "\n".join(p["text"] for p in paragraphs),
        "metadata": {"format": "docx"},
        "paragraphs": paragraphs,
        "sections": [
            {
                "page_width_inches": 8.5,
                "page_height_inches": 11,
                "top_margin_inches": margin,
                "bottom_margin_inches": margin,
                "left_margin_inches": margin,
                "right_margin_inches": margin,
            }
        ],
    }


class Stats:
    def __init__(self, checked=0, failed=0, applicable=True):
        self.checked, self.failed, self.applicable = checked, failed, applicable


def by_category(result):
    return {item["category"]: item for item in result["scoring"]["categories"]}


class ScoringAssertions(unittest.TestCase):
    def assert_consistent(self, result):
        """Recompute every displayed number from raw counts and compare."""
        scoring = result["scoring"]
        self.assertTrue(scoring["consistency"]["ok"], scoring["consistency"]["errors"])
        self.assertEqual(validate_scoring(scoring), scoring["consistency"])
        cats = scoring["categories"]
        checked = sum(c["units_checked"] for c in cats)
        failed = sum(c["units_failed"] for c in cats)
        self.assertEqual(result["units_checked"], checked)
        self.assertEqual(result["units_failed"], failed)
        self.assertEqual(result["units_passed"], checked - failed)
        if checked:
            self.assertAlmostEqual(result["right_pct"], 100.0 * (checked - failed) / checked, places=12)
            self.assertAlmostEqual(result["wrong_pct"], 100.0 * failed / checked, places=12)
            self.assertAlmostEqual(result["right_pct"] + result["wrong_pct"], 100.0, places=9)
        else:
            self.assertIsNone(result["right_pct"])
            self.assertIsNone(result["wrong_pct"])
        evaluated = [c for c in cats if c["units_checked"]]
        if evaluated:
            expected = sum(100.0 * c["units_passed"] / c["units_checked"] for c in evaluated) / len(evaluated)
            self.assertAlmostEqual(result["overall_score"], expected, places=12)
        else:
            self.assertIsNone(result["overall_score"])
        total_occurrences = sum(int(issue["count"]) for issue in result["issues"])
        self.assertEqual(scoring["issues"]["total_occurrences"], total_occurrences)
        for section in result["sections"]:
            cat = by_category(result)[section["section"]]
            self.assertEqual(section["units_checked"], cat["units_checked"])
            self.assertEqual(section["issue_count"], cat["issue_occurrences"])
            self.assertEqual(section["formatting_score"], cat["score"]["value"])


class ScoringFormulaTests(ScoringAssertions):
    def test_example_counts_from_spec(self):
        # 7,872 / 6,367 are only a worked example; nothing in the code knows these numbers.
        stats = {name: Stats() for name in BREAKDOWN_ORDER}
        stats["Fonts"] = Stats(4000, 3500)
        stats["Margins"] = Stats(3872, 2867)
        payload = build_scoring_payload(stats, [])
        self.assertEqual(payload["units_checked"], 7872)
        self.assertEqual(payload["units_failed"], 6367)
        self.assertEqual(payload["units_passed"], 1505)
        self.assertEqual(payload["scoring"]["failed_pct"]["numerator"], 6367)
        self.assertEqual(payload["scoring"]["failed_pct"]["denominator"], 7872)
        self.assertAlmostEqual(payload["wrong_pct"], 6367 / 7872 * 100, places=12)
        self.assertEqual(round(payload["wrong_pct"], 1), 80.9)
        self.assertEqual(round(payload["right_pct"], 1), 19.1)
        self.assertAlmostEqual(payload["right_pct"] + payload["wrong_pct"], 100.0, places=12)
        shares = {row["category"]: row for row in payload["category_wrong_pct"]}
        self.assertAlmostEqual(shares["Fonts"]["wrong_pct"], 3500 / 6367 * 100, places=12)
        self.assertEqual(shares["Fonts"]["failed_units"], 3500)
        self.assertIsNone(payload["scoring"]["categories"][2]["score"]["value"])

    def test_values_keep_full_precision(self):
        stats = {name: Stats() for name in BREAKDOWN_ORDER}
        stats["Fonts"] = Stats(3, 1)
        payload = build_scoring_payload(stats, [])
        self.assertEqual(payload["right_pct"], 200.0 / 3)
        self.assertEqual(payload["overall_score"], 200.0 / 3)

    def test_unchecked_category_is_not_a_false_100(self):
        stats = {name: Stats() for name in BREAKDOWN_ORDER}
        stats["Fonts"] = Stats(10, 5)
        stats["Spacing"] = Stats(0, 0, applicable=False)
        payload = build_scoring_payload(stats, [])
        cats = {c["category"]: c for c in payload["scoring"]["categories"]}
        self.assertEqual(cats["Spacing"]["status"], "not_applicable")
        self.assertEqual(cats["Margins"]["status"], "not_evaluated")
        self.assertIsNone(cats["Spacing"]["score"]["value"])
        self.assertEqual(payload["overall_score"], 50.0)
        self.assertEqual(payload["scoring"]["overall"]["categories"], ["Fonts"])

    def test_nothing_measured_is_not_evaluated(self):
        payload = build_scoring_payload({name: Stats() for name in BREAKDOWN_ORDER}, [])
        self.assertIsNone(payload["overall_score"])
        self.assertIsNone(payload["right_pct"])
        self.assertIsNone(payload["wrong_pct"])
        self.assertEqual(payload["scoring"]["overall"]["status"], "not_evaluated")
        self.assertTrue(payload["scoring"]["consistency"]["ok"])
        self.assertTrue(all(value is None for value in payload["severity_pct"].values()))

    def test_issue_occurrences_are_counted_separately_from_failed_units(self):
        stats = {name: Stats() for name in BREAKDOWN_ORDER}
        stats["Fonts"] = Stats(10, 4)
        issues = [
            {"issue_type": "font_family", "severity": "critical", "count": 4, "category": "Fonts"},
            {"issue_type": "font_size", "severity": "critical", "count": 3, "category": "Fonts"},
            {"issue_type": "citation_format", "severity": "minor", "count": 2, "category": "Citations"},
        ]
        payload = build_scoring_payload(stats, issues)
        scoring = payload["scoring"]
        fonts = scoring["categories"][0]
        self.assertEqual(fonts["units_failed"], 4)
        self.assertEqual(fonts["issue_occurrences"], 7)
        self.assertEqual(scoring["issues"]["total_occurrences"], 9)
        self.assertEqual(scoring["issues"]["occurrences_without_units"], 2)
        rows = {row["category"]: row for row in scoring["issues"]["by_category"]}
        self.assertAlmostEqual(rows["Fonts"]["share"]["value"], 7 / 9 * 100, places=12)
        self.assertFalse(rows["Citations"]["has_units"])
        self.assertAlmostEqual(payload["severity_pct"]["critical"], 7 / 9 * 100, places=12)
        self.assertEqual(scoring["issues"]["by_severity"]["critical"]["issue_types"], 2)
        self.assertTrue(scoring["consistency"]["ok"])

    def test_validation_reports_broken_invariants(self):
        stats = {name: Stats() for name in BREAKDOWN_ORDER}
        stats["Fonts"] = Stats(10, 4)
        scoring = copy.deepcopy(build_scoring_payload(stats, [])["scoring"])
        scoring["units"]["failed"] = 5
        scoring["passed_pct"]["value"] = 61.0
        scoring["overall"]["value"] = 12.0
        errors = validate_scoring(scoring)["errors"]
        self.assertIn("units checked != units passed + units failed", errors)
        self.assertTrue(any("passed_pct" in error for error in errors))
        self.assertTrue(any("unweighted mean" in error for error in errors))


class IssueCollectorTests(unittest.TestCase):
    def test_issue_severity_does_not_depend_on_page_order(self):
        def collect(order):
            collector = IssueCollector()
            for page, severity in order:
                collector.add("left_margin", severity, "t", "s", "e", "r", {"page": page, "line": 1, "section": "Margins"})
            return collector.result()[0]

        forward = collect([(1, "minor"), (2, "critical"), (3, "moderate")])
        backward = collect([(3, "moderate"), (2, "critical"), (1, "minor")])
        self.assertEqual(forward["severity"], "critical")
        self.assertEqual(backward["severity"], "critical")
        self.assertEqual(forward["count"], 3)
        self.assertEqual(forward["category"], "Margins")
        self.assertEqual(forward["severity_source"], "rule")


class AnalyzerEdgeCaseTests(ScoringAssertions):
    def scan(self, paragraphs, rules=RULES, margin=1.0):
        result = run_compliance_scan(doc(paragraphs, margin), rules)
        self.assert_consistent(result)
        return result

    def failed_categories(self, result):
        return {name for name, cat in by_category(result).items() if cat["units_failed"]}

    def test_01_empty_manuscript(self):
        result = self.scan([])
        for name in ("Fonts", "Indentation", "Spacing", "Alignment"):
            self.assertEqual(by_category(result)[name]["status"], "not_evaluated")
            self.assertIsNone(by_category(result)[name]["score"]["value"])
        # Only the page setup exists, so only Margins is measured and the overall score says so.
        self.assertEqual(result["scoring"]["overall"]["categories"], ["Margins"])
        self.assertEqual(result["units_checked"], by_category(result)["Margins"]["units_checked"])

    def test_01b_document_with_nothing_measurable(self):
        parsed = {"text": "", "metadata": {"format": "pdf"}, "pages": []}
        result = run_compliance_scan(parsed, RULES)
        self.assert_consistent(result)
        self.assertEqual(result["units_checked"], 0)
        self.assertIsNone(result["overall_score"])
        self.assertIsNone(result["right_pct"])
        self.assertEqual(result["scoring"]["overall"]["status"], "not_evaluated")

    def test_02_very_small_manuscript(self):
        result = self.scan([para(0, lines=2)])
        self.assertGreater(result["units_checked"], 0)
        self.assertEqual(result["units_failed"], 0)

    def test_03_very_large_manuscript_scales_linearly(self):
        small = self.scan([para(i, font="Arial") for i in range(10)])
        large = self.scan([para(i, font="Arial") for i in range(400)])
        self.assertEqual(by_category(large)["Fonts"]["units_checked"], 40 * by_category(small)["Fonts"]["units_checked"])
        self.assertEqual(by_category(large)["Fonts"]["units_failed"], by_category(large)["Fonts"]["units_checked"])

    def test_04_and_05_no_violations_every_unit_passes(self):
        result = self.scan([para(i) for i in range(3)])
        self.assertEqual(result["issues"], [])
        self.assertEqual(result["units_failed"], 0)
        self.assertEqual(result["right_pct"], 100.0)
        self.assertEqual(result["wrong_pct"], 0.0)
        self.assertEqual(result["overall_score"], 100.0)
        statuses = {c["category"]: c["status"] for c in result["scoring"]["categories"]}
        # RULES has no pagination section, so Pagination has no rule to pass.
        self.assertEqual(statuses.pop("Pagination"), "not_applicable")
        self.assertTrue(all(status == "pass" for status in statuses.values()))
        self.assertTrue(all(row["wrong_pct"] is None for row in result["category_wrong_pct"]))

    def test_06_every_evaluated_unit_fails(self):
        bad = [para(i, font="Arial", size=10, spacing=1.0, align="center", indent=0.0) for i in range(3)]
        result = self.scan(bad, margin=0.4)
        self.assertGreater(result["units_checked"], 0)
        self.assertEqual(result["units_failed"], result["units_checked"])
        self.assertEqual(result["wrong_pct"], 100.0)
        self.assertEqual(result["overall_score"], 0.0)
        fonts = by_category(result)["Fonts"]
        # Each failed line breaks both family and size: two occurrences per failed unit.
        self.assertEqual(fonts["issue_occurrences"], 2 * fonts["units_failed"])

    def test_07_to_11_single_category_violations(self):
        cases = {
            "Fonts": ({"font": "Arial"}, 1.0),
            "Margins": ({}, 0.4),
            "Indentation": ({"indent": 0.0}, 1.0),
            "Spacing": ({"spacing": 1.0}, 1.0),
            "Alignment": ({"align": "center"}, 1.0),
        }
        for category, (overrides, margin) in cases.items():
            with self.subTest(category=category):
                result = self.scan([para(i, **overrides) for i in range(3)], margin=margin)
                self.assertEqual(self.failed_categories(result), {category})
                failed = by_category(result)[category]["units_failed"]
                self.assertEqual(result["units_failed"], failed)
                share = {row["category"]: row["wrong_pct"] for row in result["category_wrong_pct"]}
                self.assertEqual(share[category], 100.0)

    def test_12_mixed_violations(self):
        paragraphs = [para(0, font="Arial"), para(1, spacing=1.0), para(2)]
        result = self.scan(paragraphs)
        self.assertEqual(self.failed_categories(result), {"Fonts", "Spacing"})
        shares = [row["wrong_pct"] for row in result["category_wrong_pct"] if row["wrong_pct"] is not None]
        self.assertAlmostEqual(sum(shares), 100.0, places=9)

    def test_13_category_not_applicable(self):
        rules = {key: value for key, value in RULES.items() if key != "line_spacing"}
        result = self.scan([para(i) for i in range(3)], rules=rules)
        spacing = by_category(result)["Spacing"]
        self.assertEqual(spacing["status"], "not_applicable")
        self.assertIsNone(spacing["score"]["value"])
        self.assertNotIn("Spacing", result["scoring"]["overall"]["categories"])

    def test_14_multiple_pages(self):
        result = self.scan([para(i, lines=6) for i in range(30)])
        self.assertGreater(result["page_count"], 1)
        self.assertEqual(by_category(result)["Margins"]["units_checked"], 4 * result["page_count"])

    def test_15_multiple_sections(self):
        paragraphs = []
        for chapter in range(3):
            paragraphs.append(para(len(paragraphs), lines=1, style="Heading 1", indent=0.0))
            paragraphs.extend(para(len(paragraphs) + k, font="Arial" if chapter == 1 else "Times New Roman") for k in range(2))
        result = self.scan(paragraphs)
        self.assertEqual(self.failed_categories(result), {"Fonts"})

    def test_16_different_mechanics_change_the_result(self):
        paragraphs = [para(i) for i in range(3)]
        tnr = self.scan(paragraphs)
        arial = self.scan(paragraphs, rules={**RULES, "font": {"families": ["Arial"], "sizes_points": [12]}})
        self.assertEqual(by_category(tnr)["Fonts"]["units_failed"], 0)
        self.assertEqual(by_category(arial)["Fonts"]["units_failed"], by_category(arial)["Fonts"]["units_checked"])

    def test_19_reanalysis_is_reproducible_and_does_not_accumulate(self):
        paragraphs = [para(0, font="Arial"), para(1, spacing=1.0), para(2)]
        first = self.scan(copy.deepcopy(paragraphs))
        second = self.scan(copy.deepcopy(paragraphs))
        self.assertEqual(first["scoring"], second["scoring"])
        self.assertEqual(first["issues"], second["issues"])

    def test_20_new_manuscript_after_previous_analysis(self):
        self.scan([para(i, font="Arial", spacing=1.0) for i in range(20)])
        clean = self.scan([para(i) for i in range(3)])
        fresh = self.scan([para(i) for i in range(3)])
        self.assertEqual(clean["units_failed"], 0)
        self.assertEqual(clean["scoring"], fresh["scoring"])


if __name__ == "__main__":
    unittest.main()
