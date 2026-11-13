import { toolData } from "./bridge.ts";
import { issueList, renderIssues, type IssuesData } from "./render.ts";
import { mountReview, startView } from "./shared.client.ts";

const bridge = startView("linear-issues");
const root = document.getElementById("app")!;
let data: IssuesData | undefined;
let filter = "";
let error: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let review: ReturnType<typeof mountReview> | undefined;

// Without a previous data set there is nothing to keep, so the error replaces
// the panel; otherwise draw() shows it in the header over the old data.
function showError(message: string) {
  error = message;
  if (!data) root.textContent = message;
}

function draw() {
  if (!data) return;
  // Keep the review pane (and its state) across list refreshes.
  const pane = root.querySelector<HTMLElement>("[data-role=review]");
  root.innerHTML = renderIssues(data, filter, error);
  if (pane) root.querySelector("[data-role=review]")!.replaceWith(pane);
  else review = mountReview(bridge, root.querySelector<HTMLElement>("[data-role=review]")!);
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), data.pollSeconds * 1000);
}

async function refresh(projectId = data?.projectId) {
  clearTimeout(timer);
  if (document.visibilityState === "hidden") {
    timer = setTimeout(() => void refresh(), 5000);
    return;
  }
  try {
    data = toolData<IssuesData>(await bridge.callTool("linear_issues", projectId ? { projectId } : {}));
    error = undefined;
  } catch (cause) {
    showError(`Refresh failed: ${cause instanceof Error ? cause.message : cause}`);
  }
  draw();
}

root.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.role !== "filter" || !data) return;
  filter = input.value;
  // Replacing the focused input interrupts native WebView text entry.
  const template = document.createElement("template");
  template.innerHTML = issueList(data, filter);
  root.querySelector('[aria-label="Issues"]')!.replaceWith(template.content.firstElementChild!);
});

root.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  if (select.dataset.role === "project" && select.value) {
    filter = "";
    void refresh(select.value);
  }
});

root.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (target?.dataset.action === "refresh") void refresh();
  if (target?.dataset.action === "review" && target.dataset.issueId) void review?.load(target.dataset.issueId);
});

bridge.onToolResult = (result) => {
  if (result.isError) {
    showError(result.content?.find((part) => part.type === "text")?.text ?? "Linear issues failed to load.");
  } else {
    data = toolData<IssuesData>(result);
    error = undefined;
  }
  draw();
};
// The panel's opening tool (linear_issues) delivers the first result; load it
// ourselves if a host only renders the resource.
void bridge.connect().then(() => setTimeout(() => void (data ? undefined : refresh()), 250));
