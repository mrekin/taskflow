"""Tests for config: network-mode env parsing (transport, host/port, auth)."""

import os
import unittest
from unittest import mock

from taskflow_mcp.config import is_loopback_host, load_config


class NetworkConfigTests(unittest.TestCase):
    def test_defaults_are_stdio_loopback_open(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            cfg = load_config()
        self.assertEqual(cfg.transport, "stdio")
        self.assertEqual(cfg.host, "127.0.0.1")
        self.assertEqual(cfg.port, 8000)
        self.assertEqual(cfg.mcp_path, "/mcp")
        self.assertEqual(cfg.auth_token, "")
        self.assertFalse(cfg.stateless_http)

    def test_streamable_http_settings_from_env(self):
        env = {
            "TASKFLOW_MCP_TRANSPORT": "streamable-http",
            "TASKFLOW_MCP_HOST": "0.0.0.0",
            "TASKFLOW_MCP_PORT": "9123",
            "TASKFLOW_MCP_PATH": "/taskflow-mcp",
            "TASKFLOW_MCP_AUTH_TOKEN": "s3cret",
            "TASKFLOW_MCP_STATELESS": "true",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = load_config()
        self.assertEqual(cfg.transport, "streamable-http")
        self.assertEqual(cfg.host, "0.0.0.0")
        self.assertEqual(cfg.port, 9123)
        self.assertEqual(cfg.mcp_path, "/taskflow-mcp")
        self.assertEqual(cfg.auth_token, "s3cret")
        self.assertTrue(cfg.stateless_http)

    def test_invalid_transport_and_port_fall_back_to_defaults(self):
        env = {
            "TASKFLOW_MCP_TRANSPORT": "websocket",
            "TASKFLOW_MCP_PORT": "not-a-number",
            "TASKFLOW_MCP_STATELESS": "maybe",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = load_config()
        self.assertEqual(cfg.transport, "stdio")
        self.assertEqual(cfg.port, 8000)
        self.assertFalse(cfg.stateless_http)

    def test_is_loopback_host(self):
        self.assertTrue(is_loopback_host("127.0.0.1"))
        self.assertTrue(is_loopback_host("localhost"))
        self.assertTrue(is_loopback_host("::1"))
        self.assertTrue(is_loopback_host(" LocalHost "))
        self.assertFalse(is_loopback_host("0.0.0.0"))
        self.assertFalse(is_loopback_host("192.168.1.10"))


if __name__ == "__main__":
    unittest.main()
