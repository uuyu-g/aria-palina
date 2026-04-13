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

  describe("ノイズフィルタリング", () => {
    test("InlineTextBox ロールのノードはデフォルトで除外される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "btn",
          ignored: false,
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "送信" },
          childIds: ["txt", "itb"],
        }),
        node({
          nodeId: "txt",
          parentId: "btn",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "送信" },
          childIds: ["itb"],
        }),
        node({
          nodeId: "itb",
          parentId: "txt",
          ignored: false,
          role: { type: "role", value: "InlineTextBox" },
          name: { type: "computedString", value: "送信" },
        }),
      ]);
      expect(result.map((n) => n.role)).toEqual(["button"]);
    });

    test("ListMarker ロールのノードはデフォルトで除外される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "list",
          ignored: false,
          role: { type: "role", value: "list" },
          childIds: ["item"],
        }),
        node({
          nodeId: "item",
          ignored: false,
          parentId: "list",
          role: { type: "role", value: "listitem" },
          name: { type: "computedString", value: "項目" },
          childIds: ["marker"],
        }),
        node({
          nodeId: "marker",
          parentId: "item",
          ignored: false,
          role: { type: "role", value: "ListMarker" },
          name: { type: "computedString", value: "• " },
        }),
      ]);
      expect(result.map((n) => n.role)).toEqual(["list", "listitem"]);
    });

    test("StaticText は親の name と同一テキストの場合のみ除外される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "link",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "ホーム" },
          childIds: ["dup", "extra"],
        }),
        node({
          nodeId: "dup",
          parentId: "link",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "ホーム" }, // 親と同じ → 除外
        }),
        node({
          nodeId: "extra",
          parentId: "link",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "（新着）" }, // 親と違う → 残る
        }),
      ]);
      expect(result.map((n) => n.role)).toEqual(["link", "StaticText"]);
      expect(result.map((n) => n.name)).toEqual(["ホーム", "（新着）"]);
    });

    test("filter: false を指定すると全ノードがそのまま出力される", () => {
      const result = flattenAXTree(
        [
          node({
            nodeId: "heading",
            ignored: false,
            role: { type: "role", value: "heading" },
            name: { type: "computedString", value: "タイトル" },
            childIds: ["st", "itb"],
          }),
          node({
            nodeId: "st",
            parentId: "heading",
            ignored: false,
            role: { type: "role", value: "StaticText" },
            name: { type: "computedString", value: "タイトル" },
            childIds: ["itb"],
          }),
          node({
            nodeId: "itb",
            parentId: "st",
            ignored: false,
            role: { type: "role", value: "InlineTextBox" },
            name: { type: "computedString", value: "タイトル" },
          }),
        ],
        { filter: false },
      );
      expect(result.map((n) => n.role)).toEqual(["heading", "StaticText", "InlineTextBox"]);
    });

    test("見出し・リンク・ボタンの典型的なツリーがクリーンに出力される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "h1",
          ignored: false,
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "aria-palina テスト" },
          childIds: ["h1-st"],
          properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        }),
        node({
          nodeId: "h1-st",
          parentId: "h1",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "aria-palina テスト" },
          childIds: ["h1-itb"],
        }),
        node({
          nodeId: "h1-itb",
          parentId: "h1-st",
          ignored: false,
          role: { type: "role", value: "InlineTextBox" },
          name: { type: "computedString", value: "aria-palina テスト" },
        }),
        node({
          nodeId: "link",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "ホーム" },
          childIds: ["link-st"],
        }),
        node({
          nodeId: "link-st",
          parentId: "link",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "ホーム" },
          childIds: ["link-itb"],
        }),
        node({
          nodeId: "link-itb",
          parentId: "link-st",
          ignored: false,
          role: { type: "role", value: "InlineTextBox" },
          name: { type: "computedString", value: "ホーム" },
        }),
        node({
          nodeId: "btn",
          ignored: false,
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "送信" },
          childIds: ["btn-st"],
        }),
        node({
          nodeId: "btn-st",
          parentId: "btn",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "送信" },
          childIds: ["btn-itb"],
        }),
        node({
          nodeId: "btn-itb",
          parentId: "btn-st",
          ignored: false,
          role: { type: "role", value: "InlineTextBox" },
          name: { type: "computedString", value: "送信" },
        }),
      ]);
      // 冗長な StaticText / InlineTextBox がすべて除去される
      expect(result.map((n) => n.speechText)).toEqual([
        "[見出し1] aria-palina テスト",
        "[リンク] ホーム",
        "[ボタン] 送信",
      ]);
    });

    test("空文字の StaticText は空白ノイズとして除外される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "p",
          ignored: false,
          role: { type: "role", value: "paragraph" },
          name: { type: "computedString", value: "" },
          childIds: ["st"],
        }),
        node({
          nodeId: "st",
          parentId: "p",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "" },
        }),
      ]);
      // 空の StaticText は読み上げ内容がないため除外
      expect(result).toHaveLength(1);
    });

    test("空白のみの StaticText は除外される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "nav",
          ignored: false,
          role: { type: "role", value: "navigation" },
          name: { type: "computedString", value: "メイン" },
          childIds: ["link1", "ws", "link2"],
        }),
        node({
          nodeId: "link1",
          parentId: "nav",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "ホーム" },
        }),
        node({
          nodeId: "ws",
          parentId: "nav",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "  " },
        }),
        node({
          nodeId: "link2",
          parentId: "nav",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "製品" },
        }),
      ]);
      expect(result.map((n) => n.speechText)).toEqual([
        "[ナビゲーション] メイン",
        "[リンク] ホーム",
        "[リンク] 製品",
      ]);
    });

    test("名前なし generic は透過的に子を辿る", () => {
      const result = flattenAXTree([
        node({
          nodeId: "main",
          ignored: false,
          role: { type: "role", value: "main" },
          name: { type: "computedString", value: "" },
          childIds: ["div"],
        }),
        node({
          nodeId: "div",
          parentId: "main",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["btn"],
        }),
        node({
          nodeId: "btn",
          parentId: "div",
          ignored: false,
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "送信" },
        }),
      ]);
      // generic は透過的: 出力されず、子 (button) は main の depth + 1 になる
      expect(result).toHaveLength(2);
      expect(result[0]!.speechText).toBe("[メイン]");
      expect(result[1]!.speechText).toBe("[ボタン] 送信");
      expect(result[1]!.depth).toBe(1);
    });

    test("名前付き generic はグループとして表示される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
          name: { type: "computedString", value: "" },
          childIds: ["div"],
        }),
        node({
          nodeId: "div",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "セクション" },
          childIds: ["btn"],
        }),
        node({
          nodeId: "btn",
          parentId: "div",
          ignored: false,
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "送信" },
        }),
      ]);
      // 名前付き generic はグループとして出力される
      expect(result).toHaveLength(3);
      expect(result[1]!.speechText).toBe("[グループ] セクション");
      expect(result[1]!.depth).toBe(1);
      expect(result[2]!.depth).toBe(2);
    });

    test("rowgroup は透過的に子を辿る", () => {
      const result = flattenAXTree([
        node({
          nodeId: "table",
          ignored: false,
          role: { type: "role", value: "table" },
          name: { type: "computedString", value: "" },
          childIds: ["rg"],
        }),
        node({
          nodeId: "rg",
          parentId: "table",
          ignored: false,
          role: { type: "role", value: "rowgroup" },
          name: { type: "computedString", value: "" },
          childIds: ["row"],
        }),
        node({
          nodeId: "row",
          parentId: "rg",
          ignored: false,
          role: { type: "role", value: "row" },
          name: { type: "computedString", value: "" },
          childIds: ["cell"],
        }),
        node({
          nodeId: "cell",
          parentId: "row",
          ignored: false,
          role: { type: "role", value: "cell" },
          name: { type: "computedString", value: "値" },
        }),
      ]);
      // rowgroup は透過的: table → row → cell の depth が連続する
      expect(result.map((n) => [n.role, n.depth])).toEqual([
        ["table", 0],
        ["row", 1],
        ["cell", 2],
      ]);
    });
  });
});
