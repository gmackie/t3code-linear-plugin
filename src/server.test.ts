import { afterEach, describe, expect, it } from "bun:test";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { connectedClient, fakeLinear } from "./testing.ts";

type Structured<T> = { structuredContent?: T; isError?: boolean; content: { type: string; text?: string }[] };
type McpClient = Awaited<ReturnType<typeof connectedClient>>;
const call = async <T = Record<string, unknown>>(client: McpClient, name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as unknown as Structured<T>;

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));
function linear(options?: Parameters<typeof fakeLinear>[0]) {
  const fake = fakeLinear(options);
  stops.push(fake.stop);
  return fake;
}
const configured = (url: string) => ({ LINEAR_API_URL: url, LINEAR_API_TOKEN: "lin_api_test", LINEAR_POLL_SECONDS: "30" });

describe("Linear MCP server", () => {
  it("links view tools to ui:// views and keeps mutations agent-only", async () => {
    const client = await connectedClient({});
    const byName = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool]));
    expect([...byName.keys()].sort()).toEqual(["linear_issue_create", "linear_issue_review", "linear_issue_update", "linear_issues"]);
    expect(byName.get("linear_issues")?._meta).toMatchObject({ ui: { resourceUri: "ui://linear/issues.html", visibility: ["model", "app"] } });
    expect(byName.get("linear_issue_review")?._meta).toMatchObject({ ui: { resourceUri: "ui://linear/issue-review.html", visibility: ["model", "app"] } });
    expect(byName.get("linear_issues")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("linear_issue_create")?._meta).toBeUndefined();
    expect(byName.get("linear_issue_update")?._meta).toBeUndefined();
  });

  it("serves each view as a self-contained MCP App resource", async () => {
    const client = await connectedClient({});
    const { resources } = await client.listResources();
    expect(resources.map((resource) => [resource.uri, resource.mimeType])).toEqual([
      ["ui://linear/issues.html", RESOURCE_MIME_TYPE],
      ["ui://linear/issue-review.html", RESOURCE_MIME_TYPE],
    ]);
    for (const resource of resources) {
      const html = ((await client.readResource({ uri: resource.uri })).contents[0] as { text: string }).text;
      expect(html).toStartWith("<!doctype html>");
      expect(html).toContain("ui/initialize");
      // T3's sandbox CSP is default-src 'none': nothing may load from outside.
      expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
      expect(html.length).toBeLessThan(100_000);
    }
  });

  it("reports missing configuration instead of returning data", async () => {
    const client = await connectedClient({ LINEAR_API_TOKEN: "" });
    for (const [name, args] of [["linear_issues", {}], ["linear_issue_review", { issueId: "ENG-1" }], ["linear_issue_create", { projectId: "p1", title: "x" }], ["linear_issue_update", { issueId: "ENG-1", title: "x" }]] as const) {
      const result = await call(client, name, args);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(result.content[0]?.text).toContain("LINEAR_API_TOKEN");
    }
    const invalid = await call(await connectedClient({ LINEAR_API_URL: "not a url", LINEAR_API_TOKEN: "k" }), "linear_issues");
    expect(invalid.content[0]?.text).toContain("LINEAR_API_URL");
  });

  it("lists projects, then a project's issues newest first", async () => {
    const fake = linear();
    const client = await connectedClient(configured(fake.url));
    const projects = await call<{ projects: unknown[]; issues: unknown[]; projectId?: string; pollSeconds: number }>(client, "linear_issues");
    expect(projects.isError).toBeFalsy();
    expect(projects.structuredContent).toMatchObject({ projects: [{ id: "p1", name: "Platform" }, { id: "p2", name: "Mobile" }], issues: [], pollSeconds: 30 });
    expect(projects.structuredContent?.projectId).toBeUndefined();
    expect(projects.content[0]?.text).toContain("Pass projectId");

    const issues = await call<{ issues: { identifier: string; status: { category: string } }[] }>(client, "linear_issues", { projectId: "p1" });
    expect(issues.structuredContent?.issues.map((item) => item.identifier)).toEqual(["ENG-2", "ENG-1"]);
    expect(issues.structuredContent?.issues[1]?.status.category).toBe("active");
    expect(issues.content[0]?.text).toContain("- ENG-1 [In Progress] Port the plugin (id i1)");

    const filtered = await call<{ issues: unknown[] }>(client, "linear_issues", { projectId: "p1", query: "eng-1" });
    expect(filtered.structuredContent?.issues).toHaveLength(1);
    // Linear personal API keys go in the header without a scheme.
    expect(fake.requests[0]?.authorization).toBe("lin_api_test");
  });

  it("reports an unknown project as an error, not an empty list", async () => {
    const client = await connectedClient(configured(linear().url));
    const result = await call(client, "linear_issues", { projectId: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Linear project not found: nope");
  });

  it("reviews an issue with its workflow and team states", async () => {
    const client = await connectedClient(configured(linear().url));
    const review = await call<{ issue: { identifier: string }; states: unknown[]; workflow: { currentStage: string; actions: { id: string }[] } }>(client, "linear_issue_review", { issueId: "ENG-1" });
    expect(review.structuredContent).toMatchObject({ issue: { identifier: "ENG-1" }, workflow: { currentStage: "review", actions: [{ id: "approve" }] } });
    expect(review.structuredContent?.states).toHaveLength(2);
    expect(review.content[0]?.text).toContain("States: Todo = s-unstarted, Done = s-completed");
    expect((await call(client, "linear_issue_review", { issueId: "ENG-404" })).content[0]?.text).toBe("Linear issue not found: ENG-404");
  });

  it("creates an issue in the project's team and updates its state", async () => {
    const fake = linear();
    const client = await connectedClient(configured(fake.url));
    const created = await call<{ issue: { identifier: string } }>(client, "linear_issue_create", { projectId: "p1", title: "New bug" });
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent?.issue.identifier).toBe("ENG-3");
    expect(fake.requests.at(-1)?.body.variables).toEqual({ input: { teamId: "t1", projectId: "p1", title: "New bug" } });

    const updated = await call<{ issue: { status: { category: string } } }>(client, "linear_issue_update", { issueId: "ENG-1", stateId: "s-completed" });
    expect(updated.structuredContent?.issue.status.category).toBe("done");
    expect((await call(client, "linear_issue_update", { issueId: "ENG-1" })).content[0]?.text).toContain("Nothing to update");
  });

  it("asks for a team when the project has several", async () => {
    const client = await connectedClient(configured(linear({ teams: [{ id: "t1", name: "Eng" }, { id: "t2", name: "Ops" }] }).url));
    const result = await call(client, "linear_issue_create", { projectId: "p1", title: "x" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Eng = t1, Ops = t2");
  });

  it("surfaces GraphQL errors from the endpoint", async () => {
    const client = await connectedClient(configured(linear().url));
    const result = await call(client, "linear_issue_update", { issueId: "ENG-404", title: "x" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Entity not found: Issue");
  });

  it("keeps upstream 5xx errors short and free of URLs or bodies", async () => {
    const fake = linear({ status: 502 });
    const result = await call(await connectedClient(configured(fake.url)), "linear_issues");
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Linear-compatible endpoint is temporarily unavailable (502)");
  });

  it("times out a slow endpoint", async () => {
    const fake = linear({ delayMs: 300 });
    const result = await call(await connectedClient(configured(fake.url), 50), "linear_issues");
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("timed out");
  });
});
