import { describe, expect, test, vi } from "vite-plus/test";

import type { GetFullAXTreeResult, RawAXNode } from "../ax-protocol.js";
import type { ICDPClient } from "../cdp-client.js";
import { extractA11yTree } from "../extract.js";

/**
 * 外部境界 (`ICDPClient`) は vi.fn() ベースのモックで十分。
 * 検証したいのはあくまで `extractA11yTree` の戻り値 (A11yNode[]) なので、
 * モックの役割は「決まった応答を返す」ことに限定する。
 */
function mockCDPClient(result: GetFullAXTreeResult): ICDPClient {
  return {
    send: vi.fn(async () => result) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe("extractA11yTree", () => {
  test("単一ノードの CDP 応答を A11yNode の配列に変換する", async () => {
    const nodes: RawAXNode[] = [
      {
        nodeId: "1",
        ignored: false,
        role: { type: "role", value: "main" },
        name: { type: "computedString", value: "メイン" },
      },
    ];
    const tree = await extractA11yTree(mockCDPClient({ nodes }));

    expect(tree).toHaveLength(1);
    expect(tree[0]?.role).toBe("main");
    expect(tree[0]?.name).toBe("メイン");
    expect(tree[0]?.speechText).toBe("[メイン] メイン");
    expect(tree[0]?.depth).toBe(0);
  });

  test("CDP が空の nodes を返したときは空配列を返す", async () => {
    const tree = await extractA11yTree(mockCDPClient({ nodes: [] }));
    expect(tree).toEqual([]);
  });

  test("多段ツリーが DFS 順で平坦化される", async () => {
    const tree = await extractA11yTree(
      mockCDPClient({
        nodes: [
          {
            nodeId: "r",
            ignored: false,
            role: { type: "role", value: "main" },
            childIds: ["c"],
          },
          {
            nodeId: "c",
            parentId: "r",
            ignored: false,
            role: { type: "role", value: "button" },
            name: { type: "computedString", value: "送信" },
          },
        ],
      }),
    );
    expect(tree.map((n) => [n.role, n.depth, n.speechText])).toEqual([
      ["main", 0, "[メイン]"],
      ["button", 1, "[ボタン] 送信"],
    ]);
  });
});
