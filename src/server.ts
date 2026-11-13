import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { createLinearCompatibleClient } from "./client.ts";
import type { LinearConfig } from "./config.ts";
import { buildIssueReviewWorkflow, issueKey, LinearIssueSource } from "./issues.ts";
import type { WorkItem } from "./types.ts";
import { VIEWS, viewHtml, type ViewName } from "./views/html.ts";
import type { IssuesData, ReviewData } from "./views/render.ts";

export const SERVER_INFO = { name: "linear", version: "0.2.0" } as const;

export type LinearServerOptions = {
  config: LinearConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const issueId = z.string().min(1).describe("Linear issue id or identifier, e.g. ENG-123");

export function createLinearMcpServer(options: LinearServerOptions): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Linear (or a Linear-compatible endpoint such as Kanbanger) issues. Use linear_issues to list projects and a project's issues, linear_issue_review to read one issue, and linear_issue_create / linear_issue_update to change issues.",
  });

  // Built per call so a missing setting is reported by the tool, not at startup.
  const source = () => {
    const { apiUrl, apiToken } = options.config;
    if (!apiUrl) throw new Error("LINEAR_API_URL is not a valid http(s) URL. Fix it in the Linear plugin settings.");
    if (!apiToken) throw new Error("Linear is not configured: set LINEAR_API_TOKEN (a Linear or Kanbanger API key) in the Linear plugin settings.");
    const client = createLinearCompatibleClient({
      endpoint: apiUrl,
      token: apiToken,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    });
    return new LinearIssueSource(client.request);
  };

  for (const [name, view] of Object.entries(VIEWS) as [ViewName, (typeof VIEWS)[ViewName]][]) {
    registerAppResource(server, view.title, view.uri, { mimeType: RESOURCE_MIME_TYPE, _meta: { ui: { prefersBorder: true } } }, async () => ({
      contents: [{ uri: view.uri, mimeType: RESOURCE_MIME_TYPE, text: await viewHtml(name), _meta: { ui: { prefersBorder: true } } }],
    }));
  }

  registerAppTool(
    server,
    "linear_issues",
    {
      title: "Linear issues",
      description:
        "List Linear projects and, for a project, its issues (most recently updated first, up to 100), optionally filtered by title or identifier. With a single project it is selected automatically. Renders the Linear issues view.",
      inputSchema: z.object({
        projectId: z.string().optional().describe("Linear project id; omit to list projects"),
        query: z.string().optional().describe("Case-insensitive filter on title or identifier"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: VIEWS.issues.uri, visibility: ["model", "app"] } },
    },
    async ({ projectId, query }) =>
      result(async () => {
        const linear = source();
        const projects = await linear.listProjects();
        const selected = projectId ?? (projects.length === 1 ? projects[0]!.id : undefined);
        const filter = query?.trim().toLowerCase();
        const issues = selected
          ? (await linear.listIssues(selected)).filter((item) => !filter || item.title.toLowerCase().includes(filter) || issueKey(item).toLowerCase().includes(filter))
          : [];
        const data: IssuesData = { projects, ...(selected ? { projectId: selected } : {}), issues, pollSeconds: options.config.pollSeconds, refreshedAt: new Date().toISOString() };
        const project = projects.find((candidate) => candidate.id === selected);
        const text = selected
          ? `${issues.length} issues in ${project?.name ?? selected}.\n${issues.map(issueLine).join("\n")}`
          : `${projects.length} Linear projects. Pass projectId to list issues.\n${projects.map((candidate) => `- ${candidate.id} ${candidate.name}`).join("\n")}`;
        return { data, text };
      }),
  );

  registerAppTool(
    server,
    "linear_issue_review",
    {
      title: "Linear issue review",
      description:
        "Show one Linear issue with its description, status, labels and the team's workflow states (for linear_issue_update). The rendered view lets a human send the issue into the current thread to start work.",
      inputSchema: z.object({ issueId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: VIEWS.review.uri, visibility: ["model", "app"] } },
    },
    async ({ issueId: id }) =>
      result(async () => {
        const { item, states } = await source().getIssue(id);
        const data: ReviewData = { issue: item, states, workflow: buildIssueReviewWorkflow(item) };
        const stateList = states.length ? `\nStates: ${states.map((state) => `${state.name} = ${state.id}`).join(", ")}` : "";
        return { data, text: `${issueLine(item)}${item.url ? `\n${item.url}` : ""}${item.description ? `\n\n${item.description}` : ""}${stateList}` };
      }),
  );

  server.registerTool(
    "linear_issue_create",
    {
      title: "Create Linear issue",
      description: "Create an issue in a Linear project. teamId defaults to the project's team when it has exactly one.",
      inputSchema: z.object({
        projectId: z.string().min(1).describe("Linear project id"),
        title: z.string().trim().min(1),
        description: z.string().optional().describe("Markdown description"),
        teamId: z.string().optional().describe("Required when the project belongs to several teams"),
      }),
      annotations: { openWorldHint: true },
    },
    async ({ projectId, title, description, teamId }) =>
      result(async () => {
        const item = await source().createIssue({ projectId, title, ...(description ? { description } : {}), ...(teamId ? { teamId } : {}) });
        return { data: { issue: item }, text: `Created ${issueLine(item)}${item.url ? `\n${item.url}` : ""}` };
      }),
  );

  server.registerTool(
    "linear_issue_update",
    {
      title: "Update Linear issue",
      description: "Change a Linear issue's title, description or workflow state. linear_issue_review lists the valid state ids.",
      inputSchema: z.object({
        issueId,
        title: z.string().trim().min(1).optional(),
        description: z.string().optional().describe("Markdown description; replaces the current one"),
        stateId: z.string().min(1).optional().describe("Workflow state id from linear_issue_review"),
      }),
      annotations: { openWorldHint: true, idempotentHint: true },
    },
    async ({ issueId: id, title, description, stateId }) =>
      result(async () => {
        const input = { ...(title ? { title } : {}), ...(description !== undefined ? { description } : {}), ...(stateId ? { stateId } : {}) };
        if (Object.keys(input).length === 0) throw new Error("Nothing to update: pass title, description or stateId");
        const item = await source().updateIssue(id, input);
        return { data: { issue: item }, text: `Updated ${issueLine(item)}` };
      }),
  );

  return server;
}

const issueLine = (item: WorkItem) => `- ${issueKey(item)} [${item.status.label}] ${item.title}${issueKey(item) === item.id ? "" : ` (id ${item.id})`}`;

async function result(run: () => Promise<{ data: unknown; text: string }>): Promise<CallToolResult> {
  try {
    const { data, text } = await run();
    return { content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
