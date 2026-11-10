"""E2E verification of attachment_upload content_base64 (remote/blob path).

Starts the MCP server over HTTP (env from .env for the TaskFlow connection),
then via the MCP client:
  1. attachment_upload schema exposes content_base64/file_name
  2. error cases: no source, both sources, bad base64
  3. real roundtrip on the first task from task_list:
     upload content_base64 -> attachment_list -> attachment_get (same bytes)
     -> attachment_delete -> attachment_list (gone)

Run:  uv run python scripts/verify_upload.py
"""

import asyncio
import base64
import os
import socket
import subprocess
import sys
import time

import httpx

PORT = 8153
URL = f"http://127.0.0.1:{PORT}/mcp"
TOKEN = "verify-upload-secret"
SERVER_ENV = {
    **os.environ,
    "TASKFLOW_MCP_TRANSPORT": "streamable-http",
    "TASKFLOW_MCP_HOST": "127.0.0.1",
    "TASKFLOW_MCP_PORT": str(PORT),
    "TASKFLOW_MCP_PATH": "/mcp",
    "TASKFLOW_MCP_AUTH_TOKEN": TOKEN,
}
PAYLOAD = b"verify_upload roundtrip \xf0\x9f\x93\x8e"
NAME = f"verify_upload_{os.getpid()}.txt"  # unique: TF rejects duplicate names per entity


def wait_port(port: int, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"server did not open port {port} in {timeout}s")


def main() -> int:
    proc = subprocess.Popen(
        [".venv/bin/python", "-m", "taskflow_mcp.server"],
        env=SERVER_ENV,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    failures: list[str] = []
    try:
        wait_port(PORT)
        r = httpx.get(URL, timeout=5)
        if r.status_code != 401:
            failures.append(f"expected 401 without header, got {r.status_code}")
        failures.extend(asyncio.run(mcp_checks()))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f" - {f}")
        return 1
    print("\nAll attachment_upload blob checks passed.")
    return 0


async def mcp_checks() -> list[str]:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    failures: list[str] = []
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with streamablehttp_client(URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # 1: schema exposes the blob parameters
            tools = (await session.list_tools()).tools
            tool = next(t for t in tools if t.name == "attachment_upload")
            props = tool.inputSchema.get("properties", {})
            for p in ("file_path", "content_base64", "file_name"):
                if p not in props:
                    failures.append(f"attachment_upload schema misses {p}")
            print(f"[ok] attachment_upload schema: {sorted(props)}")

            async def call(name, args):
                res = await session.call_tool(name, args)
                if res.isError:
                    text = " ".join(
                        getattr(c, "text", "") for c in res.content
                    )
                    return None, text
                payload = res.structuredContent
                if payload is None:
                    import json

                    raw = getattr(res.content[0], "text", "") if res.content else ""
                    payload = json.loads(raw) if raw else {}
                return payload, ""

            # 2: error cases
            _, err = await call("attachment_upload",
                                {"entity_id": "x", "entity_type": "note"})
            if "exactly one" not in err:
                failures.append(f"no-source error wrong: {err}")
            _, err = await call("attachment_upload",
                                {"entity_id": "x", "entity_type": "note",
                                 "file_path": "/etc/hostname",
                                 "content_base64": "aGk="})
            if "exactly one" not in err:
                failures.append(f"both-sources error wrong: {err}")
            _, err = await call("attachment_upload",
                                {"entity_id": "x", "entity_type": "note",
                                 "content_base64": "not-base64!!",
                                 "file_name": NAME})
            if "not valid base64" not in err:
                failures.append(f"bad-base64 error wrong: {err}")
            print("[ok] error cases: no-source / both-sources / bad-base64")

            # 3: real roundtrip on the first task
            tasks, _ = await call("task_list", {"limit": 1})
            items = tasks.get("items") or tasks.get("tasks") or []
            if not items:
                failures.append(f"no tasks available for the roundtrip: {tasks}")
                return failures
            task_id = items[0]["id"]
            short_id = items[0].get("shortId") or task_id
            att, err = await call("attachment_upload",
                                  {"entity_id": short_id, "entity_type": "task",
                                   "content_base64": base64.b64encode(PAYLOAD).decode(),
                                   "file_name": NAME})
            if err or not att.get("id"):
                failures.append(f"blob upload failed: {err or att}")
                return failures
            print(f"[ok] uploaded via content_base64: id={att['id']}")

            def att_items(payload):
                if isinstance(payload, dict):
                    if "items" in payload or "attachments" in payload:
                        return payload.get("items") or payload.get("attachments") or []
                    return [payload]  # single attachment object
                return payload or []

            def att_name(a):
                return a.get("fileName") or a.get("displayName")

            listed, _ = await call("attachment_list",
                                   {"entity_id": short_id, "entity_type": "task"})
            mine = [a for a in att_items(listed) if att_name(a) == NAME]
            if not mine:
                failures.append(f"uploaded attachment not in list: {listed}")
                return failures
            got, err = await call("attachment_get", {"blob_id": mine[0]["blobId"]})
            data = base64.b64decode(got.get("base64", "")) if got else b""
            if data != PAYLOAD:
                failures.append(f"roundtrip bytes differ: {data!r} vs {PAYLOAD!r}")
            else:
                print(f"[ok] attachment_get roundtrip: {len(data)} bytes match")

            _, err = await call("attachment_delete", {"attachment_id": att["id"]})
            if err and "403" in err:
                # this token lacks tasks:delete — cleanup is a manual UI job;
                # not a feature failure, but the leftover must be reported
                print(f"[warn] cleanup skipped (token scope): {err.strip()}")
                print(f"[warn] LEFTOVER on the task: {NAME} (attachment {att['id']})")
            elif err:
                failures.append(f"cleanup delete failed: {err}")
            listed, _ = await call("attachment_list",
                                   {"entity_id": short_id, "entity_type": "task"})
            if not err and any(att_name(a) == NAME for a in att_items(listed)):
                failures.append("attachment still listed after delete")
            elif not err:
                print("[ok] cleaned up (attachment deleted)")
    return failures


if __name__ == "__main__":
    sys.exit(main())
