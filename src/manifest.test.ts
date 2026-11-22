import { describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import manifest from "../t3-plugin.json" with { type: "json" };
import { validateManifestV2 } from "./manifest.ts";

describe("v2 manifest", () => {
  it("matches the shape T3 installs", () => {
    expect(validateManifestV2(manifest)).toEqual([]);
  });

  it("reaches hosted Kanbanger over OAuth, with no stored token and no T3 callbacks", () => {
    expect(manifest.mcpServer.transport).toEqual({
      type: "http",
      url: "https://tasks.gmac.io/mcp",
      headers: [],
      auth: { type: "oauth", scopes: ["mcp:read", "mcp:write"] },
    });
    expect(manifest.t3Tools).toEqual([]);
  });
});

// Opt-in: KANBANGER_MCP_TOKEN=<OAuth access token>, optionally KANBANGER_MCP_URL.
const liveToken = process.env.KANBANGER_MCP_TOKEN;
describe.skipIf(!liveToken)("manifest against hosted Kanbanger", () => {
  it("serves every panel's view, opened by a tool the view may call", async () => {
    const client = new Client({ name: "kanbanger-plugin-test", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(process.env.KANBANGER_MCP_URL ?? manifest.mcpServer.transport.url), {
        requestInit: { headers: { Authorization: `Bearer ${liveToken}` } },
      }),
    );
    try {
      const { resources } = await client.listResources();
      const { tools } = await client.listTools();
      for (const panel of manifest.contributes.panels) {
        expect(resources.find((r) => r.uri === panel.resourceUri)?.mimeType).toBe("text/html;profile=mcp-app");
        const opener = tools.find((t) => (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri === panel.resourceUri);
        expect((opener?._meta as { ui?: { visibility?: string[] } } | undefined)?.ui?.visibility).toContain("app");
      }
    } finally {
      await client.close();
    }
  });
});
