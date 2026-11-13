import { describe, expect, it } from "bun:test";
import { LinearIssueSource, buildIssueReviewWorkflow, issuePrompt, normalizeLinearIssue, parseProjects } from "./issues.ts";

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

  it("builds an issue review workflow for T3 thread preparation", () => {
    const workflow = buildIssueReviewWorkflow({ providerId: "linear", id: "i1", title: "Fix", status: { id: "s1", label: "Started", category: "active" }, scope: { projectId: "p1" } });
    expect(workflow.currentStage).toBe("review");
    expect(workflow.evidence?.[0]?.kind).toBe("link");
    expect(workflow.actions?.[0]?.id).toBe("approve");
  });

  it("reads the project from Linear's project field", () => {
    expect(normalizeLinearIssue({ id: "i1", identifier: "ENG-1", title: "Fix", project: { id: "p9" } })).toMatchObject({ identifier: "ENG-1", scope: { projectId: "p9" } });
  });

  it("moves the review to verify once the issue was sent to the thread", () => {
    const item = { providerId: "linear" as const, id: "i1", title: "Fix", status: { id: "s1", label: "Started", category: "active" as const }, scope: {} };
    const workflow = buildIssueReviewWorkflow(item, { sent: true });
    expect(workflow.currentStage).toBe("verify");
    expect(workflow.actions).toEqual([]);
    expect(workflow.steps.find((step) => step.id === "execute")?.state).toBe("completed");
  });

  it("builds the thread prompt from the issue", () => {
    const prompt = issuePrompt({ providerId: "linear", id: "i1", identifier: "ENG-1", title: "Fix", description: "x".repeat(5000), url: "https://linear.app/i/ENG-1", labels: ["bug"], status: { id: "s1", label: "Todo", category: "backlog" }, scope: {} });
    expect(prompt).toStartWith("Work on Linear issue ENG-1: Fix\nStatus: Todo · Labels: bug\nhttps://linear.app/i/ENG-1");
    expect(prompt).toContain("x".repeat(4000) + "…");
    expect(prompt).not.toContain("x".repeat(4001));
  });

  it("rejects mutations Linear did not confirm", async () => {
    const source = new LinearIssueSource(async () => ({ data: { issueUpdate: { success: false, issue: null } } }));
    await expect(source.updateIssue("i1", { title: "x" })).rejects.toThrow("did not confirm");
  });
});

