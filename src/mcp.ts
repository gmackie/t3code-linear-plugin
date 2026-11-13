#!/usr/bin/env bun
// Stdio entry point for the MCP-native Linear plugin (manifest v2 `mcpServer`).
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { loadConfig } from "./config.ts";
import { createLinearMcpServer } from "./server.ts";

const server = createLinearMcpServer({ config: loadConfig() });
await server.connect(new StdioServerTransport());
