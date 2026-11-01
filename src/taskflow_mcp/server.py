"""TaskFlow MCP server: exposes the TaskFlow REST API as MCP tools.

Transport: stdio. Auth: a personal API token (Bearer) via TASKFLOW_API_TOKEN.
The tool surface mirrors what tokens can access in TaskFlow; mutations the
API rejects for tokens (webhooks, token management, tag/project/area writes,
release create/update/delete) are intentionally not exposed. Releases
are read-only (release_list/release_get/release_contents); entities are linked
to a release via the release_id field of the task/note/folder tools.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
import re

from mcp.server.fastmcp import FastMCP

from .client import TaskFlowClient, ToolError
from .config import Config, load_config
from .schema_cleanup import cleanup_registered_tools

_client: TaskFlowClient | None = None
_config: Config | None = None


@asynccontextmanager
async def lifespan(_server: FastMCP):
    global _client, _config
    _config = load_config()
    _client = TaskFlowClient(
        api_base=_config.api_base,
        token=_config.token,
        timeout=_config.timeout,
        max_list_items=_config.max_list_items,
        max_download_mb=_config.max_download_mb,
    )
    try:
        yield
    finally:
        await _client.close()
        _client = None


def get_client() -> TaskFlowClient:
    if _client is None:
        raise ToolError("TaskFlow client is not initialized")
    return _client


def get_config() -> Config:
    if _config is None:
        raise ToolError("Server config is not initialized")
    return _config


_HOWTO_SETUP_HINT = (
    "No usage rules are configured for this TaskFlow MCP server.\n\n"
    "The user can define them via server env:\n"
    "- `TASKFLOW_HOWTO` — rules text inline (Markdown), or\n"
    "- `TASKFLOW_HOWTO_FILE` — path to a Markdown file (wins over TASKFLOW_HOWTO).\n\n"
    "Until then, no extra rules apply."
)

_HOWTO_INSTRUCTIONS = (
    "Main session (not a subagent): before using any other tool, call `howto` "
    "to read the user's TaskFlow usage rules and follow them for the whole "
    "session, then call `whoami` to check what the API token is allowed to do. "
    "Subagents: skip `howto` and `whoami` — the main session already knows the "
    "rules and the token permissions; use the tools you were given directly. "
    "Whenever you filter by or set a task status, call `statuses_list` first "
    "— the status set is per-user configuration, not a fixed list."
)


mcp = FastMCP("taskflow", instructions=_HOWTO_INSTRUCTIONS, lifespan=lifespan)


# --- howto ---------------------------------------------------------------

@mcp.tool()
async def howto() -> str:
    """Read the user's rules for working with TaskFlow.

    Main sessions: call this before any other tool and follow the returned
    rules for the whole session (e.g. "always ask before creating tasks").
    Subagents can skip it — the main session applies the rules. The user
    configures the rules via TASKFLOW_HOWTO (inline Markdown text) or
    TASKFLOW_HOWTO_FILE (path to a Markdown file, wins over TASKFLOW_HOWTO)."""
    config = get_config()
    if config.howto_file:
        path = Path(config.howto_file)
        try:
            return path.read_text(encoding="utf-8").rstrip()
        except OSError as exc:
            raise ToolError(
                f"TASKFLOW_HOWTO_FILE points to {path}, which cannot be read: {exc}"
            ) from None
    if config.howto_text:
        return config.howto_text
    return _HOWTO_SETUP_HINT


# --- whoami -------------------------------------------------------------

@mcp.tool()
async def whoami() -> dict:
    """Introspect the configured API token: name, permissions matrix,
    effective project scope (with project names) and expiry.

    Call this once in a main session to learn what the token is allowed to
    do before attempting writes; subagents can skip it. 401/403 errors on
    other tools mean the token or its configuration is wrong — this tool
    shows which part."""
    return await get_client().get("api/token-info")


# --- tasks ---------------------------------------------------------------

@mcp.tool()
async def task_list(
    project_id: str | None = None,
    status: str | None = None,
    parent_id: str | None = None,
    search: str | None = None,
    assignee_id: str | None = None,
    tag_ids: list[str] | None = None,
    due_from: str | None = None,
    due_to: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> dict:
    """List tasks. Returns {"items", "total", "truncated"}.

    Filters: project_id, status (a status id from statuses_list),
    parent_id (pass a task id to list its subtasks), search (matches title,
    description, comments, subtask titles, T-<n> shortId, assignee, exact date
    YYYY-MM-DD), assignee_id, tag_ids (OR semantics: any of the tags),
    due_from/due_to (inclusive, "YYYY-MM-DD" or full ISO; tasks without a due
    date are excluded). Tasks from projects outside the token scope and Inbox
    tasks (no project) are never returned."""
    client = get_client()
    filters: dict[str, object] = {}
    if project_id:
        filters["projectId"] = project_id
    if status:
        filters["status"] = status
    if parent_id:
        filters["parentId"] = parent_id
    if search:
        filters["search"] = search
    if assignee_id:
        filters["assigneeId"] = assignee_id
    if tag_ids:
        filters["tagIds"] = ",".join(tag_ids)
    if due_from:
        filters["dueFrom"] = due_from
    if due_to:
        filters["dueTo"] = due_to
    return await client.get_paged_list("api/tasks", filters, limit, offset)


_SHORT_ID_RE = re.compile(r"^T-(\d+)$", re.IGNORECASE)


async def _resolve_task_id(task_id: str) -> str:
    """Maps a T-<n> shortId to the internal task id (the list endpoint's
    search matches shortIdNum exactly); plain ids pass through untouched."""
    m = _SHORT_ID_RE.match(task_id.strip())
    if not m:
        return task_id
    num = int(m.group(1))
    result = await get_client().get_paged_list("api/tasks", {"search": f"T-{num}"})
    matches = [t for t in result.get("items", []) if t.get("shortIdNum") == num]
    if not matches:
        raise ToolError(
            f"Task T-{num} not found — no task with this shortId is visible to "
            "the token (check the number or the token's project scope)"
        )
    if len(matches) > 1:
        listing = "; ".join(f"{t.get('id')} «{t.get('title', '')}»" for t in matches)
        raise ToolError(
            f"ShortId T-{num} is ambiguous (shortIdNum is per-owner): {listing}. "
            "Retry with the full internal id."
        )
    return str(matches[0]["id"])


@mcp.tool()
async def task_get(task_id: str) -> dict:
    """Get one task by id or T-<n> shortId (e.g. "T-1" — resolved
    automatically). Includes one level of subtasks, the parent task,
    comments and costs."""
    return await get_client().get(f"api/tasks/{await _resolve_task_id(task_id)}")


def _task_body(
    *, description: str | None, status: str | None, priority: str | None,
    due_date: str | None, project_id: str | None, parent_id: str | None,
    assignee_id: str | None, tag_ids: list[str] | None, metadata: dict | None,
    release_id: str | None,
) -> dict:
    body: dict[str, object] = {}
    if description is not None:
        body["description"] = description
    if status is not None:
        body["status"] = status
    if priority is not None:
        body["priority"] = priority
    if due_date is not None:
        body["dueDate"] = due_date
    if project_id is not None:
        body["projectId"] = project_id
    if parent_id is not None:
        body["parentId"] = parent_id
    if assignee_id is not None:
        body["assigneeId"] = assignee_id
    if tag_ids is not None:
        body["tagIds"] = tag_ids
    if metadata is not None:
        body["metadata"] = metadata
    if release_id is not None:
        body["releaseId"] = release_id
    return body


@mcp.tool()
async def task_create(
    title: str,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
    project_id: str | None = None,
    parent_id: str | None = None,
    assignee_id: str | None = None,
    tag_ids: list[str] | None = None,
    metadata: dict | None = None,
    release_id: str | None = None,
) -> dict:
    """Create a task. Required: title. Optional: description, status
    (a status id from statuses_list), priority ("low" | "medium" | "high" |
    "urgent"), due_date ("YYYY-MM-DD" or ISO), project_id, parent_id (set to
    make a subtask — it then inherits the parent's project), assignee_id,
    tag_ids, metadata dict, release_id (bind to a release — see release_list).
    Requires tasks:create; the target project must be in the token scope
    (Inbox is not writable via tokens)."""
    body: dict[str, object] = {"title": title}
    body.update(_task_body(
        description=description, status=status, priority=priority,
        due_date=due_date, project_id=project_id, parent_id=parent_id,
        assignee_id=assignee_id, tag_ids=tag_ids, metadata=metadata,
        release_id=release_id,
    ))
    return await get_client().request("POST", "api/tasks", json_body=body)


@mcp.tool()
async def task_update(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
    project_id: str | None = None,
    parent_id: str | None = None,
    assignee_id: str | None = None,
    tag_ids: list[str] | None = None,
    metadata: dict | None = None,
    sort_order: int | None = None,
    release_id: str | None = None,
) -> dict:
    """Update a task by id or T-<n> shortId. Only the provided fields change;
    omit fields to leave them untouched. status takes a status id from
    statuses_list; priority is one of "low" | "medium" | "high" | "urgent".
    release_id links the task to a release (see release_list) or unlinks it
    when set to an empty string "". Requires tasks:update; moving the task to
    another project requires the target project to be in the token scope."""
    task_id = await _resolve_task_id(task_id)
    body = _task_body(
        description=description, status=status, priority=priority,
        due_date=due_date, project_id=project_id, parent_id=parent_id,
        assignee_id=assignee_id, tag_ids=tag_ids, metadata=metadata,
        release_id=release_id,
    )
    if title is not None:
        body["title"] = title
    if sort_order is not None:
        body["sortOrder"] = sort_order
    return await get_client().request("PUT", f"api/tasks/{task_id}", json_body=body)


@mcp.tool()
async def task_delete(task_id: str) -> dict:
    """Delete a task by id or T-<n> shortId. WARNING: cascades — subtasks,
    comments and attachments of the task are deleted too. Requires tasks:delete."""
    task_id = await _resolve_task_id(task_id)
    return await get_client().request("DELETE", f"api/tasks/{task_id}")


# --- notes ---------------------------------------------------------------

@mcp.tool()
async def note_list(
    project_id: str | None = None,
    folder_id: str | None = None,
    tag_ids: list[str] | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> dict:
    """List notes, sorted by last update. Returns {"items", "total",
    "truncated"}. Filters: project_id, folder_id, tag_ids (OR semantics).
    Notes outside the token scope and Inbox notes are not returned."""
    client = get_client()
    filters: dict[str, object] = {}
    if project_id:
        filters["projectId"] = project_id
    if folder_id:
        filters["folderId"] = folder_id
    if tag_ids:
        filters["tagIds"] = ",".join(tag_ids)
    return await client.get_paged_list("api/notes", filters, limit, offset)


@mcp.tool()
async def note_get(note_id: str) -> dict:
    """Get one note by id (resolve N-<n> shortIds via note_search first).
    Content is Markdown."""
    return await get_client().get(f"api/notes/{note_id}")


@mcp.tool()
async def note_create(
    title: str,
    content: str | None = None,
    project_id: str | None = None,
    folder_id: str | None = None,
    tag_ids: list[str] | None = None,
    release_id: str | None = None,
) -> dict:
    """Create a Markdown note. Required: title (unique per location — a
    duplicate title in the same project/folder is rejected with 409).
    Optional: release_id (bind to a release — see release_list).
    Requires notes:create."""
    body: dict[str, object] = {"title": title}
    if content is not None:
        body["content"] = content
    if project_id is not None:
        body["projectId"] = project_id
    if folder_id is not None:
        body["folderId"] = folder_id
    if tag_ids is not None:
        body["tagIds"] = tag_ids
    if release_id is not None:
        body["releaseId"] = release_id
    return await get_client().request("POST", "api/notes", json_body=body)


@mcp.tool()
async def note_update(
    note_id: str,
    title: str | None = None,
    content: str | None = None,
    project_id: str | None = None,
    folder_id: str | None = None,
    tag_ids: list[str] | None = None,
    release_id: str | None = None,
) -> dict:
    """Update a note (full content replace — content is the complete new
    Markdown, not a diff). Only provided fields change. release_id links the
    note to a release (see release_list) or unlinks it when set to an empty
    string "". Requires notes:update."""
    body: dict[str, object] = {}
    for key, value in (("title", title), ("content", content),
                       ("projectId", project_id), ("folderId", folder_id),
                       ("releaseId", release_id)):
        if value is not None:
            body[key] = value
    if tag_ids is not None:
        body["tagIds"] = tag_ids
    return await get_client().request("PUT", f"api/notes/{note_id}", json_body=body)


@mcp.tool()
async def note_delete(note_id: str) -> dict:
    """Delete a note together with its attachments. Requires notes:delete."""
    return await get_client().request("DELETE", f"api/notes/{note_id}")


@mcp.tool()
async def note_search(
    search: str,
    project_id: str | None = None,
    folder_id: str | None = None,
) -> dict:
    """Search the user's own notes and folders: {"notes", "folders"}.
    Matches title/content (case-insensitive), N-<n> and F-<n> shortIds,
    exact date YYYY-MM-DD or a bare year. folder_id scopes the search to that
    folder's subtree."""
    params: dict[str, object] = {"search": search}
    if project_id:
        params["projectId"] = project_id
    if folder_id:
        params["folderId"] = folder_id
    return await get_client().get("api/notes/search", params=params)


# --- note versions -------------------------------------------------------

@mcp.tool()
async def note_version_list(note_id: str) -> list:
    """List saved versions of a note (newest last), including restore
    operations and manual snapshots."""
    return await get_client().get(f"api/notes/{note_id}/versions")


@mcp.tool()
async def note_version_restore(note_id: str, number: int) -> dict:
    """Restore a note to a saved version: rewinds the live note to that
    snapshot and records a "restore" version. Requires notes:update."""
    return await get_client().request(
        "POST", f"api/notes/{note_id}/versions/{number}/restore"
    )


# --- comments ------------------------------------------------------------

@mcp.tool()
async def comment_list(
    task_id: str,
    limit: int | None = None,
    search: str | None = None,
) -> dict:
    """List comments of a task (task_id accepts the internal id or T-<n> shortId).
    Returns {"items", "total", "truncated"}; items are chronological (oldest
    first). limit keeps the N most recent matching comments. search filters by
    case-insensitive substring of the comment text."""
    items = await get_client().get(
        "api/comments", params={"taskId": await _resolve_task_id(task_id)}
    )
    if search:
        needle = search.lower()
        items = [c for c in items if needle in (c.get("content") or "").lower()]
    total = len(items)
    truncated = limit is not None and total > limit
    if truncated:
        items = items[-limit:]
    return {"items": items, "total": total, "truncated": truncated}


@mcp.tool()
async def comment_create(
    task_id: str,
    content: str,
    parent_id: str | None = None,
) -> dict:
    """Add a comment to a task (task_id accepts the internal id or T-<n>
    shortId). parent_id makes it a threaded reply. Requires comments:create."""
    task_id = await _resolve_task_id(task_id)
    body: dict[str, object] = {"taskId": task_id, "content": content}
    if parent_id is not None:
        body["parentId"] = parent_id
    return await get_client().request("POST", "api/comments", json_body=body)


@mcp.tool()
async def comment_update(comment_id: str, content: str) -> dict:
    """Edit a comment (author or task owner only). Requires comments:update."""
    return await get_client().request(
        "PUT", f"api/comments/{comment_id}", json_body={"content": content}
    )


@mcp.tool()
async def comment_delete(comment_id: str) -> dict:
    """Delete a comment (author or task owner only). Requires comments:delete."""
    return await get_client().request("DELETE", f"api/comments/{comment_id}")


# --- folders -------------------------------------------------------------

@mcp.tool()
async def folder_list(
    project_id: str | None = None,
    parent_id: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> dict:
    """List note folders. Returns {"items", "total", "truncated"}.
    Filters: project_id, parent_id (children of a folder). Requires notes:read."""
    client = get_client()
    filters: dict[str, object] = {}
    if project_id:
        filters["projectId"] = project_id
    if parent_id:
        filters["parentId"] = parent_id
    return await client.get_paged_list("api/folders", filters, limit, offset)


@mcp.tool()
async def folder_create(
    name: str,
    project_id: str | None = None,
    parent_id: str | None = None,
    release_id: str | None = None,
) -> dict:
    """Create a note folder (optionally inside a project and/or a parent
    folder, max depth 3). Name is unique per location (409 on duplicates).
    Optional: release_id (bind to a release — see release_list).
    Requires notes:create."""
    body: dict[str, object] = {"name": name}
    if project_id is not None:
        body["projectId"] = project_id
    if parent_id is not None:
        body["parentId"] = parent_id
    if release_id is not None:
        body["releaseId"] = release_id
    return await get_client().request("POST", "api/folders", json_body=body)


@mcp.tool()
async def folder_update(
    folder_id: str,
    name: str | None = None,
    parent_id: str | None = None,
    release_id: str | None = None,
) -> dict:
    """Rename a folder and/or move it under another folder. release_id links
    the folder to a release (see release_list) or unlinks it when set to an
    empty string "". Requires notes:update."""
    body: dict[str, object] = {}
    if name is not None:
        body["name"] = name
    if parent_id is not None:
        body["parentId"] = parent_id
    if release_id is not None:
        body["releaseId"] = release_id
    return await get_client().request("PUT", f"api/folders/{folder_id}", json_body=body)


@mcp.tool()
async def folder_delete(folder_id: str) -> dict:
    """Delete a folder (its child folders/notes keep existing, detached).
    Requires notes:delete."""
    return await get_client().request("DELETE", f"api/folders/{folder_id}")


# --- releases (read-only) ------------------------------------------------

@mcp.tool()
async def release_list(project_id: str | None = None) -> list:
    """List releases, ordered by sortOrder. Optional project_id filter. Each
    item carries linked entity counts and its project. Read-only: releases
    are exposed to API tokens for reading only — creating, editing and
    deleting releases is session-only in TaskFlow (use the UI). Visibility of
    the token's user applies. Entities are linked to releases via the
    release_id field of task/note/folder tools."""
    params = {"projectId": project_id} if project_id else None
    return await get_client().get("api/releases", params=params)


@mcp.tool()
async def release_get(release_id: str) -> dict:
    """Get one release by id (the id, not the R-<n> shortId — resolve via
    release_list). Includes linked entity counts and the parent project."""
    return await get_client().get(f"api/releases/{release_id}")


@mcp.tool()
async def release_contents(release_id: str) -> dict:
    """Get the composition of a release: {"release", "tasks", "notes",
    "folders"} — the release plus all entities bound to it. The project's
    task/note/folder lists are fetched and filtered by releaseId, so this
    needs read access to all three; for large projects prefer filtering
    task_list/note_list/folder_list yourself."""
    client = get_client()
    release = await client.get(f"api/releases/{release_id}")
    project_id = release.get("projectId") if isinstance(release, dict) else None
    if not project_id:
        return {"release": release, "tasks": [], "notes": [], "folders": []}
    tasks = await client.get_paged_list("api/tasks", {"projectId": project_id})
    notes = await client.get_paged_list("api/notes", {"projectId": project_id})
    folders = await client.get_paged_list("api/folders", {"projectId": project_id})
    return {
        "release": release,
        "tasks": [t for t in tasks["items"] if t.get("releaseId") == release_id],
        "notes": [n for n in notes["items"] if n.get("releaseId") == release_id],
        "folders": [f for f in folders["items"] if f.get("releaseId") == release_id],
    }


# --- navigation / metadata (read-only) -----------------------------------

@mcp.tool()
async def project_list(area_id: str | None = None) -> list:
    """List visible projects (optionally filtered by area). Only projects in
    the token scope are returned. Each item carries task/note counts."""
    params = {"areaId": area_id} if area_id else None
    return await get_client().get("api/projects", params=params)


@mcp.tool()
async def area_list() -> list:
    """List areas that contain in-scope projects."""
    return await get_client().get("api/areas")


@mcp.tool()
async def tag_list() -> list:
    """List the user's tags (id, name, color). Use tag ids with tag_ids
    filters of task_list/note_list."""
    return await get_client().get("api/tags")


@mcp.tool()
async def statuses_list() -> list:
    """List the task statuses available to the token's user — the same set
    their Kanban settings screen shows ({"id", "label", "color", "visible"}).
    The set is per-user/installation config, so don't assume a fixed list:
    use a status `id` as the `status` value in task_list/task_create/
    task_update. An unknown status id is stored as-is and shows as
    "Invalid state" in the UI."""
    return (await get_client().get("api/statuses"))["statuses"]


# --- attachments ---------------------------------------------------------

@mcp.tool()
async def attachment_list(
    entity_id: str,
    entity_type: Literal["task", "note", "comment"],
) -> list:
    """List attachments of a task, note or comment (deduplicated blobs).
    A task entity_id accepts the internal id or T-<n> shortId.
    Requires read access to the parent entity."""
    if entity_type == "task":
        entity_id = await _resolve_task_id(entity_id)
    return await get_client().get(
        "api/attachments", params={"entityId": entity_id, "entityType": entity_type}
    )


@mcp.tool()
async def attachment_get(blob_id: str) -> dict:
    """Download an attachment blob by blobId (from attachment_list):
    {"fileName", "mimeType", "size", "base64"}. Refuses files above the
    configured download cap — use the TaskFlow UI for large files."""
    return await get_client().download_attachment(blob_id)


@mcp.tool()
async def attachment_upload(
    entity_id: str,
    entity_type: Literal["task", "note", "comment"],
    file_path: str,
) -> dict:
    """Upload a local file as an attachment to a task, note or comment.
    A task entity_id accepts the internal id or T-<n> shortId.
    file_path is a path on the machine running this MCP server; it must
    exist and be a regular file. Requires update permission on the parent
    entity (and the parent's project in the token scope). Size, per-entity
    count and file-type limits are enforced by the server — its error text
    is passed through when a limit is hit. Returns the created attachment."""
    if entity_type == "task":
        entity_id = await _resolve_task_id(entity_id)
    path = Path(file_path).expanduser()
    if not path.is_file():
        raise ToolError(
            f"File not found (or not a regular file): {file_path} — pass an "
            "existing local file path"
        )
    return await get_client().upload_attachment(entity_type, entity_id, str(path))


@mcp.tool()
async def attachment_delete(attachment_id: str) -> dict:
    """Remove an attachment link from its entity (the blob is freed when no
    other entity references it). Requires delete permission on the parent."""
    return await get_client().request("DELETE", "api/attachments",
                                      params={"id": attachment_id})


# --- global search -------------------------------------------------------

@mcp.tool()
async def search(q: str, limit: int | None = None) -> dict:
    """Global search across TaskFlow in one call: {"q", "tasks", "notes",
    "folders", "projects"}. Task matching: title/description/comments/subtask
    titles/T-<n> shortId/assignee/exact date; note matching: title/content/
    N-<n>/F-<n>/date/year; projects by name. Sections the token has no read
    permission for are omitted; each section is capped (limit, 1..100,
    default 20). Scope-restricted tokens only see in-scope results."""
    params: dict[str, object] = {"q": q}
    if limit is not None:
        params["limit"] = limit
    return await get_client().get("api/search", params=params)


def main() -> None:
    # shrink published schemas before serving; validation is unaffected
    # (it uses func_metadata, not these dicts)
    cleanup_registered_tools(mcp)
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
