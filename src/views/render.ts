// Pure HTML renderers shared by the ui:// views (bundled into the browser) and
// the tests. All dynamic text goes through esc().
import { issueKey, type IssueReviewWorkflowModel, type LinearIssueState } from "../issues.ts";
import type { LinearProject, WorkItem } from "../types.ts";

export type IssuesData = {
  projects: readonly LinearProject[];
  projectId?: string;
  issues: readonly WorkItem[];
  pollSeconds: number;
  refreshedAt: string;
};

export type ReviewData = {
  issue: WorkItem;
  states: readonly LinearIssueState[];
  workflow: IssueReviewWorkflowModel;
};

export function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

function pill(label: string, tone: string): string {
  return `<span class="pill pill-${esc(tone)}">${esc(label)}</span>`;
}

const itemTone: Record<WorkItem["status"]["category"], string> = {
  backlog: "neutral",
  active: "active",
  blocked: "warning",
  done: "positive",
  cancelled: "muted",
};

const matches = (item: WorkItem, query: string) => item.title.toLowerCase().includes(query) || issueKey(item).toLowerCase().includes(query);

export function issueList(data: IssuesData, filter = ""): string {
  const query = filter.trim().toLowerCase();
  const items = query ? data.issues.filter((item) => matches(item, query)) : data.issues;
  const rows = items.length
    ? items
        .map(
          (item) => `<li class="row">
  <div class="row-main">
    <div class="row-title">${esc(item.title)}</div>
    <div class="row-meta">${pill(item.status.label, itemTone[item.status.category])}<span class="mono">${esc(issueKey(item))}</span>${(item.labels ?? []).map((label) => `<span>${esc(label)}</span>`).join("")}${item.updatedAt ? `<span>updated ${esc(time(item.updatedAt))}</span>` : ""}</div>
  </div>
  <button type="button" data-action="review" data-issue-id="${esc(item.id)}">Review</button>
</li>`,
        )
        .join("\n")
    : `<li class="empty">${query ? "No issues match the filter." : "No issues in this project."}</li>`;
  return `<section aria-label="Issues"><h2>Issues <span class="count">${items.length}</span></h2><ul>${rows}</ul></section>`;
}

export function renderIssues(data: IssuesData, filter = ""): string {
  const options = data.projects
    .map((project) => `<option value="${esc(project.id)}"${project.id === data.projectId ? " selected" : ""}>${esc(project.name)}</option>`)
    .join("");
  const picker = data.projects.length
    ? `<label class="field">Project <select data-role="project">${data.projectId ? "" : `<option value="" selected>Choose a project</option>`}${options}</select></label>`
    : `<p class="empty">No Linear projects are visible to this API token.</p>`;
  const body = data.projectId
    ? `<input type="search" data-role="filter" placeholder="Filter issues" value="${esc(filter)}" aria-label="Filter issues">
${issueList(data, filter)}`
    : data.projects.length
      ? `<p class="empty">Choose a project to list its issues.</p>`
      : "";
  return `<header>
  <h1>Linear issues</h1>
  <div class="header-meta"><span>Refreshed ${esc(time(data.refreshedAt))} · every ${esc(data.pollSeconds)}s</span><button type="button" data-action="refresh">Refresh</button></div>
</header>
${picker}
${body}
<div data-role="review"></div>`;
}

const stepIcon: Record<IssueReviewWorkflowModel["steps"][number]["state"], string> = {
  pending: "○",
  active: "◐",
  completed: "●",
  blocked: "◌",
  failed: "✕",
};

