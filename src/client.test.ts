import { describe, expect, it } from "bun:test";
import { authorizationHeader, createLinearCompatibleClient } from "./client.ts";

describe("Linear-compatible client", () => {
  it("uses the configured endpoint and API key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createLinearCompatibleClient({
      endpoint: "https://kanbanger.example/graphql",
      token: "secret",
      fetchImpl: (async (input: string, init?: RequestInit) => {
        calls.push({ url: input, init: init ?? {} });
        return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
      }) as typeof fetch,
    });
    await expect(client.request({ query: "query { viewer { id } }" })).resolves.toEqual({ data: { ok: true } });
    expect(calls[0]?.url).toBe("https://kanbanger.example/graphql");
    expect(calls[0]?.init.headers).toMatchObject({ authorization: "secret" });
    expect(calls[0]?.init.body).toContain("viewer");
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the Bearer scheme only for OAuth tokens", () => {
    expect(authorizationHeader("lin_api_abc")).toBe("lin_api_abc");
    expect(authorizationHeader("lin_oauth_abc")).toBe("Bearer lin_oauth_abc");
    expect(authorizationHeader("Bearer xyz")).toBe("Bearer xyz");
  });

  it("surfaces HTTP failures instead of treating them as empty issue lists", async () => {
    const client = createLinearCompatibleClient({
      endpoint: "https://kanbanger.example/graphql",
      token: "secret",
      fetchImpl: (async () => new Response("no", { status: 503 })) as unknown as typeof fetch,
    });
    await expect(client.request({ query: "query { viewer { id } }" })).rejects.toThrow("503");
  });

  it("explains a rejected token and GraphQL errors without leaking the endpoint", async () => {
    const respond = (response: Response) =>
      createLinearCompatibleClient({ endpoint: "https://secret.example/graphql", token: "t", fetchImpl: (async () => response) as unknown as typeof fetch });
    await expect(respond(new Response("", { status: 401 })).request({ query: "q" })).rejects.toThrow("check LINEAR_API_TOKEN");
    await expect(respond(Response.json({ errors: [{ message: "Authentication required" }] })).request({ query: "q" })).rejects.toThrow("returned errors: Authentication required");
    const offline = createLinearCompatibleClient({ endpoint: "https://secret.example/graphql", token: "t", fetchImpl: (async () => { throw new TypeError("fetch failed https://secret.example"); }) as unknown as typeof fetch });
    const error = await offline.request({ query: "q" }).catch((cause: Error) => cause);
    expect((error as Error).message).toBe("Could not reach the Linear-compatible endpoint");
  });
});
