export type WorkItem = {
  providerId: "linear";
  id: string;
  /** Human key such as ENG-123, when the endpoint provides one. */
  identifier?: string;
  title: string;
  description?: string;
  url?: string;
  status: { id: string; label: string; category: "backlog" | "active" | "blocked" | "done" | "cancelled" };
  scope: { projectId?: string; query?: string };
  updatedAt?: string;
  labels?: readonly string[];
};

export type LinearIssue = {
  id: string;
  identifier?: string | null;
  title: string;
  description?: string | null;
  url?: string | null;
  updatedAt?: string | null;
  /** Some Linear-compatible endpoints expose this; Linear itself uses project { id }. */
  projectId?: string | null;
  project?: { id?: string } | null;
  state?: { id?: string; name?: string; type?: string } | null;
  labels?: { nodes?: readonly { name?: string }[] } | null;
};

export type LinearProject = { id: string; name: string };
