import { describe, expect, test } from "vite-plus/test";

import { findNext, matchesKind } from "../node-kind.js";
import type { A11yNode } from "../types.js";

function makeNode(partial: Partial<A11yNode> & Pick<A11yNode, "role">): A11yNode {
  return {
    backendNodeId: 0,
    name: "",
    depth: 0,
    properties: {},
    state: {},
    speechText: "",
    isFocusable: false,
    isIgnored: false,
    ...partial,
  };
}

describe("matchesKind", () => {
  test("isFocusable=true かつ disabled でないノードは interactive に一致する", () => {
    const node = makeNode({ role: "button", isFocusable: true });
    expect(matchesKind(node, "interactive")).toBe(true);
  });

  test("isFocusable=false のノードは interactive に一致しない", () => {
    const node = makeNode({ role: "button", isFocusable: false });
    expect(matchesKind(node, "interactive")).toBe(false);
  });

  test("disabled=true のフォーカス可能要素は interactive から除外される", () => {
    const node = makeNode({ role: "button", isFocusable: true, state: { disabled: true } });
    expect(matchesKind(node, "interactive")).toBe(false);
  });

  test("role=heading のみが heading に一致する", () => {
    expect(matchesKind(makeNode({ role: "heading" }), "heading")).toBe(true);
    expect(matchesKind(makeNode({ role: "button" }), "heading")).toBe(false);
  });

  test("main / navigation / banner 等の ARIA ランドマーク roles は landmark に一致する", () => {
    for (const role of [
      "main",
      "navigation",
      "banner",
      "contentinfo",
      "complementary",
      "region",
      "search",
      "form",
    ]) {
      expect(matchesKind(makeNode({ role }), "landmark")).toBe(true);
    }
  });

  test("article や section は landmark に一致しない", () => {
    expect(matchesKind(makeNode({ role: "article" }), "landmark")).toBe(false);
    expect(matchesKind(makeNode({ role: "generic" }), "landmark")).toBe(false);
  });
});

describe("findNext", () => {
  const nodes: A11yNode[] = [
    makeNode({ role: "main" }),
    makeNode({ role: "heading" }),
    makeNode({ role: "button", isFocusable: true }),
    makeNode({ role: "link", isFocusable: true, state: { disabled: true } }),
    makeNode({ role: "heading" }),
    makeNode({ role: "navigation" }),
    makeNode({ role: "button", isFocusable: true }),
  ];

  test("順方向で次のインタラクティブ要素のインデックスを返す", () => {
    expect(findNext(nodes, 0, "interactive", 1)).toBe(2);
  });

  test("逆方向で前のインタラクティブ要素のインデックスを返す", () => {
    expect(findNext(nodes, 6, "interactive", -1)).toBe(2);
  });

  test("disabled のフォーカス可能要素は順方向走査でスキップされる", () => {
    expect(findNext(nodes, 2, "interactive", 1)).toBe(6);
  });

  test("from 自身は候補に含めず必ず次の位置から走査を始める", () => {
    expect(findNext(nodes, 1, "heading", 1)).toBe(4);
  });

  test("末尾より先に該当要素が無ければ -1 を返す", () => {
    expect(findNext(nodes, 6, "interactive", 1)).toBe(-1);
  });

  test("先頭より前に該当要素が無ければ -1 を返す", () => {
    expect(findNext(nodes, 0, "landmark", -1)).toBe(-1);
  });

  test("landmark 種別で順方向に main → navigation を拾う", () => {
    expect(findNext(nodes, -1, "landmark", 1)).toBe(0);
    expect(findNext(nodes, 0, "landmark", 1)).toBe(5);
  });

  test("空配列に対しては常に -1 を返す", () => {
    expect(findNext([], 0, "heading", 1)).toBe(-1);
  });
});
