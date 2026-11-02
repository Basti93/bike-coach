import io
import json
import os
import tempfile
import unittest

import garmin_upload


class HttpError(Exception):
    def __init__(self, status, text="kaputt"):
        super().__init__(f"{status} {text}")
        self.status_code = status


class Client:
    def __init__(self, error=None, login_error=None):
        self.error, self.login_error = error, login_error
        self.logins, self.uploads = [], []

    def login(self, tokens):
        self.logins.append(tokens)
        if self.login_error:
            raise self.login_error

    def upload_activity(self, path):
        self.uploads.append(path)
        if self.error:
            raise self.error
        return {"ok": True}


class UploadTest(unittest.TestCase):
    def setUp(self):
        handle, self.fit = tempfile.mkstemp(suffix=".fit")
        os.close(handle)
        self.addCleanup(os.remove, self.fit)

    def run_upload(self, client, path=None):
        out = io.StringIO()
        garmin_upload.upload(lambda: client, "geheim-token-ordner", path or self.fit, out)
        lines = out.getvalue().strip().split("\n")
        self.assertEqual(len(lines), 1)
        self.assertNotIn("geheim-token-ordner", lines[0])
        return json.loads(lines[0])

    def test_success(self):
        client = Client()
        self.assertEqual(self.run_upload(client), {"status": "uploaded"})
        self.assertEqual(client.uploads, [self.fit])

    def test_garmin_already_has_it(self):
        self.assertEqual(self.run_upload(Client(HttpError(409))), {"status": "duplicate"})

    def test_duplicate_named_only_in_the_message(self):
        self.assertEqual(self.run_upload(Client(Exception("Upload failed: 409 Conflict"))), {"status": "duplicate"})

    def test_expired_login(self):
        self.assertEqual(self.run_upload(Client(login_error=HttpError(401))), {"status": "failed", "reason": "reauth"})

    def test_rejected_upload_needs_new_login(self):
        self.assertEqual(self.run_upload(Client(HttpError(401))), {"status": "failed", "reason": "reauth"})

    def test_rate_limit(self):
        self.assertEqual(self.run_upload(Client(HttpError(429))), {"status": "failed", "reason": "rate-limit"})

    def test_other_error(self):
        self.assertEqual(self.run_upload(Client(HttpError(500))), {"status": "failed", "reason": "failed"})

    def test_missing_file_does_not_log_in(self):
        client = Client()
        self.assertEqual(self.run_upload(client, "/nicht/da.fit"), {"status": "failed", "reason": "missing-file"})
        self.assertEqual(client.logins, [])


if __name__ == "__main__":
    unittest.main()
