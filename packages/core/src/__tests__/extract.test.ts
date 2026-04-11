import { describe, expect, test, vi } from "vite-plus/test";

import type { GetFullAXTreeResult, RawAXNode } from "../ax-protocol.js";
import type { ICDPClient } from "../cdp-client.js";
import { extractA11yTree } from "../extract.js";

/** 最小限の ICDPClient モックを生成する。 */
function createMockCDPClient(result: GetFullAXTreeResult): ICDPClient {
  return {
    send: vi.fn(async () => result) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe("extractA11yTree", () => {
  test("ICDPClient.send 経由で Accessibility.getFullAXTree を呼び出す", async () => {
    const nodes: RawAXNode[] = [
      {
        nodeId: "1",
        ignored: false,
        role: { type: "role", value: "main" },
        name: { type: "computedString", value: "メイン" },
      },
    ];
    const cdp = createMockCDPClient({ nodes });
    const tree = await extractA11yTree(cdp);

    expect(cdp.send).toHaveBeenCalledTimes(1);
    expect(cdp.send).toHaveBeenCalledWith("Accessibility.getFullAXTree");
    expect(tree).toHaveLength(1);
    expect(tree[0]?.role).toBe("main");
    expect(tree[0]?.speechText).toBe("[メイン] メイン");
  });

  test("CDP が空の nodes を返したときは空配列を返す", async () => {
    const cdp = createMockCDPClient({ nodes: [] });
    const tree = await extractA11yTree(cdp);
    expect(tree).toEqual([]);
  });

  test("アダプター経由で多段ツリーを正しく平坦化する", async () => {
    const cdp = createMockCDPClient({
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
    });
    const tree = await extractA11yTree(cdp);
    expect(tree.map((n) => [n.role, n.depth, n.speechText])).toEqual([
      ["main", 0, "[メイン]"],
      ["button", 1, "[ボタン] 送信"],
    ]);
  });
});
