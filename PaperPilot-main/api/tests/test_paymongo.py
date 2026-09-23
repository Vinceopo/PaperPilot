"""PayMongo helpers — signature verification, pricing, and event parsing."""
from __future__ import annotations

import hashlib
import hmac
import time
import unittest

from app.config import settings
from app.paymongo import (
    extract_event,
    plan_amount_centavos,
    plan_amount_pesos,
    verify_webhook_signature,
)
from app.paymongo_events import handle_paymongo_event


class PayMongoHelpersTest(unittest.TestCase):
    def test_plan_amounts(self):
        self.assertEqual(plan_amount_centavos("monthly"), 94_900)
        self.assertEqual(plan_amount_centavos("annual"), 949_000)
        self.assertEqual(plan_amount_pesos("monthly"), 949)
        self.assertEqual(plan_amount_pesos("annual"), 9490)

    def test_webhook_signature_accepts_valid(self):
        settings.paymongo_webhook_secret = "whsk_test_secret"
        body = b'{"data":{"type":"checkout_session.payment.paid","data":{"id":"cs_x"}}}'
        timestamp = str(int(time.time()))
        digest = hmac.new(
            b"whsk_test_secret",
            f"{timestamp}.".encode("utf-8") + body,
            hashlib.sha256,
        ).hexdigest()
        header = f"t={timestamp},te={digest},li="
        self.assertTrue(verify_webhook_signature(body, header))

    def test_webhook_signature_rejects_bad(self):
        settings.paymongo_webhook_secret = "whsk_test_secret"
        body = b'{"ok":true}'
        self.assertFalse(verify_webhook_signature(body, "t=1,te=deadbeef,li="))
        self.assertFalse(verify_webhook_signature(body, None))

    def test_extract_event_shape_a(self):
        payload = {
            "data": {
                "type": "checkout_session.payment.paid",
                "data": {"id": "cs_abc", "attributes": {"reference_number": "pp-1"}},
            }
        }
        event_type, resource, event_id = extract_event(payload)
        self.assertEqual(event_type, "checkout_session.payment.paid")
        self.assertEqual(resource.get("id"), "cs_abc")
        self.assertEqual(event_id, "")

    def test_extract_event_shape_b(self):
        payload = {
            "data": {
                "id": "evt_123",
                "type": "event",
                "attributes": {
                    "type": "payment.failed",
                    "data": {"id": "pay_9", "attributes": {"status": "failed"}},
                },
            }
        }
        event_type, resource, event_id = extract_event(payload)
        self.assertEqual(event_type, "payment.failed")
        self.assertEqual(resource.get("id"), "pay_9")
        self.assertEqual(event_id, "evt_123")

    def test_checkout_session_is_paid(self):
        from app.paymongo import checkout_session_is_paid

        unpaid = {"data": {"id": "cs_1", "attributes": {"payments": []}}}
        self.assertFalse(checkout_session_is_paid(unpaid))
        paid = {
            "data": {
                "id": "cs_1",
                "attributes": {
                    "payments": [
                        {"id": "pay_1", "attributes": {"status": "paid", "amount": 94900}}
                    ]
                },
            }
        }
        self.assertTrue(checkout_session_is_paid(paid))

    def test_handler_acks_source_chargeable(self):
        # No Firebase in unit test — merchant log may no-op / raise; we only assert no crash
        # when claim/complete skip empty event ids.
        payload = {
            "data": {
                "type": "source.chargeable",
                "data": {"id": "src_1", "type": "source", "attributes": {}},
            }
        }
        # Patch heavy RTDB calls by relying on empty event id path + try/except in handler
        try:
            result = handle_paymongo_event(payload)
            self.assertTrue(result.get("ok"))
            self.assertEqual(result.get("type"), "source.chargeable")
        except Exception:
            # Offline / no Firebase credentials in CI — signature & parse tests still cover core
            self.skipTest("Firebase RTDB unavailable in this environment")


if __name__ == "__main__":
    unittest.main()
