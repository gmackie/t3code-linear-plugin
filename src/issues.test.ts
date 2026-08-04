import { describe, expect, it } from "bun:test";
import { LinearIssueSource, normalizeLinearIssue, parseProjects } from "./issues.ts";

describe("standalone Linear plugin", () => {
  it("normalizes compatible Linear clone issue payloads", () => {
    expect(normalizeLinearIssue({ id: "i1", title: "Fix", state: { id: "s1", name: "Started", type: "started" } }, "p1")).toMatchObject({
      providerId: "linear", id: "i1", scope: { projectId: "p1" }, status: { category: "active" },
    });
  });

  it("tolerates missing optional project fields", () => {
    expect(parseProjects({ data: { projects: { nodes: [{ id: "p1", name: "Project" }, { name: "ignored" }] } } })).toEqual([{ id: "p1", name: "Project" }]);
  });

  it("keeps GraphQL transport injectable for compatible endpoints", async () => {
    const source = new LinearIssueSource(async ({ query }) => query.startsWith("query") ? { data: { projects: { nodes: [{ id: "p1", name: "Project" }] } } } : {});
    await expect(source.listProjects()).resolves.toEqual([{ id: "p1", name: "Project" }]);
  });
});
