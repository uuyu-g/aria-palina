import { describe, expect, test, vi } from "vite-plus/test";

import { clickNode, focusNode } from "../actions.js";
import type { ICDPClient } from "../cdp-client.js";

interface Call {
  method: string;
  params: Record<string, unknown> | undefined;
}

/**
 * `DOM.getBoxModel` 用に決まったレスポンスを返しつつ呼び出し履歴を記録する
 * 軽量モック。他のメソッドは空オブジェクトを返す。
 */
function mockCDP(boxModelContent?: number[]): { client: ICDPClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: ICDPClient = {
    send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === "DOM.getBoxModel") {
        return {
          model: {
            content: boxModelContent ?? [10, 20, 30, 20, 30, 40, 10, 40],
          },
        };
      }
      return {};
    }) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
  return { client, calls };
}

describe("clickNode", () => {
  test("scrollIntoViewIfNeeded → getBoxModel → mousePressed → mouseReleased の順で CDP を呼ぶ", async () => {
    const { client, calls } = mockCDP();
    await clickNode(client, 42);
    expect(calls.map((c) => c.method)).toEqual([
      "DOM.scrollIntoViewIfNeeded",
      "DOM.getBoxModel",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
    ]);
  });

  test("コンテンツボックスの中心座標でマウスイベントを発行する", async () => {
    // content = [10,20, 30,20, 30,40, 10,40] → 中心 (20, 30)
    const { client, calls } = mockCDP();
    await clickNode(client, 42);
    expect(calls[2]?.params).toEqual({
      type: "mousePressed",
      x: 20,
      y: 30,
      button: "left",
      clickCount: 1,
    });
    expect(calls[3]?.params).toEqual({
      type: "mouseReleased",
      x: 20,
      y: 30,
      button: "left",
      clickCount: 1,
    });
  });

  test("非矩形なコンテンツボックスでも 4 点の算術平均が使われる", async () => {
    // ひし形に近い点列。平均は ((5+15+25+15)/4, (0+5+0+-5)/4) = (15, 0)
    const { client, calls } = mockCDP([5, 0, 15, 5, 25, 0, 15, -5]);
    await clickNode(client, 7);
    expect(calls[2]?.params).toMatchObject({ x: 15, y: 0 });
  });

  test("scrollIntoViewIfNeeded と getBoxModel に backendNodeId を渡す", async () => {
    const { client, calls } = mockCDP();
    await clickNode(client, 123);
    expect(calls[0]?.params).toEqual({ backendNodeId: 123 });
    expect(calls[1]?.params).toEqual({ backendNodeId: 123 });
  });

  test("backendNodeId=0 のときは CDP を一切呼ばない", async () => {
    const { client, calls } = mockCDP();
    await clickNode(client, 0);
    expect(calls).toEqual([]);
  });
});

describe("focusNode", () => {
  test("DOM.focus を backendNodeId 付きで 1 回だけ送る", async () => {
    const { client, calls } = mockCDP();
    await focusNode(client, 99);
    expect(calls).toEqual([{ method: "DOM.focus", params: { backendNodeId: 99 } }]);
  });

  test("backendNodeId=0 のときは CDP を一切呼ばない", async () => {
    const { client, calls } = mockCDP();
    await focusNode(client, 0);
    expect(calls).toEqual([]);
  });
});
