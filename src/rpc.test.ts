import { describe, expect, it } from "bun:test";

import { createLinearRpcHandler } from "./rpc.ts";

describe("Linear plugin RPC boundary", () => {
  it("exposes issue listing through the generic work-item boundary", async () => {
    const handler = createLinearRpcHandler({
      listProjects: async () => [],
      listIssues: async () => [{ providerId: "linear", id: "i1", title: "Fix", status: { id: "s1", label: "Started", category: "active" }, scope: {} }],
      createIssue: async () => ({}),
      updateIssue: async () => ({}),
    });

    await expect(handler({ method: "workItems.list", payload: { projectId: "p1" } })).resolves.toEqual({
      ok: true,
      result: [{ providerId: "linear", id: "i1", title: "Fix", status: { id: "s1", label: "Started", category: "active" }, scope: {} }],
    });
  });

  it("exposes issue review workflow through the plugin boundary", async () => {
    const handler = createLinearRpcHandler({
      listProjects: async () => [],
      listIssues: async () => [{ providerId: "linear", id: "i1", title: "Fix", status: { id: "s1", label: "Started", category: "active" }, scope: { projectId: "p1" } }],
      createIssue: async () => ({}),
      updateIssue: async () => ({}),
    });
    await expect(handler({ method: "workflow.get", payload: { projectId: "p1", itemId: "i1" } })).resolves.toMatchObject({ ok: true, result: { workflowId: "linear.issue-review" } });
  });
});
