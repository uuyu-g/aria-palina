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
  test("DOM.enable / Page.enable / Page.setLifecycleEventsEnabled / DOM.getDocument を発行する", async () => {
    const { client } = createMockCDPClient();
    const send = vi.fn(async () => ({})) as typeof client.send;
    client.send = send;

    const sub = await subscribeAXTreeUpdates(client, () => {});
    const calls = (send as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const methods = calls.map((c) => c[0]);
    // 粗粒度イベント有効化
    expect(methods).toContain("DOM.enable");
    expect(methods).toContain("Page.enable");
    // Page.lifecycleEvent を確実に発火させるため明示的に有効化する
    expect(methods).toContain("Page.setLifecycleEventsEnabled");
    // mutation イベントは「発見済みノード」にしか発火しない CDP 仕様のため、
    // 全ノードを front-end に載せておく必要がある
    const getDocCall = calls.find((c) => c[0] === "DOM.getDocument");
    expect(getDocCall).toBeDefined();
    expect(getDocCall?.[1]).toEqual({ depth: -1, pierce: true });
    await sub.unsubscribe();
  });

  test("DOM.documentUpdated 時に DOM.getDocument を再発行してノード追跡を張り直す", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const send = client.send as unknown as { mock: { calls: unknown[][] } };
      const sub = await subscribeAXTreeUpdates(client, () => {}, { debounceMs: 50 });

      const initialGetDoc = send.mock.calls.filter((c) => c[0] === "DOM.getDocument").length;
      expect(initialGetDoc).toBe(1);

      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(80);
      await Promise.resolve();
      await Promise.resolve();

      const afterGetDoc = send.mock.calls.filter((c) => c[0] === "DOM.getDocument").length;
      expect(afterGetDoc).toBe(2);
      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("Page.setLifecycleEventsEnabled が未サポートでも初期化は成功する", async () => {
    const { client } = createMockCDPClient();
    client.send = vi.fn(async (method: string) => {
      if (method === "Page.setLifecycleEventsEnabled") {
        throw new Error("'Page.setLifecycleEventsEnabled' wasn't found");
      }
      return {};
    }) as typeof client.send;

    // throw しないことだけ検証 (フォールバックして粗粒度イベントは引き続き
    // 動作することを期待)
    const sub = await subscribeAXTreeUpdates(client, () => {});
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

      // リスナは全て off されているはず (粗粒度 + 細粒度 mutation)
      expect(listeners.get("DOM.documentUpdated")?.size ?? 0).toBe(0);
      expect(listeners.get("Page.frameNavigated")?.size ?? 0).toBe(0);
      expect(listeners.get("Page.lifecycleEvent")?.size ?? 0).toBe(0);
      expect(listeners.get("DOM.childNodeInserted")?.size ?? 0).toBe(0);
      expect(listeners.get("DOM.childNodeRemoved")?.size ?? 0).toBe(0);
      expect(listeners.get("DOM.attributeModified")?.size ?? 0).toBe(0);

      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(200);
      await Promise.resolve();
      expect(causes).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("DOM.childNodeInserted は mutationDebounceMs 経過後に mutation cause で発火する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        debounceMs: 100,
        mutationDebounceMs: 400,
      });

      emit("DOM.childNodeInserted", {});
      // 粗粒度のデバウンス (100ms) では発火してはいけない
      await vi.advanceTimersByTimeAsync(150);
      await Promise.resolve();
      expect(causes).toHaveLength(0);

      // 細粒度のデバウンス (合計 400ms) を超えたら発火する
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
      await Promise.resolve();
      expect(causes).toEqual(["mutation"]);

      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("DOM.childNodeRemoved / DOM.attributeModified も mutation cause で発火する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        mutationDebounceMs: 100,
      });

      emit("DOM.childNodeRemoved", {});
      await vi.advanceTimersByTimeAsync(120);
      await Promise.resolve();
      await Promise.resolve();
      expect(causes).toEqual(["mutation"]);

      emit("DOM.attributeModified", {});
      await vi.advanceTimersByTimeAsync(120);
      await Promise.resolve();
      await Promise.resolve();
      expect(causes).toEqual(["mutation", "mutation"]);

      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("連続する mutation バーストはデバウンスでまとめられる", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        mutationDebounceMs: 200,
      });

      for (let i = 0; i < 10; i++) {
        emit("DOM.childNodeInserted", {});
        await vi.advanceTimersByTimeAsync(50);
      }
      // 最後の emit から 200ms 以上経過させる
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
      await Promise.resolve();

      expect(causes).toEqual(["mutation"]);
      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("mutation と粗粒度イベントが重なると粗粒度の cause が優先される", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        debounceMs: 100,
        mutationDebounceMs: 400,
      });

      // 先に mutation、続いて documentUpdated。debounce はドキュメントの 100ms で再設定される。
      emit("DOM.childNodeInserted", {});
      await vi.advanceTimersByTimeAsync(50);
      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(120);
      await Promise.resolve();
      await Promise.resolve();

      expect(causes).toEqual(["document"]);
      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  test("subscribeMutations: false で mutation イベントは購読されない", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit, listeners } = makeClientWithTree([[{ id: "1", role: "button" }]]);
      const causes: AXUpdateCause[] = [];
      const sub = await subscribeAXTreeUpdates(client, (_n, c) => causes.push(c), {
        mutationDebounceMs: 100,
        subscribeMutations: false,
      });

      // mutation 系の on は呼ばれていない
      expect(listeners.get("DOM.childNodeInserted")?.size ?? 0).toBe(0);
      expect(listeners.get("DOM.childNodeRemoved")?.size ?? 0).toBe(0);
      expect(listeners.get("DOM.attributeModified")?.size ?? 0).toBe(0);

      emit("DOM.childNodeInserted", {});
      emit("DOM.childNodeRemoved", {});
      emit("DOM.attributeModified", {});
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
      expect(causes).toHaveLength(0);

      // 粗粒度はそのまま購読されている
      emit("DOM.documentUpdated", {});
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
      await Promise.resolve();
      expect(causes).toEqual(["document"]);

      await sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
