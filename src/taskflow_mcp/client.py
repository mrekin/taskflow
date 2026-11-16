"""HTTP client for the TaskFlow REST API with MCP-friendly error mapping.

All API errors surface as ToolError with plain text (no tracebacks):
401 -> fix the token, 403 -> fix token permissions/scope, 404 -> no data.
"""

import base64
import binascii
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx

try:  # official SDK path; fall back so the module stays importable for tests
    from mcp.server.fastmcp.exceptions import ToolError
except ImportError:  # pragma: no cover
    class ToolError(Exception):
        pass


def _now_utc() -> datetime:
    """Return current UTC time."""
    return datetime.now(timezone.utc)


def _extract_api_error(body: bytes, status: int) -> str:
    try:
        import json

        parsed = json.loads(body)
        if isinstance(parsed, dict) and isinstance(parsed.get("error"), str):
            return parsed["error"]
    except (ValueError, UnicodeDecodeError):
        pass
    snippet = body[:200].decode(errors="replace")
    return snippet if snippet else f"HTTP {status}"


class TaskFlowClient:
    def __init__(self, api_base: str, token: str, timeout: float,
                 max_list_items: int, max_download_mb: int) -> None:
        self.api_base = api_base
        self.token = token
        self.timeout = timeout
        self.max_list_items = max_list_items
        self.max_download_bytes = max_download_mb * 1024 * 1024
        self._http = httpx.AsyncClient(
            base_url=api_base,
            timeout=timeout,
            headers={"Authorization": f"Bearer {token}"},
        )
        self._last_reset = None  # track last reset time for periodic reconnect

    async def close(self) -> None:
        await self._http.aclose()

    async def reset(self) -> None:
        """Recreate the underlying httpx client to flush stale connections."""
        await self._http.aclose()
        self._http = httpx.AsyncClient(
            base_url=self.api_base,
            timeout=self.timeout,
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self._last_reset = _now_utc()

    async def _send(self, method: str, path: str, **kwargs: Any) -> Any:
        """Send an HTTP request, flushing stale connections: reconnects
        periodically (every 12h) and retries once on a connect error."""
        if self._last_reset is not None:
            elapsed = (_now_utc() - self._last_reset).total_seconds()
            if elapsed > 12 * 3600:
                await self.reset()
        try:
            return await self._http.request(method, path, **kwargs)
        except httpx.ConnectError:
            await self.reset()
            try:
                return await self._http.request(method, path, **kwargs)
            except httpx.ConnectError:
                raise ToolError(
                    f"Cannot connect to TaskFlow at {self.api_base} — is the server running?"
                ) from None

    def _require_token(self) -> None:
        if not self.token:
            raise ToolError(
                "TASKFLOW_API_TOKEN is not set — create a personal token in "
                "TaskFlow → Settings → API Tokens and configure the server env"
            )

    async def request(self, method: str, path: str, *, params: dict | None = None,
                      json_body: Any = None) -> Any:
        """Performs an API call, returns parsed JSON (dict or list)."""
        self._require_token()
        try:
            resp = await self._send(method, path, params=params, json=json_body)
        except httpx.TimeoutException:
            raise ToolError(
                f"TaskFlow request timed out after {self.timeout:g}s: {method} {path}"
            ) from None

        if resp.status_code >= 400:
            err = _extract_api_error(resp.content, resp.status_code)
            if resp.status_code == 401:
                raise ToolError(
                    f"Authentication failed (401): {err}. Check TASKFLOW_API_TOKEN — "
                    "it may be wrong, revoked or expired."
                )
            if resp.status_code == 403:
                raise ToolError(
                    f"Forbidden (403): {err}. Fix the token's permissions matrix or "
                    "project scope in TaskFlow → Settings → API Tokens."
                )
            if resp.status_code == 404:
                raise ToolError(f"Not found (404): {err}")
            raise ToolError(f"TaskFlow API {resp.status_code}: {err}")

        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    async def get(self, path: str, *, params: dict | None = None) -> Any:
        return await self.request("GET", path, params=params)

    # --- paged lists -------------------------------------------------

    async def get_paged_list(self, path: str, filters: dict | None = None,
                             limit: int | None = None, offset: int | None = None) -> dict:
        """List endpoint -> {"items", "total", "truncated"}.

        Passes limit/offset through when the caller supplies them; otherwise
        fetches everything and, if that exceeds the configured cap, refetches
        with limit=cap (the refetch's X-Total-Count gives the true total).
        """
        filters = dict(filters or {})
        if limit is not None or offset is not None:
            params = {**filters, **({"limit": limit} if limit is not None else {}),
                      **({"offset": offset} if offset is not None else {})}
            return await self._fetch_page(path, params, caller_paged=True)
        items = await self.get(path, params=filters)
        if not isinstance(items, list):
            raise ToolError(f"Unexpected response from {path}: expected a list")
        if len(items) <= self.max_list_items:
            return {"items": items, "total": len(items), "truncated": False}
        page = await self._fetch_page(path, {**filters, "limit": self.max_list_items},
                                      caller_paged=False)
        return {**page, "truncated": True}

    async def _fetch_page(self, path: str, params: dict, *, caller_paged: bool) -> dict:
        self._require_token()
        try:
            resp = await self._send("GET", path, params=params)
        except httpx.TimeoutException:
            raise ToolError(f"TaskFlow request timed out after {self.timeout:g}s: GET {path}") from None
        if resp.status_code >= 400:
            err = _extract_api_error(resp.content, resp.status_code)
            raise ToolError(f"TaskFlow API {resp.status_code}: {err}")
        items = resp.json()
        total_header = resp.headers.get("X-Total-Count")
        total = int(total_header) if total_header and total_header.isdigit() else len(items)
        truncated = caller_paged and (params.get("offset", 0) + len(items)) < total
        return {"items": items, "total": total, "truncated": truncated}

    # --- attachments -------------------------------------------------

    async def download_attachment(self, blob_id: str) -> dict:
        """Downloads a file blob, base64-encoded. Refuses files over the cap."""
        self._require_token()
        try:
            resp = await self._send("GET", f"api/attachments/file/{blob_id}")
        except httpx.TimeoutException:
            raise ToolError(f"TaskFlow request timed out after {self.timeout:g}s") from None
        if resp.status_code >= 400:
            err = _extract_api_error(resp.content, resp.status_code)
            if resp.status_code in (401, 403, 404):
                raise ToolError(
                    {401: f"Authentication failed (401): {err}. Check TASKFLOW_API_TOKEN.",
                     403: f"Forbidden (403): {err}. Fix the token's permissions or scope.",
                     404: f"Not found (404): {err}"}[resp.status_code]
                )
            raise ToolError(f"TaskFlow API {resp.status_code}: {err}")

        content = resp.content
        if len(content) > self.max_download_bytes:
            raise ToolError(
                f"Attachment is {len(content)} bytes, above the "
                f"{self.max_download_bytes} byte download cap "
                "(TASKFLOW_MAX_DOWNLOAD_MB). Open it in the TaskFlow UI instead."
            )
        file_name = None
        disposition = resp.headers.get("Content-Disposition", "")
        for part in disposition.split(";"):
            key, _, value = part.strip().partition("=")
            if key == "filename" and value:
                file_name = unquote(value.strip("'\""))
        try:
            encoded = base64.b64encode(content).decode()
        except (binascii.Error, ValueError) as e:  # pragma: no cover
            raise ToolError(f"Failed to encode attachment: {e}") from None
        return {
            "fileName": file_name,
            "mimeType": resp.headers.get("Content-Type", "application/octet-stream"),
            "size": len(content),
            "base64": encoded,
        }

    async def upload_attachment(self, entity_type: str, entity_id: str,
                                file_path: str | None = None, *,
                                content: bytes | None = None,
                                file_name: str | None = None) -> dict:
        """Uploads an attachment (multipart POST), returns the created
        attachment. Source is either file_path (read from the local disk) or
        content (raw bytes, named file_name) — exactly one of them. Size/
        count/file-pattern limits are enforced by the server — a 400 passes
        the server's error text through."""
        self._require_token()
        if (file_path is None) == (content is None):
            raise ToolError("Pass exactly one of file_path or content")
        if content is None:
            path = Path(file_path)
            try:
                content = path.read_bytes()
            except OSError as exc:
                raise ToolError(f"Cannot read file {file_path}: {exc}") from None
            upload_name = path.name
        else:
            upload_name = file_name or "attachment"
        try:
            resp = await self._send(
                "POST",
                "api/attachments/upload",
                files={"file": (upload_name, content)},
                data={"entityId": entity_id, "entityType": entity_type},
            )
        except httpx.TimeoutException:
            raise ToolError(
                f"TaskFlow request timed out after {self.timeout:g}s: POST api/attachments/upload"
            ) from None
        if resp.status_code >= 400:
            err = _extract_api_error(resp.content, resp.status_code)
            if resp.status_code == 400:
                raise ToolError(f"Upload rejected (400): {err}")
            if resp.status_code in (401, 403, 404):
                raise ToolError(
                    {401: f"Authentication failed (401): {err}. Check TASKFLOW_API_TOKEN.",
                     403: f"Forbidden (403): {err}. Fix the token's permissions or scope.",
                     404: f"Not found (404): {err} — is the TaskFlow backend new enough "
                          "to allow token uploads?"}[resp.status_code]
                )
            raise ToolError(f"TaskFlow API {resp.status_code}: {err}")
        return resp.json()
