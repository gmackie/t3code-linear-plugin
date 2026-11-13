import type { LinearIssue, LinearProject, WorkItem } from "./types.ts";

type Stage = "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond";

export type IssueReviewWorkflowModel = {
  readonly pluginId: string;
  readonly workflowId: string;
  readonly title: string;
  readonly currentStage: Stage;
  readonly refreshedAt: string;
  readonly steps: readonly { id: string; stage: Stage; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[];
  readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: "neutral" | "positive" | "warning" | "negative"; detail?: string; url?: string }[];
  readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[];
};

export type LinearIssueState = { id: string; name: string; type?: string };

export type LinearGraphqlTransport = (input: { query: string; variables?: Record<string, unknown> }) => Promise<unknown>;

const ISSUE_FIELDS = "id identifier title url description updatedAt project { id } state { id name type } labels { nodes { name } }";

const category = (type: string | undefined): WorkItem["status"]["category"] => {
  switch (type?.toLowerCase()) {
    case "completed": return "done";
    case "canceled": case "cancelled": return "cancelled";
    case "started": case "in_progress": return "active";
    case "backlog": case "unstarted": return "backlog";
    default: return "backlog";
  }
};

export function normalizeLinearIssue(issue: LinearIssue, projectId?: string): WorkItem {
  const state = issue.state;
  const scopeProject = projectId ?? issue.projectId ?? issue.project?.id ?? undefined;
  return {
    providerId: "linear",
    id: issue.id,
    ...(issue.identifier ? { identifier: issue.identifier } : {}),
    title: issue.title,
    ...(issue.description ? { description: issue.description } : {}),
    ...(issue.url ? { url: issue.url } : {}),
    status: { id: state?.id ?? state?.name ?? "unknown", label: state?.name ?? "Unknown", category: category(state?.type) },
    scope: { ...(scopeProject ? { projectId: scopeProject } : {}) },
    ...(issue.updatedAt ? { updatedAt: issue.updatedAt } : {}),
    labels: issue.labels?.nodes?.flatMap((label) => label.name ? [label.name] : []),
  };
}

export const issueKey = (item: WorkItem) => item.identifier ?? item.id;

/**
 * The issue review ends with a human sending the issue into the current thread
 * as a user message (MCP Apps `ui/message`). Nothing is persisted: `sent` is the
 * view's own record that it sent the message.
 */
export function buildIssueReviewWorkflow(item: WorkItem, state: { readonly sent?: boolean } = {}): IssueReviewWorkflowModel {
  const sent = state.sent === true;
  const done = (value: boolean) => (value ? "completed" as const : "pending" as const);
  const context = [item.status.label, ...(item.labels ?? [])].join(" · ");
  const steps = [
    { id: "inspect", stage: "inspect" as const, title: "Inspect issue", state: "completed" as const, detail: `${issueKey(item)}: ${item.title}` },
    { id: "context", stage: "context" as const, title: "Collect issue context", state: "completed" as const, detail: context },
    { id: "propose", stage: "propose" as const, title: "Draft the thread prompt", state: "completed" as const },
    { id: "review", stage: "review" as const, title: "Review issue context", state: sent ? "completed" as const : "active" as const },
    { id: "approve", stage: "approve" as const, title: "Approve starting work in this thread", state: done(sent) },
    { id: "execute", stage: "execute" as const, title: "Send the issue to the thread", state: done(sent) },
    { id: "verify", stage: "verify" as const, title: "Agent works the issue in this thread", state: sent ? "active" as const : "pending" as const },
    { id: "respond", stage: "respond" as const, title: "Update the Linear issue when done", state: "pending" as const, detail: "The agent can use linear_issue_update." },
  ];
  return {
    pluginId: "com.t3code.linear",
    workflowId: "linear.issue-review",
    title: "Issue review",
    currentStage: sent ? "verify" : "review",
    refreshedAt: new Date().toISOString(),
    steps,
    evidence: [{ id: "issue-link", title: "Issue reference", kind: "link", status: item.url ? "positive" : "neutral", detail: item.url ?? `${item.providerId}:${issueKey(item)}`, ...(item.url ? { url: item.url } : {}) }],
    actions: sent ? [] : [{ id: "approve", title: "Start work in this thread", tone: "primary" }],
  };
}

const PROMPT_DESCRIPTION_LIMIT = 4000;

/** The user message the issue review sends into the thread. */
export function issuePrompt(item: WorkItem): string {
  const description = item.description?.trim();
  const body = description && description.length > PROMPT_DESCRIPTION_LIMIT ? `${description.slice(0, PROMPT_DESCRIPTION_LIMIT)}…` : description;
  return [
    `Work on Linear issue ${issueKey(item)}: ${item.title}`,
    `Status: ${item.status.label}${item.labels?.length ? ` · Labels: ${item.labels.join(", ")}` : ""}`,
    ...(item.url ? [item.url] : []),
    ...(body ? ["", body] : []),
    "",
    `Use the linear_issue_review tool for the latest details and linear_issue_update to update the issue when the work is done.`,
  ].join("\n");
}

