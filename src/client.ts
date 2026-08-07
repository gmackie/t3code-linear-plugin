export type GraphqlRequest = {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
};

export type GraphqlTransport = (request: GraphqlRequest) => Promise<unknown>;

export type LinearCompatibleClient = {
  readonly request: GraphqlTransport;
};

export function createLinearCompatibleClient(input: {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
}): LinearCompatibleClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    request: async (request) => {
      const response = await fetchImpl(input.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Linear-compatible request failed (${response.status})`);
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object" && "errors" in payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
        throw new Error("Linear-compatible GraphQL request returned errors");
      }
      return payload;
    },
  };
}
