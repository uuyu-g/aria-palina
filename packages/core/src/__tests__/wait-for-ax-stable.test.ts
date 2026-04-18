import { describe, expect, test, vi } from "vite-plus/test";
import type { GetFullAXTreeResult, RawAXNode } from "../ax-protocol.js";
import type { ICDPClient } from "../cdp-client.js";
import { waitForAXStable } from "../wait-for-ax-stable.js";

function rawNode(id: string, role = "generic", ignored = false): RawAXNode {
  return { nodeId: id, ignored, role: { type: "role", value: role } };
}

/** `nodes[i]` を i 回目の getFullAXTree 応答として返すモック。 */
function scriptedCdp(snapshots: RawAXNode[][]): ICDPClient {
  let call = 0;
  return {
    send: vi.fn(async () => {
      const nodes = snapshots[Math.min(call, snapshots.length - 1)] ?? [];
      call++;
      return { nodes } satisfies GetFullAXTreeResult as unknown;
    }) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe("waitForAXStable", () => {
  test("連続 stableCount 回フィンガープリントが一致したら true で解決する", async () => {
    vi.useFakeTimers();
    try {
      const cdp = scriptedCdp([
        [rawNode("1", "button")],
        [rawNode("1", "button")],
        [rawNode("1", "button")],
      ]);
      const p = waitForAXStable(cdp, { interval: 100, stableCount: 3, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(300);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("途中で差分があればカウントがリセットされる", async () => {
    vi.useFakeTimers();
    try {
      const cdp = scriptedCdp([
        [rawNode("1", "button")],
        [rawNode("1", "button"), rawNode("2", "heading")], // ← 差分
        [rawNode("1", "button"), rawNode("2", "heading")],
        [rawNode("1", "button"), rawNode("2", "heading")],
      ]);
      const p = waitForAXStable(cdp, { interval: 100, stableCount: 3, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(400);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("timeout を超えても安定しなければ false で解決する", async () => {
    vi.useFakeTimers();
    try {
      let counter = 0;
      const cdp: ICDPClient = {
        send: vi.fn(async () => {
          // 呼ばれる度に違うツリー (= ずっと不安定)
          counter++;
          return { nodes: [rawNode(`${counter}`, "button")] } as unknown;
        }) as ICDPClient["send"],
        on: vi.fn(),
        off: vi.fn(),
      };
      const p = waitForAXStable(cdp, { interval: 100, stableCount: 3, timeout: 500 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("静的な (既に安定した) ツリーでもすぐに true で解決する", async () => {
    vi.useFakeTimers();
    try {
      const stable = [rawNode("1", "main"), rawNode("2", "heading"), rawNode("3", "button")];
      const cdp = scriptedCdp([stable, stable, stable, stable]);
      const p = waitForAXStable(cdp, { interval: 50, stableCount: 3, timeout: 1000 });
      await vi.advanceTimersByTimeAsync(200);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
