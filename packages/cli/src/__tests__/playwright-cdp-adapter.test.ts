import { describe, expect, test } from "vite-plus/test";
import { adaptCDPSession } from "../playwright-cdp-adapter.js";
import { createFakeSession } from "./helpers.js";

describe("adaptCDPSession", () => {
  test("send は下位セッションの結果をそのまま返す", async () => {
    const { session } = createFakeSession();
    const adapter = adaptCDPSession(session);
    const result = await adapter.send<{
      nodes: { nodeId: string; role: { value: string } }[];
    }>("Accessibility.getFullAXTree");
    expect(result).toEqual({
      nodes: [{ nodeId: "1", role: { value: "button" } }],
    });
  });

  test("on で登録したリスナがイベント発火で呼ばれる", () => {
    const { session, listeners } = createFakeSession();
    const adapter = adaptCDPSession(session);

    let received: unknown = null;
    const listener = (params: unknown) => {
      received = params;
    };
    adapter.on("DOM.documentUpdated", listener);

    for (const l of listeners.get("DOM.documentUpdated")!) {
      l({ type: "updated" });
    }
    expect(received).toEqual({ type: "updated" });
  });

  test("off でリスナが解除される", () => {
    const { session, listeners } = createFakeSession();
    const adapter = adaptCDPSession(session);

    const listener = () => {};
    adapter.on("DOM.documentUpdated", listener);
    adapter.off("DOM.documentUpdated", listener);

    const registered = listeners.get("DOM.documentUpdated");
    expect(registered?.size ?? 0).toBe(0);
  });
});
