import { describe, expect, it } from "bun:test";
import { createLinearCompatibleClient } from "./client.ts";

describe("Linear-compatible client", () => {
  it("uses the configured endpoint and bearer token", async () => {
    const calls: RequestInit[] = [];
    const client = createLinearCompatibleClient({
      endpoint: "https://kanbanger.example/graphql",
      token: "secret",
      fetchImpl: async (_input, init) => {
        calls.push(init ?? {});
        return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
      },
    });
    await expect(client.request({ query: "query { viewer { id } }" })).resolves.toEqual({ data: { ok: true } });
    expect(calls[0]?.headers).toMatchObject({ authorization: "Bearer secret" });
    expect(calls[0]?.body).toContain("viewer");
  });

  it("surfaces HTTP failures instead of treating them as empty issue lists", async () => {
    const client = createLinearCompatibleClient({
      endpoint: "https://kanbanger.example/graphql",
      token: "secret",
      fetchImpl: async () => new Response("no", { status: 503 }),
    });
    await expect(client.request({ query: "query { viewer { id } }" })).rejects.toThrow("503");
  });
});
