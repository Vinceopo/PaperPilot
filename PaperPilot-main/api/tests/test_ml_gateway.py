import unittest
from unittest.mock import MagicMock, patch

from app.ml_service_client import MLServiceError, ml_service_configured


class MLGatewayClientTests(unittest.TestCase):
    @patch("app.ml_service_client.settings")
    def test_ml_service_configured_requires_both(self, settings):
        settings.ml_service_url = "https://ml.example.com"
        settings.ml_service_key = ""
        self.assertFalse(ml_service_configured())
        settings.ml_service_key = "secret"
        self.assertTrue(ml_service_configured())

    @patch("app.ml_service_client.httpx.Client")
    @patch("app.ml_service_client.settings")
    def test_create_analyze_job_sends_service_key(self, settings, client_cls):
        settings.ml_service_url = "https://ml.example.com"
        settings.ml_service_key = "test-key"
        response = MagicMock()
        response.status_code = 200
        response.content = b'{"job_id":"abc"}'
        response.json.return_value = {"job_id": "abc"}
        client = MagicMock()
        client.__enter__.return_value = client
        client.request.return_value = response
        client_cls.return_value = client

        from app.ml_service_client import create_analyze_job

        out = create_analyze_job(
            job_id="abc",
            document_url="https://res.cloudinary.com/x/doc.pdf",
            document_base64=None,
            filename="doc.pdf",
            mechanics_rules={"font": {}},
            tier="free",
        )
        self.assertEqual(out["job_id"], "abc")
        headers = client.request.call_args.kwargs["headers"]
        self.assertEqual(headers["ML-Service-Key"], "test-key")

    @patch("app.ml_service_client.settings")
    def test_request_without_config_raises(self, settings):
        settings.ml_service_url = ""
        settings.ml_service_key = ""
        from app.ml_service_client import create_analyze_job

        with self.assertRaises(MLServiceError):
            create_analyze_job(
                job_id="x",
                document_url="https://example.com/a.pdf",
                document_base64=None,
                filename="a.pdf",
                mechanics_rules={},
                tier="free",
            )


if __name__ == "__main__":
    unittest.main()
