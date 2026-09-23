import base64
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.compliance import run_compliance_scan
from app.config import settings
from app.main import app


class ComplianceScoringTests(unittest.TestCase):
    def test_unit_scoring_right_wrong(self):
        parsed = {
            "text": "Line one\nLine two",
            "metadata": {"format": "pdf"},
            "pages": [{
                "page_index": 0,
                "width_points": 612,
                "height_points": 792,
                "lines": [
                    {
                        "line_index": 0,
                        "text": "Line one uses Arial here",
                        "spans": [{"text": "Line one uses Arial here", "font": "Arial", "size": 12}],
                        "bbox": [72, 72, 500, 86],
                    },
                    {
                        "line_index": 1,
                        "text": "Line two uses Times New Roman",
                        "spans": [{"text": "Line two uses Times New Roman", "font": "TimesNewRoman", "size": 12}],
                        "bbox": [72, 90, 500, 104],
                    },
                ],
            }],
        }
        result = run_compliance_scan(
            parsed,
            {
                "font": {"families": ["Times New Roman"], "sizes_points": [12]},
                "margins_inches": {"top": 1, "bottom": 1, "left": 1, "right": 1},
            },
        )
        self.assertEqual(result["right_pct"] + result["wrong_pct"], 100.0)
        self.assertGreater(result["wrong_pct"], 0)
        self.assertIn("category_wrong_pct", result)
        self.assertIn("severity_pct", result)
        loc = result["issues"][0]["locations"][0]
        self.assertIn("bbox", loc)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.old_key = settings.ml_service_key
        settings.ml_service_key = "test-key"
        self.client = TestClient(app)

    def tearDown(self):
        settings.ml_service_key = self.old_key

    def test_health_unauthenticated(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_analyze_job_lifecycle(self):
        parsed = {
            "text": "Sample",
            "metadata": {"format": "pdf"},
            "pages": [{
                "page_index": 0,
                "width_points": 612,
                "height_points": 792,
                "lines": [{
                    "line_index": 0,
                    "text": "Sample line long enough for body check here.",
                    "spans": [{"text": "Sample line long enough for body check here.", "font": "TimesNewRoman", "size": 12}],
                    "bbox": [72, 72, 500, 86],
                }],
            }],
        }
        with patch("app.jobs._load_document_bytes") as load_mock:
            load_mock.return_value = b"%PDF-1.4"
            with patch("app.jobs.validate_document", return_value="pdf"):
                with patch("app.jobs.parse_document", return_value=parsed):
                    create = self.client.post(
                        "/v1/analyze",
                        headers={"ML-Service-Key": "test-key"},
                        json={
                            "document_base64": base64.b64encode(b"x").decode(),
                            "filename": "paper.pdf",
                            "mechanics": {"rules": {"font": {"families": ["Times New Roman"], "sizes_points": [12]}}},
                        },
                    )
        self.assertEqual(create.status_code, 200)
        job_id = create.json()["job_id"]
        for _ in range(50):
            progress = self.client.get(
                f"/v1/analyze/{job_id}/progress",
                headers={"ML-Service-Key": "test-key"},
            )
            if progress.json()["status"] in {"done", "failed"}:
                break
            time.sleep(0.05)
        result = self.client.get(
            f"/v1/analyze/{job_id}/result",
            headers={"ML-Service-Key": "test-key"},
        )
        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["status"], "done")
        self.assertIsNotNone(body["right_pct"])


if __name__ == "__main__":
    unittest.main()
