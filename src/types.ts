export type WorkItem = {
  providerId: "linear";
  id: string;
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
  identifier?: string;
  title: string;
  description?: string | null;
  url?: string | null;
  updatedAt?: string | null;
  projectId?: string | null;
  state?: { id?: string; name?: string; type?: string } | null;
  labels?: { nodes?: readonly { name?: string }[] } | null;
};

export type LinearProject = { id: string; name: string };
