// The v1 plugin settings (linear.endpoint, linear.api-token, linear.polling-seconds)
// map onto these env vars. The v2 manifest declares them under mcpServer.transport.env
// so T3 collects them on install and keeps the token in its secret store.
export type LinearConfig = {
  /** Undefined when LINEAR_API_URL is not a valid http(s) URL. */
  readonly apiUrl?: string;
  readonly apiToken?: string;
  readonly pollSeconds: number;
};

export const DEFAULT_API_URL = "https://api.linear.app/graphql";
export const POLL_SECONDS = { default: 60, min: 15, max: 3600 } as const;

// Never throws: an unconfigured plugin still starts, lists its tools and serves
// its views, and each tool reports what is missing.
export function loadConfig(env: Record<string, string | undefined> = process.env): LinearConfig {
  const apiUrl = normalizeEndpoint(env.LINEAR_API_URL?.trim() || DEFAULT_API_URL);
  const apiToken = env.LINEAR_API_TOKEN?.trim();
  return {
    ...(apiUrl ? { apiUrl } : {}),
    ...(apiToken ? { apiToken } : {}),
    pollSeconds: pollSeconds(env.LINEAR_POLL_SECONDS),
  };
}

// v1 defaulted to the bare origin (https://api.linear.app); Linear serves GraphQL
// at /graphql, so a bare origin gets that path.
export function normalizeEndpoint(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/graphql";
  return url.toString().replace(/\/+$/, "");
}

function pollSeconds(raw: string | undefined): number {
  const value = Number(raw);
  if (!raw?.trim() || !Number.isFinite(value)) return POLL_SECONDS.default;
  return Math.min(POLL_SECONDS.max, Math.max(POLL_SECONDS.min, Math.round(value)));
}