export function parseProjects(payload: unknown): readonly LinearProject[] {
  const nodes = (payload as { data?: { projects?: { nodes?: unknown[] } } })?.data?.projects?.nodes ?? [];
  return nodes.flatMap((node) => {
    if (!node || typeof node !== "object") return [];
    const value = node as { id?: unknown; name?: unknown };
    return typeof value.id === "string" && typeof value.name === "string" ? [{ id: value.id, name: value.name }] : [];
  });
}

const isIssue = (issue: unknown): issue is LinearIssue =>
  !!issue && typeof issue === "object" && typeof (issue as LinearIssue).id === "string" && typeof (issue as LinearIssue).title === "string";

export function parseIssues(payload: unknown, projectId: string): readonly WorkItem[] {
  const nodes = (payload as { data?: { project?: { issues?: { nodes?: unknown[] } | null } | null } })?.data?.project?.issues?.nodes ?? [];
  return nodes.filter(isIssue).map((issue) => normalizeLinearIssue(issue, projectId));
}

function parseStates(nodes: unknown): readonly LinearIssueState[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) =>
    node && typeof node === "object" && typeof node.id === "string" && typeof node.name === "string"
      ? [{ id: node.id, name: node.name, ...(typeof node.type === "string" ? { type: node.type } : {}) }]
      : [],
  );
}

function parseMutation(payload: unknown, field: "issueCreate" | "issueUpdate"): WorkItem {
  const result = (payload as { data?: Record<string, { success?: boolean; issue?: unknown } | null> })?.data?.[field];
  if (!result?.success || !isIssue(result.issue)) throw new Error(`Linear did not confirm the ${field === "issueCreate" ? "new issue" : "issue update"}`);
  return normalizeLinearIssue(result.issue);
}

const byRecentUpdate = (a: WorkItem, b: WorkItem) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

export class LinearIssueSource {
  constructor(private readonly transport: LinearGraphqlTransport) {}

  async listProjects(): Promise<readonly LinearProject[]> {
    return parseProjects(await this.transport({ query: "query { projects(first: 100) { nodes { id name } } }" }));
  }

  async listIssues(projectId: string): Promise<readonly WorkItem[]> {
    const payload = await this.transport({ query: `query($projectId: String!) { project(id: $projectId) { issues(first: 100) { nodes { ${ISSUE_FIELDS} } } } }`, variables: { projectId } });
    if (!(payload as { data?: { project?: unknown } })?.data?.project) throw new Error(`Linear project not found: ${projectId}`);
    return [...parseIssues(payload, projectId)].sort(byRecentUpdate);
  }

  /** Accepts an issue id or identifier (ENG-123), and returns the team's workflow states for updates. */
  async getIssue(issueId: string): Promise<{ item: WorkItem; states: readonly LinearIssueState[] }> {
    const payload = await this.transport({
      query: `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} team { states { nodes { id name type } } } } }`,
      variables: { id: issueId },
    });
    const issue = (payload as { data?: { issue?: unknown } })?.data?.issue;
    if (!isIssue(issue)) throw new Error(`Linear issue not found: ${issueId}`);
    const states = parseStates((issue as { team?: { states?: { nodes?: unknown } } }).team?.states?.nodes);
    return { item: normalizeLinearIssue(issue), states };
  }

  async createIssue(input: { projectId: string; title: string; description?: string; teamId?: string }): Promise<WorkItem> {
    // Linear's IssueCreateInput requires a team, so default to the project's only team.
    const teamId = input.teamId ?? (await this.projectTeam(input.projectId));
    const variables = { input: { teamId, projectId: input.projectId, title: input.title, ...(input.description ? { description: input.description } : {}) } };
    return parseMutation(await this.transport({ query: `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`, variables }), "issueCreate");
  }

  async updateIssue(issueId: string, input: { title?: string; description?: string; stateId?: string }): Promise<WorkItem> {
    return parseMutation(
      await this.transport({ query: `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } } }`, variables: { id: issueId, input } }),
      "issueUpdate",
    );
  }

  private async projectTeam(projectId: string): Promise<string> {
    const payload = await this.transport({ query: "query($id: String!) { project(id: $id) { teams(first: 10) { nodes { id name } } } }", variables: { id: projectId } });
    const project = (payload as { data?: { project?: { teams?: { nodes?: unknown } } | null } })?.data?.project;
    if (!project) throw new Error(`Linear project not found: ${projectId}`);
    const teams = parseStates(project.teams?.nodes);
    if (teams.length === 1) return teams[0]!.id;
    if (teams.length === 0) throw new Error(`Linear project ${projectId} has no team; pass teamId`);
    throw new Error(`Linear project ${projectId} belongs to several teams (${teams.map((team) => `${team.name} = ${team.id}`).join(", ")}); pass teamId`);
  }
}
