import { describe, expect, test } from "vite-plus/test";

import type { RawAXNode } from "../ax-protocol.js";
import { flattenAXTree } from "../flatten.js";

/** テスト用に RawAXNode を作る薄いヘルパー。 */
function node(partial: Partial<RawAXNode> & Pick<RawAXNode, "nodeId" | "ignored">): RawAXNode {
  return { ...partial };
}

describe("flattenAXTree", () => {
  test("single root node is returned with depth 0", () => {
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

  test("assigns increasing depth through nested childIds", () => {
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

  test("skips ignored nodes and their entire subtree", () => {
    const result = flattenAXTree([
      node({
        nodeId: "root",
        ignored: false,
        role: { type: "role", value: "main" },
        childIds: ["hidden", "visible"],
      }),
      node({
        nodeId: "hidden",
        parentId: "root",
        ignored: true,
        role: { type: "role", value: "region" },
        childIds: ["hiddenChild"],
      }),
      node({
        nodeId: "hiddenChild",
        parentId: "hidden",
        ignored: false,
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
    // ignored ノードの子孫は配列に現れない。
    expect(result.find((n) => n.name === "見えない")).toBeUndefined();
  });

  test("partitions properties into structural vs state buckets", () => {
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

  test("orphan nodes (parentId pointing nowhere) are treated as roots", () => {
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

  test("backendDOMNodeId falls back to 0 when absent", () => {
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

  test("does not revisit duplicated child references", () => {
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