export function renderReview(data: ReviewData, options: { busy?: boolean; error?: string; notice?: string } = {}): string {
  const { workflow, issue } = data;
  const steps = workflow.steps
    .map(
      (step) => `<li class="step step-${esc(step.state)}"><span class="step-icon" aria-hidden="true">${stepIcon[step.state]}</span><div><div class="row-title">${esc(step.title)}</div>${step.detail ? `<div class="row-detail">${esc(step.detail)}</div>` : ""}</div><span class="sr">${esc(step.state)}</span></li>`,
    )
    .join("\n");
  const evidence = (workflow.evidence ?? [])
    .map(
      (item) =>
        `<li class="row"><div class="row-main"><div class="row-title">${esc(item.title)}</div><div class="row-meta">${pill(item.status, item.status)}${item.detail ? `<span class="mono">${esc(item.detail)}</span>` : ""}</div></div>${item.url ? `<button type="button" data-action="open" data-url="${esc(item.url)}">Open in Linear</button>` : ""}</li>`,
    )
    .join("\n");
  const actions = (workflow.actions ?? [])
    .map((action) => `<button type="button" class="${action.tone === "primary" ? "primary" : ""}" data-action="${esc(action.id)}" ${options.busy ? "disabled" : ""}>${esc(action.title)}</button>`)
    .join("");
  return `<header>
  <h1>${esc(workflow.title)}</h1>
  <div class="header-meta"><span>Stage: <strong>${esc(workflow.currentStage)}</strong></span><button type="button" data-action="refresh-review">Refresh</button></div>
</header>
<p class="subject">${esc(issue.title)} ${pill(issue.status.label, itemTone[issue.status.category])} <span class="mono">${esc(issueKey(issue))}</span></p>
${options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : ""}
${options.notice ? `<p class="notice" role="status">${esc(options.notice)}</p>` : ""}
${issue.description ? `<pre class="description">${esc(issue.description)}</pre>` : ""}
<ol class="steps">${steps}</ol>
${evidence ? `<section aria-label="Evidence"><h2>Evidence</h2><ul>${evidence}</ul></section>` : ""}
${actions ? `<div class="actions">${actions}</div>` : ""}`;
}

export const STYLES = `
:root { color-scheme: light dark; --fg: #1f2328; --muted: #656d76; --bg: transparent; --line: #d0d7de; --accent: #5e6ad2; --pos: #1a7f37; --neg: #cf222e; --warn: #9a6700; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
:root[data-theme="dark"] { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #8b93f0; --pos: #3fb950; --neg: #f85149; --warn: #d29922; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #e6edf3; --muted: #8d96a0; --line: #30363d; --accent: #8b93f0; --pos: #3fb950; --neg: #f85149; --warn: #d29922; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; color: var(--fg); background: var(--bg); }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
h1 { font-size: 15px; margin: 0; } h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 16px 0 6px; }
.header-meta { display: flex; gap: 8px; align-items: center; color: var(--muted); }
ul, ol { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.row-main { flex: 1; min-width: 0; } .row-title { font-weight: 500; overflow-wrap: anywhere; }
.row-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: 12px; margin-top: 2px; }
.row-detail { color: var(--muted); font-size: 12px; margin-top: 2px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; overflow-wrap: anywhere; }
.count { font-weight: 400; } .empty { color: var(--muted); padding: 8px 0; border-top: 1px solid var(--line); margin: 10px 0 0; }
.pill { border: 1px solid currentColor; border-radius: 999px; padding: 0 7px; font-size: 11px; line-height: 17px; white-space: nowrap; }
.pill-active { color: var(--accent); } .pill-positive { color: var(--pos); } .pill-negative { color: var(--neg); } .pill-warning { color: var(--warn); } .pill-neutral, .pill-muted { color: var(--muted); }
button { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); } button:disabled { opacity: .5; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
input, select { font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; max-width: 100%; }
input[type="search"] { width: 100%; margin-top: 10px; }
.field { display: flex; gap: 6px; align-items: center; color: var(--muted); margin-top: 10px; }
.description { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; color: var(--fg); margin: 10px 0 0; padding: 8px; border: 1px solid var(--line); border-radius: 6px; max-height: 240px; overflow: auto; }
.steps { margin-top: 10px; } .step { display: flex; gap: 10px; padding: 6px 0; align-items: flex-start; }
.step-icon { width: 14px; text-align: center; color: var(--muted); } .step-active .step-icon { color: var(--accent); } .step-completed .step-icon { color: var(--pos); } .step-failed .step-icon { color: var(--neg); }
.step-pending .row-title { color: var(--muted); font-weight: 400; }
.actions { display: flex; gap: 8px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
.subject { margin: 6px 0 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.error { color: var(--neg); } .notice { color: var(--pos); } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
[data-role="review"]:not(:empty) { margin-top: 16px; padding-top: 4px; border-top: 2px solid var(--line); }
`;
