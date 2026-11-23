# T3 Code Kanbanger plugin

Kanbanger issues and work graph for T3 Code. This repository was the Linear plugin; from 0.3.0 it is Kanbanger-only.

## Plugin (manifest v2)

The plugin is the manifest `t3-plugin.json` plus Kanbanger's **hosted** MCP server, `https://tasks.gmac.io/mcp`. It has no local process.

- **Tools:** agents get every Kanbanger tool (workspaces, projects, issues, comments, workflow states, work items, documents, source anchors, delivery evidence) through Settings → Tools.
- **Auth:** OAuth (`mcp:read`, `mcp:write`). T3 does discovery, registration, PKCE and refresh. No token is stored in the manifest.
- **Panel:** `board` (project, also an Issues tab) renders `ui://kanbanger/board`, the issues assigned to you by status, with issue detail, status changes and comments. Opened without a tool result, it picks your first workspace and offers a workspace picker. `my_issues` also renders it inline after an agent calls it.
- **Panel:** `specs` (project, also an Issues tab) renders `ui://kanbanger/specs`, planning specs by stage with open questions, the latest revision's author and the latest Bob dispatch. It is read-only; approval happens in Kanbanger's web tracker. `list_specs` also renders it inline.

Install from Settings → Plugins → MCP plugins with this repository's directory. If the old `com.t3code.linear` plugin is installed, uninstall it first; its stored API key goes with it.

## Tests

```sh
bun install
bun test                                    # manifest
KANBANGER_MCP_TOKEN=<access token> bun test # + live check of the panel's view
```
