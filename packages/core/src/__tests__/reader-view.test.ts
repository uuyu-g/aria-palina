import { describe, expect, test } from "vite-plus/test";

import { LANDMARK_ROLES, readerBaseDepth, readerSectionLabel } from "../reader-view.js";
import type { A11yNode } from "../types.js";

function make(partial: Partial<A11yNode> & { role: string; depth: number }): A11yNode {
  return {
    backendNodeId: 0,
    name: "",
    properties: {},
    state: {},
    speechText: `[${partial.role}]`,
    isFocusable: false,
    isIgnored: false,
    ...partial,
  };
}

describe("LANDMARK_ROLES", () => {
  test("ARIA 1.2 で定義されたランドマーク 8 種を含む", () => {
    expect(Array.from(LANDMARK_ROLES).sort()).toEqual([
      "banner",
      "complementary",
      "contentinfo",
      "form",
      "main",
      "navigation",
      "region",
      "search",
    ]);
  });
});

describe("readerSectionLabel", () => {
  test("name が空ならロール名だけを返す", () => {
    const node = make({ role: "main", depth: 0 });
    expect(readerSectionLabel(node)).toBe("main");
  });

  test("name があるとロール名と鉤括弧付き name を連結する", () => {
    const node = make({ role: "navigation", depth: 0, name: "サイドバー" });
    expect(readerSectionLabel(node)).toBe("navigation「サイドバー」");
  });

  test("name が空白のみの場合はロール名だけを返す", () => {
    const node = make({ role: "region", depth: 0, name: "   " });
    expect(readerSectionLabel(node)).toBe("region");
  });
});

describe("readerBaseDepth", () => {
  test("空配列のときは 0 を返す", () => {
    expect(readerBaseDepth([])).toBe(0);
  });

  test("最小 depth を返す", () => {
    const nodes: A11yNode[] = [
      make({ role: "RootWebArea", depth: 0 }),
      make({ role: "main", depth: 1 }),
      make({ role: "heading", depth: 2 }),
    ];
    expect(readerBaseDepth(nodes)).toBe(0);
  });

  test("全体が depth > 0 から始まる場合は浅い方を 0 扱いにできるようにする", () => {
    const nodes: A11yNode[] = [
      make({ role: "main", depth: 2 }),
      make({ role: "heading", depth: 3 }),
    ];
    expect(readerBaseDepth(nodes)).toBe(2);
  });
});
