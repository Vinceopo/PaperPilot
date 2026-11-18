import unittest

from app.config import PLAN_UPLOAD_LIMITS_BYTES, plan_upload_byte_limit


class PlanUploadLimitTests(unittest.TestCase):
    def test_free_premium_pro_limits(self):
        self.assertEqual(plan_upload_byte_limit("free"), 15 * 1024 * 1024)
        self.assertEqual(plan_upload_byte_limit("premium"), 45 * 1024 * 1024)
        self.assertEqual(plan_upload_byte_limit("pro"), 120 * 1024 * 1024)

    def test_unknown_tier_defaults_to_free(self):
        self.assertEqual(plan_upload_byte_limit(None), PLAN_UPLOAD_LIMITS_BYTES["free"])
        self.assertEqual(plan_upload_byte_limit("enterprise"), PLAN_UPLOAD_LIMITS_BYTES["free"])

    def test_case_insensitive(self):
        self.assertEqual(plan_upload_byte_limit("PRO"), PLAN_UPLOAD_LIMITS_BYTES["pro"])
        self.assertEqual(plan_upload_byte_limit("Premium"), PLAN_UPLOAD_LIMITS_BYTES["premium"])


if __name__ == "__main__":
    unittest.main()
