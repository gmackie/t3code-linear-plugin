// Test fixtures: a local Linear-compatible GraphQL endpoint (Bun.serve) and an
// MCP client connected to the plugin server in memory.
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { loadConfig } from "./config.ts";
import { createLinearMcpServer } from "./server.ts";

type Gql = { query: string; variables?: Record<string, any> };

const issue = (id: string, identifier: string, title: string, state: { name: string; type: string }, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  identifier,
  title,
  url: `https://linear.app/acme/issue/${identifier}`,
  description: null,
  updatedAt,
  project: { id: "p1" },
  state: { id: `s-${state.type}`, ...state },
  labels: { nodes: [{ name: "bug" }] },
  ...extra,
});

export function fakeLinear(options: { status?: number; delayMs?: number; teams?: { id: string; name: string }[] } = {}) {
  const requests: { authorization: string | null; body: Gql }[] = [];
  const issues = [
    issue("i1", "ENG-1", "Port the plugin", { name: "In Progress", type: "started" }, "2026-11-01T10:00:00.000Z", { description: "Move to <MCP>." }),
    issue("i2", "ENG-2", "Write docs", { name: "Todo", type: "unstarted" }, "2026-11-02T10:00:00.000Z"),
  ];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Gql;
      requests.push({ authorization: request.headers.get("authorization"), body });
      if (options.delayMs) await Bun.sleep(options.delayMs);
      if (options.status) return new Response("upstream exploded at https://internal.example/secret", { status: options.status });
      const { query, variables = {} } = body;
      const data = (value: unknown) => Response.json({ data: value });
      if (query.includes("projects(")) return data({ projects: { nodes: [{ id: "p1", name: "Platform" }, { id: "p2", name: "Mobile" }] } });
      if (query.includes("teams(")) return data({ project: variables.id === "p1" ? { teams: { nodes: options.teams ?? [{ id: "t1", name: "Eng" }] } } : null });
      if (query.includes("project(")) return data({ project: variables.projectId === "p1" ? { issues: { nodes: issues } } : variables.projectId === "p2" ? { issues: { nodes: [] } } : null });
      if (query.includes("issue(")) {
        const found = issues.find((candidate) => candidate.id === variables.id || candidate.identifier === variables.id);
        return data({ issue: found ? { ...found, team: { states: { nodes: [{ id: "s-unstarted", name: "Todo", type: "unstarted" }, { id: "s-completed", name: "Done", type: "completed" }] } } } : null });
      }
      if (query.includes("issueCreate")) {
        if (!variables.input.teamId) return Response.json({ errors: [{ message: "teamId must be provided" }] }, { status: 400 });
        return data({ issueCreate: { success: true, issue: issue("i3", "ENG-3", variables.input.title, { name: "Todo", type: "unstarted" }, "2026-11-03T10:00:00.000Z") } });
      }
      if (query.includes("issueUpdate")) {
        const found = issues.find((candidate) => candidate.id === variables.id || candidate.identifier === variables.id);
        if (!found) return Response.json({ errors: [{ message: "Entity not found: Issue" }] });
        const state = variables.input.stateId === "s-completed" ? { id: "s-completed", name: "Done", type: "completed" } : found.state;
        return data({ issueUpdate: { success: true, issue: { ...found, ...variables.input, state } } });
      }
      return Response.json({ errors: [{ message: "unknown query" }] });
    },
  });
  return { url: `http://localhost:${server.port}/graphql`, requests, stop: () => server.stop(true) };
}

export async function connectedClient(env: Record<string, string | undefined>, timeoutMs?: number) {
  const server = createLinearMcpServer({ config: loadConfig(env), ...(timeoutMs ? { timeoutMs } : {}) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-host", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}
