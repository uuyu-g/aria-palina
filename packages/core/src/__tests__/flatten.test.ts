import { describe, expect, test } from "vite-plus/test";

import type { RawAXNode } from "../ax-protocol.js";
import { flattenAXTree } from "../flatten.js";

/** テスト用に RawAXNode を作る薄いヘルパー。 */
function node(partial: Partial<RawAXNode> & Pick<RawAXNode, "nodeId" | "ignored">): RawAXNode {
  return { ...partial };
}

describe("flattenAXTree", () => {
  test("単一ルートノードは depth 0 で返される", () => {
    const result = flattenAXTree([
      node({
        nodeId: "1",
        ignored: false,
        role: { type: "role", value: "main" },
        name: { type: "computedString", value: "メイン" },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.depth).toBe(0);
    expect(result[0]?.role).toBe("main");
    expect(result[0]?.name).toBe("メイン");
  });

  test("childIds を辿るたびに depth がインクリメントされる", () => {
    const result = flattenAXTree([
      node({
        nodeId: "root",
        ignored: false,
        role: { type: "role", value: "main" },
        childIds: ["a"],
      }),
      node({
        nodeId: "a",
        parentId: "root",
        ignored: false,
        role: { type: "role", value: "navigation" },
        childIds: ["b"],
      }),
      node({
        nodeId: "b",
        parentId: "a",
        ignored: false,
        role: { type: "role", value: "link" },
        name: { type: "computedString", value: "ホーム" },
      }),
    ]);
    expect(result.map((n) => [n.role, n.depth])).toEqual([
      ["main", 0],
      ["navigation", 1],
      ["link", 2],
    ]);
  });

  test("ignored ノードは透過的にスキップされ、子ノードが親に繰り上がる", () => {
    const result = flattenAXTree([
      node({
        nodeId: "root",
        ignored: false,
        role: { type: "role", value: "main" },
        childIds: ["transparent", "visible"],
      }),
      node({
        nodeId: "transparent",
        parentId: "root",
        ignored: true,
        role: { type: "role", value: "none" },
        childIds: ["promoted"],
      }),
      node({
        nodeId: "promoted",
        parentId: "transparent",
        ignored: false,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "繰り上がり" },
      }),
      node({
        nodeId: "visible",
        parentId: "root",
        ignored: false,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "見える" },
      }),
    ]);
    // ignored ノード自体は出力に含まれないが、その子は繰り上がる
    expect(result.map((n) => n.name)).toEqual(["", "繰り上がり", "見える"]);
    // 繰り上がった子は ignored ノードの depth を消費しない (親と同じ depth)
    expect(result.map((n) => n.depth)).toEqual([0, 1, 1]);
  });

  test("aria-hidden 相当のサブツリーは子孫も個別に ignored なので全体がスキップされる", () => {
    const result = flattenAXTree([
      node({
        nodeId: "root",
        ignored: false,
        role: { type: "role", value: "main" },
        childIds: ["ariaHidden", "visible"],
      }),
      node({
        nodeId: "ariaHidden",
        parentId: "root",
        ignored: true,
        role: { type: "role", value: "region" },
        childIds: ["hiddenChild"],
      }),
      node({
        nodeId: "hiddenChild",
        parentId: "ariaHidden",
        ignored: true,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "見えない" },
      }),
      node({
        nodeId: "visible",
        parentId: "root",
        ignored: false,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "見える" },
      }),
    ]);
    expect(result.map((n) => n.name)).toEqual(["", "見える"]);
    expect(result.find((n) => n.name === "見えない")).toBeUndefined();
  });

  test("properties を構造系／状態系の 2 つのバケットへ分離する", () => {
    const result = flattenAXTree([
      node({
        nodeId: "h",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "computedString", value: "概要" },
        properties: [
          { name: "level", value: { type: "integer", value: 2 } },
          { name: "focusable", value: { type: "boolean", value: true } },
          { name: "disabled", value: { type: "boolean", value: false } },
          // 辞書にないキーは捨てる
          { name: "unknownKey", value: { type: "boolean", value: true } },
        ],
      }),
    ]);
    const [only] = result;
    expect(only?.properties).toEqual({ level: 2 });
    expect(only?.state).toEqual({ focusable: true, disabled: false });
    expect(only?.isFocusable).toBe(true);
    expect(only?.speechText).toBe("[見出し2] 概要");
  });

  test("親が存在しない孤児ノード (parentId が無効) はルート扱いになる", () => {
    const result = flattenAXTree([
      node({
        nodeId: "orphan",
        parentId: "ghost",
        ignored: false,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "孤児" },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.depth).toBe(0);
    expect(result[0]?.name).toBe("孤児");
  });

  test("backendDOMNodeId が無いときは 0 にフォールバックする", () => {
    const result = flattenAXTree([
      node({
        nodeId: "1",
        ignored: false,
        role: { type: "role", value: "button" },
        childIds: ["2"],
      }),
      node({
        nodeId: "2",
        parentId: "1",
        ignored: false,
        role: { type: "role", value: "link" },
        backendDOMNodeId: 42,
      }),
    ]);
    expect(result[0]?.backendNodeId).toBe(0);
    expect(result[1]?.backendNodeId).toBe(42);
  });

  test("childIds に同一子が重複していても再訪問しない", () => {
    const result = flattenAXTree([
      node({
        nodeId: "root",
        ignored: false,
        role: { type: "role", value: "main" },
        childIds: ["a", "a"], // 同じ子を 2 回参照
      }),
      node({
        nodeId: "a",
        parentId: "root",
        ignored: false,
        role: { type: "role", value: "button" },
      }),
    ]);
    expect(result).toHaveLength(2);
  });
});
