import { buildIssueReviewWorkflow, issuePrompt } from "../issues.ts";
import { createViewBridge, toolData, type HostContext, type ViewBridge } from "./bridge.ts";
import { esc, renderReview, type ReviewData } from "./render.ts";

// host-context-changed may carry only the changed fields, so merge them.
export function startView(name: string): ViewBridge {
  const bridge = createViewBridge(window as never, { name, version: "0.2.0" });
  let context: HostContext = {};
  bridge.onHostContext = (update) => {
    context = { ...context, ...update };
    if (context.theme) document.documentElement.dataset.theme = context.theme;
  };
  new ResizeObserver(() => bridge.sendSize(document.documentElement.scrollWidth, document.documentElement.scrollHeight)).observe(document.body);
  return bridge;
}

// Issue review controller, shared by the standalone review view and the inline
// review pane of the issues view. "Start work" sends the issue into the thread
// as the user's own message (ui/message); the host rejects it where there is
// no thread, and the error is shown.
export function mountReview(bridge: ViewBridge, root: HTMLElement) {
  let data: ReviewData | undefined;
  let busy = false;
  let error: string | undefined;
  let notice: string | undefined;

  const draw = () => {
    if (data) root.innerHTML = renderReview(data, { busy, ...(error ? { error } : {}), ...(notice ? { notice } : {}) });
    else if (error) root.innerHTML = `<p class="error" role="alert">${esc(error)}</p>`;
    else if (busy) root.innerHTML = `<p class="row-detail">Loading issue…</p>`;
  };
  const run = async (task: () => Promise<void>) => {
    busy = true;
    error = undefined;
    draw();
    try {
      await task();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    busy = false;
    draw();
  };
  const load = (issueId: string) =>
    run(async () => {
      notice = undefined;
      data = toolData<ReviewData>(await bridge.callTool("linear_issue_review", { issueId }));
    });

  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target || !data) return;
    const current = data;
    if (target.dataset.action === "refresh-review") void load(current.issue.id);
    if (target.dataset.action === "open" && target.dataset.url) void run(() => bridge.openLink(target.dataset.url!));
    if (target.dataset.action === "approve")
      void run(async () => {
        await bridge.sendMessage(issuePrompt(current.issue));
        data = { ...current, workflow: buildIssueReviewWorkflow(current.issue, { sent: true }) };
        notice = "Sent to this thread.";
      });
  });

  return {
    show(next: ReviewData) {
      data = next;
      error = undefined;
      notice = undefined;
      draw();
    },
    load,
  };
}
