import type { LinearIssue, LinearProject, WorkItem } from "./types.ts";

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
