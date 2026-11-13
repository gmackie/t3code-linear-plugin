# T3 Code Linear plugin

An independently installable T3 Code plugin for Linear and Linear-compatible GraphQL endpoints such as Kanbanger. Bob does not depend on it; Bob owns its own Bob-to-Linear links.

The plugin is an MCP server (`src/mcp.ts`, stdio) described by a v2 manifest (`t3-plugin.json`). Version 0.2.0 replaced the v1 managed-app runtime and plugin RPC (T3CODE-75); T3 builds that only load v1 manifests cannot load it.

## MCP server

A stdio server on the official MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). Views are MCP Apps: `ui://` HTML resources with the `text/html;profile=mcp-app` MIME type.

- `linear_issues` lists projects and a project's issues, and renders `ui://linear/issues.html`. The view has a project picker and a filter, refreshes every `LINEAR_POLL_SECONDS`, and opens an issue's review inline.
- `linear_issue_review` shows one issue (id or identifier such as `ENG-123`) with its team's workflow states, and renders `ui://linear/issue-review.html`. **Start work in this thread** sends the issue to the current thread as your message.
- `linear_issue_create` and `linear_issue_update` are agent tools that create an issue in a project or change an issue's title, description or state.

The `linear-issues` panel is project-scoped. The `Linear: Open issues` command opens it.

### Configuration

| Env var | Old setting | Notes |
|---|---|---|
| `LINEAR_API_URL` | `linear.endpoint` | Default `https://api.linear.app/graphql`; e.g. `https://tasks.gmac.io/graphql` for Kanbanger |
| `LINEAR_API_TOKEN` | `linear.api-token` | Secret. Linear personal API key, Linear OAuth token, or Kanbanger API key |
| `LINEAR_POLL_SECONDS` | `linear.polling-seconds` | 15–3600, default 60 |

Without a token the server still starts; each tool returns an error naming the missing setting.

### Run it

```sh
bun install
bun test                # domain, MCP server (against a local fake endpoint), view and install tests
bun run typecheck
LINEAR_API_TOKEN=... bun run inspect   # official MCP Inspector (Apps tab)
```

Install this directory through T3's plugin installer after `bun install --frozen-lockfile`, then set the endpoint and API key on the connected server. Web, desktop and mobile can open the panel; mobile uses the server installation.

See `docs/manifest-v2.md` for the v1 → v2 mapping, the server rules and the open questions.
