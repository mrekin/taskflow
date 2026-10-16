"""Post-processing of registered tool JSON schemas.

FastMCP builds each tool's published `parameters` schema straight from the
pydantic model of the function signature. That model carries boilerplate the
consuming model does not need: `title` fields echoing parameter names,
`anyOf: [{...}, {"type": "null"}]` wrappers around optional arguments,
redundant `default: null` and `additionalProperties: true`. This module
strips that noise in place after all tools are registered, shrinking the
tools block of every API request (it is re-sent with each request, so every
kilobyte of it is paid on every turn).

Call-time argument validation is unaffected: the server validates against
each tool's `func_metadata` (the pydantic model), never against the
published schema.
"""

from __future__ import annotations

import json
import sys
from typing import Any

# schema subtrees whose dict keys are NAMES (parameter names etc.), not schema
# keywords — their values get stripped, the keys themselves must survive
# (task_create really does have a "title" parameter)
_NAME_KEYED_CONTAINERS = ("properties", "patternProperties", "$defs", "definitions")


def _collapse_optional(schema: dict[str, Any]) -> dict[str, Any]:
    """anyOf: [<schema with type>, {"type": "null"}] -> same schema, type + "null".

    pydantic renders `T | None` as a two-branch anyOf; JSON Schema says the
    same with a type array, which is shorter and reads better for the model.
    Non-collapsible inputs are returned unchanged.
    """
    items = schema.get("anyOf")
    if not isinstance(items, list) or len(items) != 2:
        return schema
    null_idx = [
        i for i, it in enumerate(items)
        if isinstance(it, dict) and set(it) == {"type"} and it["type"] == "null"
    ]
    if len(null_idx) != 1:
        return schema
    real = items[1 - null_idx[0]]
    if not isinstance(real, dict):
        return schema
    rtype = real.get("type")
    if isinstance(rtype, str):
        merged: dict[str, Any] = {**real, "type": [rtype, "null"]}
    elif isinstance(rtype, list):
        merged = dict(real) if "null" in rtype else {**real, "type": [*rtype, "null"]}
    else:
        return schema
    # keep wrapper-level keys the real branch lacks (e.g. a description)
    for key, value in schema.items():
        if key != "anyOf":
            merged.setdefault(key, value)
    return merged


def _merge_type_anyof(schema: dict[str, Any]) -> dict[str, Any]:
    """anyOf of bare {"type": <str>} items -> {"type": [<str>, ...]}."""
    items = schema.get("anyOf")
    if not isinstance(items, list) or not items:
        return schema
    if all(
        isinstance(it, dict) and set(it) == {"type"} and isinstance(it["type"], str)
        for it in items
    ):
        merged = {"type": [it["type"] for it in items]}
        for key, value in schema.items():
            if key != "anyOf":
                merged[key] = value
        return merged
    return schema


def strip_schema_boilerplate(schema: Any) -> Any:
    """Return a cleaned copy of a JSON schema (recursively)."""
    if isinstance(schema, list):
        return [strip_schema_boilerplate(item) for item in schema]
    if not isinstance(schema, dict):
        return schema
    schema = _collapse_optional(schema)
    schema = _merge_type_anyof(schema)
    out: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "title":
            continue
        if key == "default" and value is None:
            continue
        if key == "additionalProperties" and value is True:
            continue
        if key in _NAME_KEYED_CONTAINERS and isinstance(value, dict):
            out[key] = {name: strip_schema_boilerplate(sub)
                        for name, sub in value.items()}
        else:
            out[key] = strip_schema_boilerplate(value)
    return out


def cleanup_registered_tools(mcp: Any) -> tuple[int, int]:
    """Strip boilerplate from the published schema of every registered tool.

    Only the schema the client sees is patched; argument validation keeps
    using each tool's pydantic model (`func_metadata`). Idempotent.

    Returns (before_bytes, after_bytes) — total compact-JSON size of all
    tool schemas. On an unexpected registry layout, leaves schemas as-is
    and says so on stderr (a broken schema pass must not take the server
    down with it).
    """
    tools = getattr(getattr(mcp, "_tool_manager", None), "_tools", None)
    if not isinstance(tools, dict):
        print("schema_cleanup: tool registry not found, schemas left as-is",
              file=sys.stderr)
        return 0, 0
    before = after = 0
    for tool in tools.values():
        parameters = getattr(tool, "parameters", None)
        if not isinstance(parameters, dict):
            continue
        before += len(json.dumps(parameters, separators=(",", ":")))
        cleaned = strip_schema_boilerplate(parameters)
        after += len(json.dumps(cleaned, separators=(",", ":")))
        tool.parameters = cleaned
    return before, after
