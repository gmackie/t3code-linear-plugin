import type { LinearIssue, LinearProject, WorkItem } from "./types.ts";

export type IssueReviewWorkflowModel = { readonly pluginId: string; readonly workflowId: string; readonly title: string; readonly currentStage: "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond"; readonly refreshedAt: string; readonly steps: readonly { id: string; stage: IssueReviewWorkflowModel["currentStage"]; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[]; readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: "neutral" | "positive" | "warning" | "negative"; detail?: string; url?: string }[]; readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[] };

export type LinearGraphqlTransport = (input: { query: string; variables?: Record<string, unknown> }) => Promise<unknown>;

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
  return {
    providerId: "linear",
    id: issue.id,
    title: issue.title,
    ...(issue.description ? { description: issue.description } : {}),
    ...(issue.url ? { url: issue.url } : {}),
    status: { id: state?.id ?? state?.name ?? "unknown", label: state?.name ?? "Unknown", category: category(state?.type) },
    scope: { ...(projectId ?? issue.projectId ? { projectId: projectId ?? issue.projectId! } : {}) },
    ...(issue.updatedAt ? { updatedAt: issue.updatedAt } : {}),
    labels: issue.labels?.nodes?.flatMap((label) => label.name ? [label.name] : []),
  };
}

export function buildIssueReviewWorkflow(item: WorkItem, state: { readonly approved?: boolean } = {}): IssueReviewWorkflowModel {
  const steps = [
    { id: "inspect", stage: "inspect" as const, title: "Inspect issue", state: "completed" as const, detail: item.title },
    { id: "context", stage: "context" as const, title: "Collect project and issue context", state: "completed" as const },
    { id: "propose", stage: "propose" as const, title: "Propose thread preparation", state: "completed" as const },
    { id: "review", stage: "review" as const, title: "Review issue context", state: state.approved ? "completed" as const : "active" as const },
    { id: "approve", stage: "approve" as const, title: "Approve thread preparation", state: state.approved ? "completed" as const : "pending" as const },
    { id: "execute", stage: "execute" as const, title: "Open T3 thread from issue", state: state.approved ? "active" as const : "pending" as const },
    { id: "verify", stage: "verify" as const, title: "Verify thread linkage", state: "pending" as const },
    { id: "respond", stage: "respond" as const, title: "Prepare issue response", state: "pending" as const },
  ];
  return { pluginId: "com.t3code.linear", workflowId: "linear.issue-review", title: "Issue review", currentStage: state.approved ? "execute" : "review", refreshedAt: new Date().toISOString(), steps, evidence: [{ id: "issue-link", title: "Issue reference", kind: "link", status: item.url ? "positive" : "neutral", detail: item.url ?? `${item.providerId}:${item.id}`, ...(item.url ? { url: item.url } : {}) }], actions: state.approved ? [] : [{ id: "approve", title: "Approve thread preparation", tone: "primary" }] };
}

export function parseProjects(payload: unknown): readonly LinearProject[] {
  const nodes = (payload as { data?: { projects?: { nodes?: unknown[] } } })?.data?.projects?.nodes ?? [];
  return nodes.flatMap((node) => {
    if (!node || typeof node !== "object") return [];
    const value = node as { id?: unknown; name?: unknown };
    return typeof value.id === "string" && typeof value.name === "string" ? [{ id: value.id, name: value.name }] : [];
  });
}

export function parseIssues(payload: unknown, projectId: string): readonly WorkItem[] {
  const nodes = (payload as { data?: { project?: { issues?: { nodes?: LinearIssue[] } | null } | null } })?.data?.project?.issues?.nodes ?? [];
  return nodes.filter((issue) => typeof issue?.id === "string" && typeof issue.title === "string").map((issue) => normalizeLinearIssue(issue, projectId));
}

export class LinearIssueSource {
  constructor(private readonly transport: LinearGraphqlTransport) {}

  async listProjects(): Promise<readonly LinearProject[]> {
    return parseProjects(await this.transport({ query: "query { projects(first: 100) { nodes { id name } } }" }));
  }

  async listIssues(projectId: string): Promise<readonly WorkItem[]> {
    return parseIssues(await this.transport({ query: "query($projectId: String!) { project(id: $projectId) { issues(first: 100) { nodes { id identifier title url description updatedAt projectId state { id name type } labels { nodes { name } } } } } }", variables: { projectId } }), projectId);
  }

  createIssue(input: { projectId: string; title: string; description?: string }): Promise<unknown> {
    return this.transport({ query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url description updatedAt state { id name type } } } }", variables: { input } });
  }

  updateIssue(issueId: string, input: Record<string, unknown>): Promise<unknown> {
    return this.transport({ query: "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title url description updatedAt state { id name type } } } }", variables: { id: issueId, input } });
  }
}
