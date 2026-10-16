"""Tests for _resolve_task_id: T-<n> shortId -> internal id mapping."""

import unittest

from taskflow_mcp import server
from taskflow_mcp.client import ToolError


class StubClient:
    def __init__(self, items):
        self.items = items
        self.calls = []

    async def get_paged_list(self, path, filters=None, limit=None, offset=None):
        self.calls.append((path, filters))
        return {"items": self.items, "total": len(self.items), "truncated": False}


def task(id, short_id_num, title="t"):
    return {"id": id, "shortId": f"T-{short_id_num}", "shortIdNum": short_id_num,
            "title": title}


class ResolveTaskIdTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._orig_client = server._client

    def tearDown(self):
        server._client = self._orig_client

    async def test_plain_id_passes_through_without_api_call(self):
        stub = StubClient([])
        server._client = stub
        self.assertEqual(await server._resolve_task_id("cmdabc123"), "cmdabc123")
        self.assertEqual(stub.calls, [])

    async def test_short_id_resolves_to_internal_id(self):
        stub = StubClient([task("cmdabc123", 3)])
        server._client = stub
        self.assertEqual(await server._resolve_task_id("T-3"), "cmdabc123")
        self.assertEqual(stub.calls, [("api/tasks", {"search": "T-3"})])

    async def test_short_id_is_case_insensitive_and_stripped(self):
        server._client = StubClient([task("cmdabc123", 7)])
        self.assertEqual(await server._resolve_task_id("  t-7  "), "cmdabc123")

    async def test_ignores_fuzzy_search_hits(self):
        stub = StubClient([task("cmd1", 3), task("cmd2", 12, title="Fix T-3 bug")])
        server._client = stub
        self.assertEqual(await server._resolve_task_id("T-3"), "cmd1")

    async def test_missing_short_id_raises(self):
        server._client = StubClient([])
        with self.assertRaisesRegex(ToolError, "T-99 not found"):
            await server._resolve_task_id("T-99")

    async def test_ambiguous_short_id_raises(self):
        server._client = StubClient(
            [task("cmd1", 5, title="A"), task("cmd2", 5, title="B")]
        )
        with self.assertRaisesRegex(ToolError, "ambiguous"):
            await server._resolve_task_id("T-5")


if __name__ == "__main__":
    unittest.main()
