"""Environment-based configuration for the TaskFlow MCP server."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _env_choice(name: str, default: str, allowed: tuple[str, ...]) -> str:
    raw = os.environ.get(name, "").strip().lower()
    return raw if raw in allowed else default


_LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")


def is_loopback_host(host: str) -> bool:
    return host.strip().lower() in _LOOPBACK_HOSTS


@dataclass(frozen=True)
class Config:
    api_base: str  # ends with "/", httpx-safe base for relative paths
    token: str  # may be empty -> every tool fails with a clear message
    timeout: float
    max_list_items: int
    max_download_mb: int
    howto_text: str  # user's usage rules, inline (empty -> try howto_file)
    howto_file: str  # path to a Markdown rules file (wins over howto_text)
    transport: str  # "stdio" (default) or "streamable-http"
    host: str  # bind address for the HTTP transport
    port: int  # bind port for the HTTP transport
    mcp_path: str  # URL path of the MCP endpoint (HTTP transport)
    auth_token: str  # shared secret for the HTTP endpoint (empty -> open)
    stateless_http: bool  # stateless HTTP sessions (per-request, no session id)


def load_config() -> Config:
    load_dotenv()  # no-op when there is no .env file

    api_base_override = os.environ.get("TASKFLOW_API_BASE", "").strip()
    if api_base_override:
        api_base = api_base_override
    else:
        url = os.environ.get("TASKFLOW_URL", "http://localhost:3000").strip().rstrip("/")
        base_path = os.environ.get("TASKFLOW_BASE_PATH", "").strip().rstrip("/")
        api_base = f"{url}{base_path}"

    # httpx joins base_url + relative path ("api/..."), so the base must end
    # with "/" and must NOT include the /api segment itself
    return Config(
        api_base=api_base.rstrip("/") + "/",
        token=os.environ.get("TASKFLOW_API_TOKEN", "").strip(),
        timeout=float(_env_int("TASKFLOW_TIMEOUT", 30)),
        max_list_items=_env_int("TASKFLOW_MAX_LIST_ITEMS", 200),
        max_download_mb=_env_int("TASKFLOW_MAX_DOWNLOAD_MB", 5),
        howto_text=os.environ.get("TASKFLOW_HOWTO", "").strip(),
        howto_file=os.environ.get("TASKFLOW_HOWTO_FILE", "").strip(),
        transport=_env_choice(
            "TASKFLOW_MCP_TRANSPORT", "stdio", ("stdio", "streamable-http", "both")
        ),
        host=os.environ.get("TASKFLOW_MCP_HOST", "127.0.0.1").strip(),
        port=_env_int("TASKFLOW_MCP_PORT", 8000),
        mcp_path=os.environ.get("TASKFLOW_MCP_PATH", "/mcp").strip() or "/mcp",
        auth_token=os.environ.get("TASKFLOW_MCP_AUTH_TOKEN", "").strip(),
        stateless_http=_env_bool("TASKFLOW_MCP_STATELESS", False),
    )
