import { STYLES } from "./render.ts";

export const VIEWS = {
  issues: { uri: "ui://linear/issues.html", entry: "issues.client.ts", title: "Linear issues" },
  review: { uri: "ui://linear/issue-review.html", entry: "review.client.ts", title: "Linear issue review" },
} as const;

export type ViewName = keyof typeof VIEWS;

const cache = new Map<ViewName, Promise<string>>();

// Views are single self-contained HTML documents: T3 snapshots the resource
// once and serves it into a sandboxed iframe with connect-src 'none', so the
// script is bundled and inlined rather than loaded from anywhere.
export function viewHtml(name: ViewName): Promise<string> {
  let html = cache.get(name);
  if (!html) {
    html = build(name);
    cache.set(name, html);
  }
  return html;
}

async function build(name: ViewName): Promise<string> {
  const view = VIEWS[name];
  const result = await Bun.build({
    entrypoints: [new URL(view.entry, import.meta.url).pathname],
    target: "browser",
    format: "esm",
    minify: true,
  });
  if (!result.success) throw new AggregateError(result.logs, `failed to bundle ${view.entry}`);
  const script = (await result.outputs[0]!.text()).replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${view.title}</title>
<style>${STYLES}</style>
</head>
<body>
<main id="app" aria-live="polite">Loading…</main>
<script type="module">${script}</script>
</body>
</html>`;
}
