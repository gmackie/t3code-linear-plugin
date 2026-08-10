export const manifest = {
  schemaVersion: 1,
  id: "com.t3code.linear",
  displayName: "Linear",
  version: "0.1.0",
  runtime: { kind: "managed-app", command: ["linear-t3-plugin"], restart: "on-failure" },
  contributes: {
    panels: [{ id: "linear.issues", title: "Linear issues", surface: "project" }],
    workflows: [{ id: "linear.issue-review", title: "Issue review", surface: "thread.main" }],
    hooks: ["project.opened", "thread.created"],
  },
  capabilities: [
    { kind: "secrets.read", names: ["LINEAR_API_KEY"] },
    { kind: "network.connect", hosts: ["api.linear.app"] },
    { kind: "ui.embed", surfaces: ["project"] },
    { kind: "threads.read", projectIds: [] },
    { kind: "threads.dispatch", projectIds: [] },
  ],
} as const;
