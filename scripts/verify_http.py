"""E2E verification of the streamable-http transport (v0.4.0).

Starts the MCP server over HTTP on a scratch port (env/config from .env),
then checks:
  1. tools/list via the MCP streamable-http client (with auth header)
  2. tools/call whoami via the same session (reaches the TaskFlow API)
  3. raw GET without the auth header  -> 401
  4. raw GET with a wrong token       -> 401

Run:  uv run python scripts/verify_http.py
"""

import asyncio
import os
import socket
import subprocess
import sys
import time

import httpx

PORT = 8137
URL = f"http://127.0.0.1:{PORT}/mcp"
TOKEN = "verify-secret-1234"
SERVER_ENV = {
    **os.environ,
    # hermetic: pin the endpoint path so a custom TASKFLOW_MCP_PATH in .env
    # (e.g. /taskflow-mcp for a reverse proxy) can't shift it under the test
    "TASKFLOW_MCP_TRANSPORT": "streamable-http",
    "TASKFLOW_MCP_HOST": "127.0.0.1",
    "TASKFLOW_MCP_PORT": str(PORT),
    "TASKFLOW_MCP_PATH": "/mcp",
    "TASKFLOW_MCP_AUTH_TOKEN": TOKEN,
}


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
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    failures: list[str] = []
    try:
        wait_port(PORT)
        failures.extend(asyncio.run(mcp_checks()))

        # 3: no auth header -> 401
        r = httpx.get(URL, timeout=5)
        print(f"[{'ok' if r.status_code == 401 else 'FAIL'}] GET no header -> {r.status_code}")
        if r.status_code != 401:
            failures.append(f"expected 401 without header, got {r.status_code}")

        # 4: wrong token -> 401
        r = httpx.get(URL, headers={"Authorization": "Bearer wrong"}, timeout=5)
        print(f"[{'ok' if r.status_code == 401 else 'FAIL'}] GET wrong token -> {r.status_code}")
        if r.status_code != 401:
            failures.append(f"expected 401 with wrong token, got {r.status_code}")

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
    print("\nAll HTTP-transport checks passed.")
    return 0


async def mcp_checks() -> list[str]:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    failures: list[str] = []
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with streamablehttp_client(URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            print(f"[ok] list_tools: {len(tools)} tools")
            if not tools:
                failures.append("tools list is empty")
            result = await session.call_tool("whoami", {})
            payload = getattr(result, "structuredContent", None) or {}
            print(f"[ok] whoami: {str(payload)[:120]}")
            if result.isError:
                failures.append(f"whoami returned isError: {result}")
    return failures


if __name__ == "__main__":
    sys.exit(main())
