import { describe, expect, test } from "vite-plus/test";

import type { RawAXNode } from "../ax-protocol.js";
import { flattenAXTree } from "../flatten.js";

/** テスト用に RawAXNode を作る薄いヘルパー。 */
function node(partial: Partial<RawAXNode> & Pick<RawAXNode, "nodeId" | "ignored">): RawAXNode {
  return { ...partial };
}

/**
 * ヘッダー行 + データ行を持つ典型的な <table> の CDP ツリーを組み立てるヘルパー。
 *
 * 構造:
 *   table
 *     row (header)
 *       columnheader "名前"
 *       columnheader "メール"
 *       columnheader "権限"
 *     row (data)
 *       cell "田中太郎"
 *       cell "tanaka@example.com"
 *       cell "管理者"
 */
function buildBasicTableNodes(): RawAXNode[] {
  return [
    node({
      nodeId: "table",
      ignored: false,
      role: { type: "role", value: "table" },
      name: { type: "computedString", value: "ユーザー一覧" },
      childIds: ["hrow", "drow"],
    }),
    node({
      nodeId: "hrow",
      parentId: "table",
      ignored: false,
      role: { type: "role", value: "row" },
      childIds: ["h1", "h2", "h3"],
    }),
    node({
      nodeId: "h1",
      parentId: "hrow",
      ignored: false,
      role: { type: "role", value: "columnheader" },
      name: { type: "computedString", value: "名前" },
    }),
    node({
      nodeId: "h2",
      parentId: "hrow",
      ignored: false,
      role: { type: "role", value: "columnheader" },
      name: { type: "computedString", value: "メール" },
    }),
    node({
      nodeId: "h3",
      parentId: "hrow",
      ignored: false,
      role: { type: "role", value: "columnheader" },
      name: { type: "computedString", value: "権限" },
    }),
    node({
      nodeId: "drow",
      parentId: "table",
      ignored: false,
      role: { type: "role", value: "row" },
      childIds: ["c1", "c2", "c3"],
    }),
    node({
      nodeId: "c1",
      parentId: "drow",
      ignored: false,
      role: { type: "role", value: "cell" },
      name: { type: "computedString", value: "田中太郎" },
    }),
    node({
      nodeId: "c2",
      parentId: "drow",
      ignored: false,
      role: { type: "role", value: "cell" },
      name: { type: "computedString", value: "tanaka@example.com" },
    }),
    node({
      nodeId: "c3",
      parentId: "drow",
      ignored: false,
      role: { type: "role", value: "cell" },
      name: { type: "computedString", value: "管理者" },
    }),
  ];
}

