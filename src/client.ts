export type GraphqlRequest = {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
};

export type GraphqlTransport = (request: GraphqlRequest) => Promise<unknown>;

export type LinearCompatibleClient = {
  readonly request: GraphqlTransport;
};

export class LinearRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const REQUEST_TIMEOUT_MS = 15_000;

// Linear personal API keys and Kanbanger keys go in the Authorization header as
// is; Linear OAuth access tokens (lin_oauth_...) need the Bearer scheme.
export function authorizationHeader(token: string): string {
  if (/^bearer\s/i.test(token)) return token;
  return token.startsWith("lin_oauth_") ? `Bearer ${token}` : token;
}

// Errors carry no endpoint URL or response body: they reach agents and views.
export function createLinearCompatibleClient(input: {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): LinearCompatibleClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return {
    request: async (request) => {
      let response: Response;
      try {
        response = await fetchImpl(input.endpoint, {
          method: "POST",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: authorizationHeader(input.token),
          },
          body: JSON.stringify(request),
        });
      } catch (error) {
        if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
          throw new LinearRequestError(`Linear-compatible request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw new LinearRequestError("Could not reach the Linear-compatible endpoint");
      }
      if (!response.ok) {
        if (response.status >= 500) throw new LinearRequestError(`Linear-compatible endpoint is temporarily unavailable (${response.status})`, response.status);
        if (response.status === 401 || response.status === 403) {
          throw new LinearRequestError(`Linear-compatible endpoint rejected the API token (${response.status}); check LINEAR_API_TOKEN`, response.status);
        }
        // Linear answers some GraphQL errors (e.g. bad input) with 400 and a JSON body.
        const message = graphqlErrorMessage(await response.json().catch(() => null));
        throw new LinearRequestError(`Linear-compatible request failed (${response.status})${message ? `: ${message}` : ""}`, response.status);
      }
      const payload: unknown = await response.json().catch(() => {
        throw new LinearRequestError("Linear-compatible endpoint returned a non-JSON response");
      });
      const message = graphqlErrorMessage(payload);
      if (message !== undefined) throw new LinearRequestError(`Linear-compatible GraphQL request returned errors: ${message}`);
      return payload;
    },
  };
}

function graphqlErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("errors" in payload) || !Array.isArray(payload.errors) || payload.errors.length === 0) return undefined;
  const first: unknown = payload.errors[0];
  const message = first && typeof first === "object" && "message" in first && typeof first.message === "string" ? first.message : "unknown error";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
