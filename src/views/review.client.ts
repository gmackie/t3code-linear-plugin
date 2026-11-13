import { toolData } from "./bridge.ts";
import type { ReviewData } from "./render.ts";
import { mountReview, startView } from "./shared.client.ts";

const bridge = startView("linear-issue-review");
const root = document.getElementById("app")!;
const review = mountReview(bridge, root);

bridge.onToolResult = (result) => {
  if (result.isError) {
    root.textContent = result.content?.find((part) => part.type === "text")?.text ?? "Linear issue review failed to load.";
    return;
  }
  review.show(toolData<ReviewData>(result));
};
void bridge.connect();
