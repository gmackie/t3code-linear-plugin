import { buildIssueReviewWorkflow, type LinearIssueSource } from "./issues.ts";

type Request = { method: string; payload: Record<string, unknown> };
type Response = { ok: true; result: unknown } | { ok: false; error: string };

type LinearSource = Pick<LinearIssueSource, "listProjects" | "listIssues" | "createIssue" | "updateIssue">;

export function createLinearRpcHandler(source: LinearSource) {
  return async (request: Request): Promise<Response> => {
    try {
      switch (request.method) {
        case "projects.list":
          return { ok: true, result: await source.listProjects() };
        case "workItems.list":
          return { ok: true, result: await source.listIssues(requiredString(request.payload.projectId, "projectId")) };
        case "workItems.create":
          return {
            ok: true,
            result: await source.createIssue({
              projectId: requiredString(request.payload.projectId, "projectId"),
              title: requiredString(request.payload.title, "title"),
              ...(typeof request.payload.description === "string" ? { description: request.payload.description } : {}),
            }),
          };
        case "workItems.update":
          return {
            ok: true,
            result: await source.updateIssue(requiredString(request.payload.itemId, "itemId"), request.payload.input as Record<string, unknown>),
          };
        case "workflow.get": {
          const projectId = requiredString(request.payload.projectId, "projectId");
          const itemId = requiredString(request.payload.itemId, "itemId");
          const item = (await source.listIssues(projectId)).find((candidate) => candidate.id === itemId);
          if (!item) return { ok: false, error: `Linear issue not found: ${itemId}` };
          return { ok: true, result: buildIssueReviewWorkflow(item) };
        }
        default:
          return { ok: false, error: `unsupported Linear RPC method: ${request.method}` };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Linear plugin request failed" };
    }
  };
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}
