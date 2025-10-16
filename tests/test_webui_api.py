from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from tinybf.transpiler import BrainfuckTranspiler
from tinybf.webui import create_app


class WebUISessionApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(create_app())

    def _create_session(self, *, code: str = ".", **payload):
        body = {"code": code}
        body.update(payload)
        response = self.client.post("/api/session", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_create_session_returns_initial_state(self) -> None:
        data = self._create_session(input="A")
        self.assertIn("session_id", data)
        self.assertEqual(data["language"], "brainfuck")
        self.assertEqual(len(data["history"]), data["history_size"])
        self.assertEqual(data["state"]["step"], 0)
        self.assertEqual(data["history"][0]["pc"], 0)
        self.assertFalse(data["finished"])
        self.assertIn("total_steps", data)
        self.assertIn("total_steps_capped", data)

    def test_step_advances_state(self) -> None:
        data = self._create_session(code="++.")
        session_id = data["session_id"]

        response = self.client.post(
            f"/api/session/{session_id}/step", json={"count": 2}
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(len(payload["states"]), 2)
        self.assertEqual(payload["states"][0]["step"], 1)
        self.assertEqual(payload["states"][1]["step"], 2)
        self.assertEqual(len(payload["history"]), payload["history_size"])
        self.assertEqual(payload["history"][-1]["step"], payload["states"][-1]["step"])
        self.assertFalse(payload["finished"])
        self.assertIn("total_steps", payload)

    def test_reset_restores_initial_state(self) -> None:
        data = self._create_session(code="+.")
        session_id = data["session_id"]
        self.client.post(f"/api/session/{session_id}/step", json={"count": 1})

        response = self.client.post(f"/api/session/{session_id}/reset")
        self.assertEqual(response.status_code, 200, response.text)
        reset_payload = response.json()
        self.assertEqual(reset_payload["state"]["step"], 0)
        self.assertEqual(len(reset_payload["history"]), 1)
        self.assertFalse(reset_payload["finished"])

    def test_reset_clears_breakpoints(self) -> None:
        data = self._create_session(code="+++")
        session_id = data["session_id"]

        add = self.client.post(f"/api/session/{session_id}/breakpoints", json={"pc": 1})
        self.assertEqual(add.status_code, 200, add.text)

        reset = self.client.post(f"/api/session/{session_id}/reset")
        self.assertEqual(reset.status_code, 200, reset.text)
        payload = reset.json()
        self.assertEqual(payload["breakpoints"], [])

    def test_step_limit_conflict(self) -> None:
        data = self._create_session(code="++", max_steps=1)
        session_id = data["session_id"]

        ok = self.client.post(f"/api/session/{session_id}/step", json={"count": 1})
        self.assertEqual(ok.status_code, 200, ok.text)

        conflict = self.client.post(
            f"/api/session/{session_id}/step",
            json={"count": 1},
        )
        self.assertEqual(conflict.status_code, 409, conflict.text)
        payload = conflict.json()
        self.assertIn("detail", payload)

    def test_add_and_remove_breakpoint(self) -> None:
        data = self._create_session(code="+++")
        session_id = data["session_id"]

        added = self.client.post(
            f"/api/session/{session_id}/breakpoints",
            json={"pc": 1},
        )
        self.assertEqual(added.status_code, 200, added.text)
        payload = added.json()
        self.assertIn(1, payload["breakpoints"])

        removed = self.client.delete(f"/api/session/{session_id}/breakpoints/1")
        self.assertEqual(removed.status_code, 200, removed.text)
        payload = removed.json()
        self.assertNotIn(1, payload["breakpoints"])

    def test_run_until_break_hits_breakpoint(self) -> None:
        data = self._create_session(code="+.+")
        session_id = data["session_id"]
        self.client.post(f"/api/session/{session_id}/breakpoints", json={"pc": 1})

        response = self.client.post(f"/api/session/{session_id}/run", json={"limit": 10})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["hit_breakpoint"], 1)
        self.assertFalse(payload["finished"])

    def test_run_to_completion_ignore_breakpoints(self) -> None:
        data = self._create_session(code="+.+")
        session_id = data["session_id"]

        response = self.client.post(
            f"/api/session/{session_id}/run",
            json={"limit": 10000, "ignore_breakpoints": True},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["finished"])
        self.assertGreaterEqual(payload["total_steps"], payload["history"][-1]["step"])

    def test_create_session_transpiles_tinybf(self) -> None:
        source = "let char ch = 'A'\nprint_char ch\n"
        expected = BrainfuckTranspiler().transpile(source)
        data = self._create_session(code=source, language="tinybf")
        self.assertEqual(data["language"], "tinybf")
        self.assertEqual(data["original_source"], source)
        self.assertEqual(data["code"], expected)

    def test_history_matches_history_size(self) -> None:
        data = self._create_session(code="+++.>.")
        session_id = data["session_id"]
        self.client.post(f"/api/session/{session_id}/step", json={"count": 3})
        response = self.client.get(f"/api/session/{session_id}")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["history"]), payload["history_size"])

    def test_serves_index_html(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("TinyBF Web UI", response.text)

    def test_serves_static_asset(self) -> None:
        response = self.client.get("/static/dist/main.js")
        self.assertEqual(response.status_code, 200)
        self.assertIn("runSessionToEnd", response.text)


if __name__ == "__main__":
    unittest.main()
