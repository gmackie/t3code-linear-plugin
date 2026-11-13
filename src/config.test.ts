import { describe, expect, it } from "bun:test";
import { loadConfig } from "./config.ts";

describe("config", () => {
  it("defaults to Linear's GraphQL endpoint and a 60s refresh", () => {
    expect(loadConfig({})).toEqual({ apiUrl: "https://api.linear.app/graphql", pollSeconds: 60 });
  });

  it("adds /graphql to a bare origin, as the v1 default was", () => {
    expect(loadConfig({ LINEAR_API_URL: "https://api.linear.app" }).apiUrl).toBe("https://api.linear.app/graphql");
    expect(loadConfig({ LINEAR_API_URL: "https://tasks.gmac.io/graphql/" }).apiUrl).toBe("https://tasks.gmac.io/graphql");
  });

  it("drops invalid endpoints and clamps the refresh interval", () => {
    expect(loadConfig({ LINEAR_API_URL: "ftp://x" }).apiUrl).toBeUndefined();
    expect(loadConfig({ LINEAR_POLL_SECONDS: "1" }).pollSeconds).toBe(15);
    expect(loadConfig({ LINEAR_POLL_SECONDS: "99999" }).pollSeconds).toBe(3600);
    expect(loadConfig({ LINEAR_POLL_SECONDS: "abc", LINEAR_API_TOKEN: " k " })).toMatchObject({ pollSeconds: 60, apiToken: "k" });
  });
});