describe("enrichTableContext (via flattenAXTree)", () => {
  test("テーブルノードに行列数が付与される", () => {
    const result = flattenAXTree(buildBasicTableNodes());
    const table = result.find((n) => n.role === "table");
    expect(table?.speechText).toBe("[テーブル 2行×3列] ユーザー一覧");
    expect(table?.properties).toMatchObject({
      tableRowCount: 2,
      tableColCount: 3,
    });
  });

  test("データセルに列位置とヘッダー名が付与される", () => {
    const result = flattenAXTree(buildBasicTableNodes());
    const cells = result.filter((n) => n.role === "cell");
    expect(cells.map((c) => c.speechText)).toEqual([
      "[セル 1/3, 名前] 田中太郎",
      "[セル 2/3, メール] tanaka@example.com",
      "[セル 3/3, 権限] 管理者",
    ]);
  });

  test("列見出しノードに列位置が付与される", () => {
    const result = flattenAXTree(buildBasicTableNodes());
    const headers = result.filter((n) => n.role === "columnheader");
    expect(headers.map((h) => h.speechText)).toEqual([
      "[列見出し 1/3] 名前",
      "[列見出し 2/3] メール",
      "[列見出し 3/3] 権限",
    ]);
  });

  test("セルの properties に行位置・列位置の両方が格納される", () => {
    const result = flattenAXTree(buildBasicTableNodes());
    const cell = result.find((n) => n.name === "管理者");
    expect(cell?.properties).toMatchObject({
      tableRowIndex: 2,
      tableRowCount: 2,
      tableColIndex: 3,
      tableColCount: 3,
      tableColumnHeader: "権限",
    });
  });

  test("ヘッダー行が無いテーブルでは位置のみ付与されヘッダー名は付かない", () => {
    const nodes = [
      node({
        nodeId: "table",
        ignored: false,
        role: { type: "role", value: "table" },
        childIds: ["row1"],
      }),
      node({
        nodeId: "row1",
        parentId: "table",
        ignored: false,
        role: { type: "role", value: "row" },
        childIds: ["c1", "c2"],
      }),
      node({
        nodeId: "c1",
        parentId: "row1",
        ignored: false,
        role: { type: "role", value: "cell" },
        name: { type: "computedString", value: "A" },
      }),
      node({
        nodeId: "c2",
        parentId: "row1",
        ignored: false,
        role: { type: "role", value: "cell" },
        name: { type: "computedString", value: "B" },
      }),
    ];
    const result = flattenAXTree(nodes);
    const cells = result.filter((n) => n.role === "cell");
    expect(cells.map((c) => c.speechText)).toEqual(["[セル 1/2] A", "[セル 2/2] B"]);
    expect(cells[0]?.properties).not.toHaveProperty("tableColumnHeader");
  });

  test("テーブルの外のノードは影響を受けない", () => {
    const nodes = [
      node({
        nodeId: "heading",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "computedString", value: "タイトル" },
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        childIds: [],
      }),
      ...buildBasicTableNodes().map((n) =>
        n.nodeId === "table" ? node({ ...n, parentId: undefined }) : n,
      ),
      node({
        nodeId: "btn",
        ignored: false,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "送信" },
      }),
    ];
    // heading の親が無いため root 扱いにする
    const result = flattenAXTree(nodes);
    const heading = result.find((n) => n.role === "heading");
    const button = result.find((n) => n.role === "button");
    expect(heading?.speechText).toBe("[見出し1] タイトル");
    expect(button?.speechText).toBe("[ボタン] 送信");
  });

  test("grid / gridcell でもテーブルコンテキストが解決される", () => {
    const nodes = [
      node({
        nodeId: "grid",
        ignored: false,
        role: { type: "role", value: "grid" },
        childIds: ["grow"],
      }),
      node({
        nodeId: "grow",
        parentId: "grid",
        ignored: false,
        role: { type: "role", value: "row" },
        childIds: ["gc1", "gc2"],
      }),
      node({
        nodeId: "gc1",
        parentId: "grow",
        ignored: false,
        role: { type: "role", value: "gridcell" },
        name: { type: "computedString", value: "A1" },
      }),
      node({
        nodeId: "gc2",
        parentId: "grow",
        ignored: false,
        role: { type: "role", value: "gridcell" },
        name: { type: "computedString", value: "B1" },
      }),
    ];
    const result = flattenAXTree(nodes);
    expect(result[0]?.speechText).toBe("[グリッド 1行×2列]");
    expect(result[2]?.speechText).toBe("[グリッドセル 1/2] A1");
    expect(result[3]?.speechText).toBe("[グリッドセル 2/2] B1");
  });

  test("複数行のデータテーブルで各行のセルに正しい行位置が付与される", () => {
    const nodes = [
      node({
        nodeId: "table",
        ignored: false,
        role: { type: "role", value: "table" },
        childIds: ["hrow", "r1", "r2"],
      }),
      node({
        nodeId: "hrow",
        parentId: "table",
        ignored: false,
        role: { type: "role", value: "row" },
        childIds: ["h1"],
      }),
      node({
        nodeId: "h1",
        parentId: "hrow",
        ignored: false,
        role: { type: "role", value: "columnheader" },
        name: { type: "computedString", value: "名前" },
      }),
      node({
        nodeId: "r1",
        parentId: "table",
        ignored: false,
        role: { type: "role", value: "row" },
        childIds: ["c1"],
      }),
      node({
        nodeId: "c1",
        parentId: "r1",
        ignored: false,
        role: { type: "role", value: "cell" },
        name: { type: "computedString", value: "田中" },
      }),
      node({
        nodeId: "r2",
        parentId: "table",
        ignored: false,
        role: { type: "role", value: "row" },
        childIds: ["c2"],
      }),
      node({
        nodeId: "c2",
        parentId: "r2",
        ignored: false,
        role: { type: "role", value: "cell" },
        name: { type: "computedString", value: "佐藤" },
      }),
    ];
    const result = flattenAXTree(nodes);
    const cells = result.filter((n) => n.role === "cell");
    expect(cells[0]?.properties).toMatchObject({ tableRowIndex: 2 });
    expect(cells[1]?.properties).toMatchObject({ tableRowIndex: 3 });
    expect(cells[0]?.speechText).toBe("[セル 1/1, 名前] 田中");
    expect(cells[1]?.speechText).toBe("[セル 1/1, 名前] 佐藤");
  });
});
