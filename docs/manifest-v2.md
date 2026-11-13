# Linear manifest v2 (T3CODE-75)

`t3-plugin.json` follows the MCP-native plugin design from T3CODE-74, the same shape as the Bob plugin (`gmackie/t3code-bob-plugin` v0.2.1). T3 loads it into its server-owned MCP registry.

## Shape

- `mcpServer` reuses `McpServerConfig` and `McpServerVariable` from Settings → Tools (`packages/contracts/src/agentTools.ts`):
  - `name`: `linear`.
  - `transport`: stdio, `bun ${pluginRoot}/src/mcp.ts`, with `env` as `McpServerVariable[]`.
  - `LINEAR_API_TOKEN` is `sensitive`.
- `contributes.panels[]`:
  - `linear-issues` (`scope: project`) renders `ui://linear/issues.html`. Its opening tool is `linear_issues` with no arguments, so the panel starts with the project list (or the issues, when the token sees exactly one project).
- `contributes.commands[]`: `linear-open-issues` opens that panel.
- `t3Tools` is `[]`. The plugin never calls back into T3 (see the mapping below).

The issue review needs no manifest entry. `linear_issue_review` declares `_meta.ui.resourceUri: ui://linear/issue-review.html` and renders inline wherever the host shows tool calls as MCP Apps. The issues panel opens the same review inline.

## v1 → v2 mapping

The v1 manifest is at commit b24ef7d. Its stdio runtime (`src/stdio.ts`) was a generic stub: `surface.get`, `panel.get` and `workflow.get` returned "Plugin surface ready" placeholders and `action.execute` accepted everything. The real behaviour lived only in `src/issues.ts`/`src/rpc.ts`, which nothing launched. v2 serves that domain code over MCP.

| v1 | v2 |
|---|---|
| `runtime` (managed-app, `bun src/stdio.ts`) | `mcpServer.transport` (stdio, `bun ${pluginRoot}/src/mcp.ts`) |
| `panels[linear.issues]` (project surface) | `panels[linear-issues]`, `scope: project`, opening tool `linear_issues` |
| `workflows[linear.issue-review]` (thread.main) | Tool `linear_issue_review` with its own `ui://linear/issue-review.html` view |
| RPC `projects.list` | `linear_issues` without `projectId` |
| RPC `workItems.list` | `linear_issues` with `projectId` (optional `query` filter) |
| RPC `workItems.create` | `linear_issue_create` (agent tool). Resolves the project's team, which Linear's `issueCreate` requires |
| RPC `workItems.update` | `linear_issue_update` (agent tool). Takes `title`, `description` and `stateId` instead of a raw `IssueUpdateInput` |
| RPC `workflow.get` (projectId + itemId) | `linear_issue_review` (issue id or identifier) |
| `action.execute` "approve" | The review's **Start work in this thread** button (see below) |
| `settings[linear.endpoint]` | `LINEAR_API_URL`, default `https://api.linear.app/graphql`. A bare origin (the v1 default `https://api.linear.app`) gets `/graphql` |
| `settings[linear.api-token]`, `capabilities.secrets.read [LINEAR_API_KEY]` | `LINEAR_API_TOKEN`, `sensitive` |
| `settings[linear.polling-seconds]` | `LINEAR_POLL_SECONDS`, clamped to 15–3600, default 60 |
| `settings[linear.workspace]` | Removed. Nothing read it, and neither Linear nor Kanbanger takes a workspace on the wire: the API key decides the workspace |
| `settingsPanels[linear.connection]` | Dropped. The `env` titles and descriptions label T3's install form |
| `capabilities.network.connect [api.linear.app]` | Dropped. The server process calls the configured endpoint; views go through `tools/call` |
| `capabilities.ui.embed` | Implied by `panels` |
| `capabilities.threads.read`, `threads.dispatch` (`projectIds: []`) | `t3Tools: []`. See "Starting work from an issue" |
| `hooks [project.opened, thread.created]` | Dropped (D4). The v1 runtime never handled either event; the panel loads on open and refreshes every `LINEAR_POLL_SECONDS` |

## Starting work from an issue

v1's workflow ended in "Open T3 thread from issue" and requested `threads.dispatch`, but with an empty `projectIds` grant and a stub runtime it never did anything. v2 does the closest honest thing without T3 tools: **Start work in this thread** sends the issue (key, title, status, labels, URL and up to 4,000 characters of description) into the current thread as the user's own message, through MCP Apps `ui/message`. That makes it a human action by construction, so no app-only approval tool is needed. Nothing is persisted, so the processes stay stateless.

Where the host has no thread to post to (a project panel outside a thread), the host rejects `ui/message` and the view shows that error. Launching a new T3 thread from a project panel would need `t3_thread_launch` and is not supported.

## Server rules

- **Visibility.** `linear_issues` and `linear_issue_review` are `["model", "app"]`: agents read with them and the views call them. `linear_issue_create` and `linear_issue_update` are agent tools without UI. No tool is app-only, because the only human confirmation is the `ui/message` the human sends.
- **Unconfigured start.** The server starts without a token. Each tool returns `isError` naming `LINEAR_API_TOKEN` (or an invalid `LINEAR_API_URL`); it never returns placeholder data.
- **Upstream errors.** Requests time out after 15s. 5xx, 401/403, network and timeout errors are short messages without the endpoint URL or response body. GraphQL error messages (e.g. "Entity not found") are passed through, truncated to 200 characters.
- **Auth header.** Linear personal API keys and Kanbanger keys are sent as `Authorization: <key>`, like the `linear` CLI. Linear OAuth tokens (`lin_oauth_…`) get `Bearer`.
- **Stateless.** T3 runs one stdio copy per agent session plus one in its pool. The plugin keeps no state, so every copy behaves the same.

## Open questions

1. **Kanbanger schema parity.** Issues are read with `project { id }` and `team { states }`, as in Linear's schema (v1 queried a non-Linear `projectId` field). Kanbanger is Linear-wire-compatible; if it lacks either field, the GraphQL error is shown.
2. **More than 100 issues.** `linear_issues` reads the first 100 issues of a project and does not paginate.
