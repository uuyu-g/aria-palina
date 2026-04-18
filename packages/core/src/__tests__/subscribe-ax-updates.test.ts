import { describe, expect, test, vi } from "vite-plus/test";
import type { A11yNode } from "../types.js";
import type { AXUpdateCause } from "../subscribe-ax-updates.js";
import { subscribeAXTreeUpdates } from "../subscribe-ax-updates.js";
import { createMockCDPClient } from "./helpers.js";

function makeClientWithTree(snapshots: Array<Array<{ id: string; role: string }>>) {
  const base = createMockCDPClient();
  let call = 0;
  base.client.send = vi.fn(async (method: string) => {
    if (method === "Accessibility.getFullAXTree") {
      const snap = snapshots[Math.min(call, snapshots.length - 1)] ?? [];
      call++;
      return {
        nodes: snap.map((n) => ({
          nodeId: n.id,
          ignored: false,
          role: { type: "role", value: n.role },
        })),
      } as unknown;
    }
    return {} as unknown;
  }) as typeof base.client.send;
  return base;
}

describe("subscribeAXTreeUpdates", () => {
  test("DOM.enable と Page.enable を発行する", async () => {
    const { client } = createMockCDPClient();
    const send = vi.fn(async () => ({})) as typeof client.send;
    client.send = send;

    const sub = await subscribeAXTreeUpdates(client, () => {});
    const methods = (send as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (c) => c[0],
    );
    expect(methods).toContain("DOM.enable");
    expect(methods).toContain("Page.enable");
    await sub.unsubscribe();
  });

  test("DOM.documentUpdated でデバウンス後に onUpdate が発火する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([
        [{ id: "1", role: "button" }],
        [
          { id: "1", role: "button" },
          { id: "2", role: "heading" },
        ],
      ]);
      const updates: Array<{ nodes: A11yNode[]; cause: AXUpdateCause }> = [];
      const sub = await subscribeAXTreeUpdates(
        client,
        (nodes, cause) => updates.push({ nodes, cause }),
        { debounceMs: 100 },
      );

      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(50);
      expect(updates).toHaveLength(0); // まだデバウンス中
      await vi.advanceTimersByTimeAsync(60);
      // 抽出の await を回す
      await Promise.resolve();
      await Promise.resolve();

      expect(updates).toHaveLength(1);
      expect(updates[0]?.cause).toBe("document");
      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("連続イベントはデバウンスでまとめられる", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        debounceMs: 100,
      });

      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(30);
      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(30);
      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(120);
      await Promise.resolve();
      await Promise.resolve();

      expect(causes).toHaveLength(1);
      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("Page.frameNavigated はメインフレームのみ反応する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        debounceMs: 50,
      });

      // 子フレーム: 無視される
      emit("Page.frameNavigated", { frame: { id: "sub", parentId: "main" } });
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      expect(causes).toHaveLength(0);

      // メインフレーム: 反応
      emit("Page.frameNavigated", { frame: { id: "main" } });
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();

      expect(causes).toEqual(["navigation"]);
      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("Page.lifecycleEvent は load / networkIdle のみ反応する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        debounceMs: 50,
      });

      emit("Page.lifecycleEvent", { name: "DOMContentLoaded" });
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      expect(causes).toHaveLength(0);

      emit("Page.lifecycleEvent", { name: "load" });
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
      expect(causes).toEqual(["lifecycle"]);

      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("refresh() は即時に manual cause で onUpdate を呼ぶ", async () => {
    const { client } = makeClientWithTree([[{ id: "1", role: "button" }]]);
    const causes: AXUpdateCause[] = [];
    const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c));

    await sub.refresh();

    expect(causes).toEqual(["manual"]);
    await sub.unsubscribe();
  });

  test("unsubscribe 後のイベントでは onUpdate が呼ばれない", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit, listeners } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        debounceMs: 50,
      });
      await sub.unsubscribe();

      // リスナは全て off されているはず
      expect(listeners.get("DOM.documentUpdated")?.size ?? 0).toBe(0);
      expect(listeners.get("Page.frameNavigated")?.size ?? 0).toBe(0);
      expect(listeners.get("Page.lifecycleEvent")?.size ?? 0).toBe(0);

      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      expect(causes).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
