"""Unit tests for PayMongo signature helpers (no network)."""

from __future__ import annotations

import hmac
import json
import unittest
from hashlib import sha256

from app.config import settings
from app.paymongo import (
    PREMIUM_AMOUNT_CENTAVOS,
    extract_checkout_session,
    extract_event_type,
    parse_signature_header,
    verify_webhook_signature,
)


class PayMongoSignatureTests(unittest.TestCase):
    def setUp(self):
        self._prev = settings.paymongo_webhook_secret
        settings.paymongo_webhook_secret = "whsk_test_secret"

    def tearDown(self):
        settings.paymongo_webhook_secret = self._prev

    def test_amounts(self):
        self.assertEqual(PREMIUM_AMOUNT_CENTAVOS["monthly"], 94_900)
        self.assertEqual(PREMIUM_AMOUNT_CENTAVOS["annual"], 949_000)

    def test_parse_signature_header(self):
        parsed = parse_signature_header("t=1,te=abc,li=def")
        self.assertEqual(parsed["t"], "1")
        self.assertEqual(parsed["te"], "abc")
        self.assertEqual(parsed["li"], "def")

    def test_verify_test_signature(self):
        body = json.dumps(
            {
                "data": {
                    "type": "checkout_session.payment.paid",
                    "livemode": False,
                    "data": {
                        "id": "cs_123",
                        "type": "checkout_session",
                        "attributes": {"metadata": {"owner_uid": "u1"}},
                    },
                }
            }
        ).encode("utf-8")
        timestamp = "1496734173"
        digest = hmac.new(
            b"whsk_test_secret",
            f"{timestamp}.".encode("utf-8") + body,
            sha256,
        ).hexdigest()
        header = f"t={timestamp},te={digest},li=deadbeef"
        self.assertTrue(verify_webhook_signature(body, header, livemode=False))
        self.assertFalse(verify_webhook_signature(body, header, livemode=True))
        payload = json.loads(body)
        self.assertEqual(extract_event_type(payload), "checkout_session.payment.paid")
        self.assertEqual(extract_checkout_session(payload)["id"], "cs_123")


if __name__ == "__main__":
    unittest.main()
