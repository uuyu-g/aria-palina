import { describe, expect, test } from "vite-plus/test";

import type { RawAXNode } from "../ax-protocol.js";
import { extractA11yTree } from "../extract.js";
import { mockCDPClient } from "./helpers.js";

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
    expect(tree[0]?.speechText).toBe("[main] メイン");
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
      ["main", 0, "[main]"],
      ["button", 1, "[button] 送信"],
    ]);
  });
});
