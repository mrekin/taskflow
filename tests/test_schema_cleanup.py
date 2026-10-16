"""Tests for schema_cleanup: boilerplate stripping of published tool schemas."""

import json
import unittest
from types import SimpleNamespace

from taskflow_mcp.schema_cleanup import cleanup_registered_tools, strip_schema_boilerplate


def compact(schema) -> int:
    return len(json.dumps(schema, separators=(",", ":")))


class StripBoilerplateTests(unittest.TestCase):
    def test_strips_title_none_default_and_true_additional_properties(self):
        schema = {
            "additionalProperties": True,
            "title": "TaskCreateArguments",
            "type": "object",
            "properties": {
                "title": {"title": "Title", "type": "string"},
                "metadata": {
                    "anyOf": [
                        {"additionalProperties": True, "title": "Metadata", "type": "object"},
                        {"type": "null"},
                    ],
                    "default": None,
                    "title": "Metadata",
                },
                "items": {"items": {"title": "Item", "type": "string"}, "title": "Items",
                          "type": "array"},
            },
            "required": ["title"],
        }
        self.assertEqual(
            strip_schema_boilerplate(schema),
            {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "metadata": {"type": ["object", "null"]},
                    "items": {"items": {"type": "string"}, "type": "array"},
                },
                "required": ["title"],
            },
        )

    def test_optional_collapse_keeps_items_and_description(self):
        # the real shape of task_create's tag_ids after pydantic
        schema = {
            "anyOf": [
                {"items": {"type": "string"}, "type": "array"},
                {"type": "null"},
            ],
            "default": None,
            "title": "Tag Ids",
            "description": "OR semantics: any of the tags",
        }
        self.assertEqual(
            strip_schema_boilerplate(schema),
            {"type": ["array", "null"], "items": {"type": "string"},
             "description": "OR semantics: any of the tags"},
        )

    def test_bare_type_anyof_merges_in_order(self):
        schema = {"anyOf": [{"type": "string"}, {"type": "integer"}, {"type": "null"}],
                  "default": None, "title": "Q"}
        self.assertEqual(strip_schema_boilerplate(schema),
                         {"type": ["string", "integer", "null"]})

    def test_meaningful_constraints_survive(self):
        schema = {
            "additionalProperties": False,
            "default": "medium",
            "description": "keep me",
            "enum": ["low", "medium"],
            "title": "Priority",
            "type": "string",
        }
        self.assertEqual(strip_schema_boilerplate(schema), {
            "additionalProperties": False,
            "default": "medium",
            "description": "keep me",
            "enum": ["low", "medium"],
            "type": "string",
        })

    def test_non_collapsible_anyof_left_alone(self):
        # inner branches carry extra keys (not bare types) and the outer real
        # branch has no type — nothing may be merged, structure must survive
        schema = {"anyOf": [{"anyOf": [{"type": "string", "format": "date"},
                                       {"type": "integer", "minimum": 0}]},
                            {"type": "null"}]}
        cleaned = strip_schema_boilerplate(schema)
        self.assertEqual(cleaned["anyOf"][0]["anyOf"],
                         [{"type": "string", "format": "date"},
                          {"type": "integer", "minimum": 0}])
        self.assertEqual(cleaned["anyOf"][1], {"type": "null"})

    def test_scalars_and_lists_pass_through(self):
        self.assertEqual(strip_schema_boilerplate({"type": "string"}), {"type": "string"})
        self.assertEqual(strip_schema_boilerplate([1, "x"]), [1, "x"])
        self.assertEqual(strip_schema_boilerplate("flat"), "flat")

    def test_idempotent(self):
        schema = {
            "anyOf": [{"items": {"type": "string"}, "type": "array"}, {"type": "null"}],
            "default": None,
            "title": "Tag Ids",
            "type": "object",
        }
        once = strip_schema_boilerplate(schema)
        self.assertEqual(strip_schema_boilerplate(once), once)


class CleanupRegisteredToolsTests(unittest.TestCase):
    def _registry(self, *schemas):
        tools = {f"t{i}": SimpleNamespace(parameters=s) for i, s in enumerate(schemas)}
        return SimpleNamespace(_tool_manager=SimpleNamespace(_tools=tools))

    def test_patches_tools_in_place_and_reports_sizes(self):
        dirty = {"title": "T", "type": "object", "additionalProperties": True,
                 "properties": {"q": {"title": "Q", "type": "string"}}}
        clean = {"type": "object", "properties": {"q": {"type": "string"}}}
        mcp = self._registry(dirty, {"type": "string"})
        before, after = cleanup_registered_tools(mcp)
        self.assertEqual(mcp._tool_manager._tools["t0"].parameters, clean)
        self.assertEqual(before, compact(dirty) + compact({"type": "string"}))
        self.assertEqual(after, compact(clean) + compact({"type": "string"}))
        self.assertLess(after, before)

    def test_missing_registry_is_a_noop(self):
        before, after = cleanup_registered_tools(SimpleNamespace())
        self.assertEqual((before, after), (0, 0))

    def test_idempotent_on_registered_tools(self):
        dirty = {"title": "T", "type": "object",
                 "properties": {"q": {"anyOf": [{"type": "string"}, {"type": "null"}],
                                      "default": None}}}
        mcp = self._registry(dirty)
        _, after_first = cleanup_registered_tools(mcp)
        _, after_second = cleanup_registered_tools(mcp)
        self.assertEqual(after_first, after_second)


class RealSchemaRegressionTest(unittest.TestCase):
    def test_taskflow_like_schema_shrinks_by_a_third(self):
        # pydantic-flavoured sample mirroring task_create's dirty shape
        schema = {
            "additionalProperties": False,
            "properties": {
                "title": {"title": "Title", "type": "string"},
                "description": {"anyOf": [{"type": "string"}, {"type": "null"}],
                                "default": None, "title": "Description"},
                "priority": {"anyOf": [{"type": "string"}, {"type": "null"}],
                             "default": None, "title": "Priority"},
                "due_date": {"anyOf": [{"type": "string"}, {"type": "null"}],
                             "default": None, "title": "Due Date"},
                "project_id": {"anyOf": [{"type": "string"}, {"type": "null"}],
                               "default": None, "title": "Project Id"},
                "tag_ids": {"anyOf": [{"items": {"type": "string"}, "type": "array"},
                                      {"type": "null"}],
                            "default": None, "title": "Tag Ids"},
                "metadata": {"anyOf": [{"additionalProperties": True, "type": "object"},
                                       {"type": "null"}],
                             "default": None, "title": "Metadata"},
            },
            "required": ["title"],
            "title": "task_createArguments",
            "type": "object",
        }
        cleaned = strip_schema_boilerplate(schema)
        self.assertLess(compact(cleaned), compact(schema) * 0.67)
        # the cleaned schema stays valid enough to keep what matters
        self.assertEqual(set(cleaned["required"]), {"title"})
        self.assertEqual(cleaned["properties"]["tag_ids"]["type"], ["array", "null"])


if __name__ == "__main__":
    unittest.main()
