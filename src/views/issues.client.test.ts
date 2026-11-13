import { afterAll, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { connectedClient, fakeLinear } from "../testing.ts";

const fake = fakeLinear();
afterAll(() => fake.stop());

// Runs the real issues view module against a DOM, with this test acting as the
// host frame: it forwards tools/call to the MCP server and records ui/message.
describe("issues view in a DOM", () => {
  it("loads a project, reviews an issue and sends it to the thread", async () => {
    const client = await connectedClient({ LINEAR_API_URL: fake.url, LINEAR_API_TOKEN: "lin_api_test" });
    const win = new Window({ url: "https://view.invalid/" });
    const calls: string[] = [];
    const messages: string[] = [];
    const deliver = (data: unknown) => win.dispatchEvent(new win.MessageEvent("message", { data, source: parent as never }));
    const parent = {
      async postMessage(message: { id?: number; method?: string; params?: any }) {
        if (message.method === "ui/initialize") deliver({ jsonrpc: "2.0", id: message.id, result: { hostContext: { theme: "dark" } } });
        if (message.method === "ui/message") {
          messages.push(message.params.content[0].text);
          deliver({ jsonrpc: "2.0", id: message.id, result: {} });
        }
        if (message.method === "tools/call") {
          calls.push(message.params.name);
          deliver({ jsonrpc: "2.0", id: message.id, result: await client.callTool({ name: message.params.name, arguments: message.params.arguments }) });
        }
      },
    };
    Object.defineProperty(win, "parent", { value: parent });
    win.document.body.innerHTML = `<main id="app">Loading…</main>`;
    Object.assign(globalThis, { window: win, document: win.document, ResizeObserver: class { observe() {} } });

    await import("./issues.client.ts");
    // The panel's opening tool result: projects only.
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: await client.callTool({ name: "linear_issues", arguments: {} }) });
    const doc = win.document;
    const settle = () => Bun.sleep(40);
    await settle();
    expect(doc.documentElement.dataset.theme).toBe("dark");
    expect(doc.body.textContent).toContain("Choose a project");

    const select = doc.querySelector<HTMLSelectElement>("[data-role=project]")!;
    select.value = "p1";
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
    await settle();
    expect(doc.querySelectorAll("[data-action=review]")).toHaveLength(2);

    (doc.querySelector('[data-issue-id="i1"]') as unknown as HTMLElement).click();
    await settle();
    expect(doc.querySelector("[data-role=review] strong")?.textContent).toBe("review");

    (doc.querySelector("[data-action=approve]") as unknown as HTMLElement).click();
    await settle();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toStartWith("Work on Linear issue ENG-1: Port the plugin");
    expect(doc.querySelector("[data-role=review] strong")?.textContent).toBe("verify");
    expect(doc.querySelector("[data-action=approve]")).toBeNull();
    expect(calls).toEqual(["linear_issues", "linear_issue_review"]);
    await win.happyDOM.abort();
  });
});
