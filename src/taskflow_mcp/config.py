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


@dataclass(frozen=True)
class Config:
    api_base: str  # ends with "/", httpx-safe base for relative paths
    token: str  # may be empty -> every tool fails with a clear message
    timeout: float
    max_list_items: int
    max_download_mb: int


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
    )
