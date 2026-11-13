import { describe, expect, it } from "bun:test";
import { buildIssueReviewWorkflow } from "../issues.ts";
import type { WorkItem } from "../types.ts";
import { renderIssues, renderReview } from "./render.ts";

const item: WorkItem = { providerId: "linear", id: "i1", identifier: "ENG-1", title: "Fix <script>alert(1)</script>", url: "https://linear.app/i/ENG-1", status: { id: "s1", label: "Todo", category: "backlog" }, scope: {} };
const base = { projects: [{ id: "p1", name: "Platform" }], pollSeconds: 60, refreshedAt: "2026-11-13T00:00:00Z" };

describe("view renderers", () => {
  it("escapes issue content and filters by title or identifier", () => {
    const html = renderIssues({ ...base, projectId: "p1", issues: [item, { ...item, id: "i2", identifier: "OPS-2", title: "Other" }] }, "eng-1");
    expect(html).toContain("Fix &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('data-issue-id="i1"');
    expect(html).not.toContain('data-issue-id="i2"');
    expect(html).toContain('<option value="p1" selected>Platform</option>');
  });

  it("asks for a project before listing issues, and says when none are visible", () => {
    expect(renderIssues({ ...base, issues: [] })).toContain("Choose a project to list its issues.");
    expect(renderIssues({ ...base, projects: [], issues: [] })).toContain("No Linear projects are visible to this API token.");
  });

  it("offers start work, then nothing once sent", () => {
    const review = renderReview({ issue: item, states: [], workflow: buildIssueReviewWorkflow(item) });
    expect(review).toContain('data-action="approve"');
    expect(review).toContain('data-action="open" data-url="https://linear.app/i/ENG-1"');
    const sent = renderReview({ issue: item, states: [], workflow: buildIssueReviewWorkflow(item, { sent: true }) }, { notice: "Sent to this thread.", error: "x <y>" });
    expect(sent).not.toContain('class="actions"');
    expect(sent).toContain('role="status">Sent to this thread.');
    expect(sent).toContain('role="alert">x &lt;y&gt;');
  });
});
