import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app import main
from app.schemas import RegisterRequest, ResolveEmailRequest


def resolve(identifier):
    return main.auth_resolve_email(ResolveEmailRequest(identifier=identifier))


class ResolveEmailTests(unittest.TestCase):
    def test_email_identifier_is_returned_normalized(self):
        self.assertEqual(resolve("  Jane@Example.com ")["email"], "jane@example.com")

    def test_username_resolves_to_profile_email(self):
        with patch.object(main, "username_taken", return_value=True), patch.object(
            main, "get_email_by_username", return_value="jdabs@example.com"
        ):
            self.assertEqual(resolve("jdabs")["email"], "jdabs@example.com")

    def test_unknown_username_is_404_with_code(self):
        with patch.object(main, "username_taken", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                resolve("nobody")
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail["code"], "username_not_found")

    def test_database_unavailable_is_503(self):
        with patch.object(main, "username_taken", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                resolve("jdabs")
        self.assertEqual(ctx.exception.status_code, 503)


def register_body(**overrides):
    values = {
        "signup_token": "token",
        "first_name": "Jane",
        "middle_name": "",
        "last_name": "Cruz",
        "username": "janecruz",
        "email": "jane@example.com",
        "password": "Str0ng!Pass",
    }
    values.update(overrides)
    return RegisterRequest(**values)


class AccountPersistenceTests(unittest.TestCase):
    def test_missing_profile_is_created_from_firebase_account(self):
        fb = MagicMock()
        fb.get_user.return_value = SimpleNamespace(
            email="g@example.com", display_name="Ana Maria Reyes", photo_url="", email_verified=True
        )
        saved = {"email": "g@example.com", "username": "", "firstName": "Ana"}
        with patch.object(main, "get_profile", side_effect=[None, saved]), patch.object(
            main, "admin_auth", return_value=fb
        ), patch.object(main, "save_profile", return_value=True) as save:
            result = main.get_user_profile(uid="uid-1")
        save.assert_called_once_with(
            "uid-1", email="g@example.com", username="", first_name="Ana", middle_name="Maria", last_name="Reyes"
        )
        self.assertEqual(result["uid"], "uid-1")
        self.assertEqual(result["email"], "g@example.com")

    def test_taken_username_stops_before_creating_login(self):
        fb = MagicMock()
        with patch.object(main, "consume_challenge"), patch.object(main, "admin_auth", return_value=fb), patch.object(
            main, "username_taken", return_value=True
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.auth_register(register_body())
        self.assertEqual(ctx.exception.status_code, 409)
        fb.create_user.assert_not_called()
        fb.delete_user.assert_not_called()

    def test_failed_profile_save_keeps_account_and_username(self):
        fb = MagicMock()
        fb.create_user.return_value = SimpleNamespace(uid="uid-2")
        with patch.object(main, "consume_challenge"), patch.object(main, "admin_auth", return_value=fb), patch.object(
            main, "username_taken", return_value=False
        ), patch.object(main, "reserve_username", return_value=True), patch.object(
            main, "save_profile", return_value=False
        ), patch.object(main, "release_username") as release:
            result = main.auth_register(register_body())
        self.assertFalse(result["profile_saved"])
        release.assert_not_called()
        fb.delete_user.assert_not_called()


if __name__ == "__main__":
    unittest.main()
