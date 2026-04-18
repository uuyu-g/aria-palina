import { describe, expect, test } from "vite-plus/test";

import { buildReaderView } from "../reader-view.js";
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

describe("buildReaderView", () => {
  test("ランドマーク未出現のページは暗黙の前置きセクション 1 件にまとまる", () => {
    const nodes: A11yNode[] = [
      make({ role: "heading", depth: 0, name: "タイトル", properties: { level: 1 } }),
      make({ role: "paragraph", depth: 0, name: "本文" }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.landmark).toBeNull();
    expect(sections[0]?.label).toBe("");
    expect(sections[0]?.items.map((i) => i.node.role)).toEqual(["heading", "paragraph"]);
  });

  test("ランドマークごとに独立したセクションへ分割される", () => {
    const nodes: A11yNode[] = [
      make({ role: "banner", depth: 0, name: "ヘッダ" }),
      make({ role: "heading", depth: 1, name: "ロゴ", properties: { level: 1 } }),
      make({ role: "main", depth: 0 }),
      make({ role: "heading", depth: 1, name: "記事", properties: { level: 2 } }),
      make({ role: "contentinfo", depth: 0 }),
      make({ role: "link", depth: 1, name: "プライバシー" }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections.map((s) => s.landmark?.role)).toEqual(["banner", "main", "contentinfo"]);
    expect(sections[0]?.label).toBe("banner「ヘッダ」");
    expect(sections[1]?.label).toBe("main");
    expect(sections[2]?.label).toBe("contentinfo");
  });

  test("セクション内 depth はランドマークの depth を基準に 0 から再採番される", () => {
    const nodes: A11yNode[] = [
      make({ role: "main", depth: 2 }),
      make({ role: "heading", depth: 3, name: "見出し", properties: { level: 2 } }),
      make({ role: "paragraph", depth: 4 }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections[0]?.items.map((i) => [i.node.role, i.depth])).toEqual([
      ["heading", 0],
      ["paragraph", 1],
    ]);
  });

  test("role が none / presentation のノードはアイテムから除外される", () => {
    const nodes: A11yNode[] = [
      make({ role: "main", depth: 0 }),
      make({ role: "presentation", depth: 1 }),
      make({ role: "none", depth: 1 }),
      make({ role: "button", depth: 1, name: "送信" }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections[0]?.items.map((i) => i.node.role)).toEqual(["button"]);
  });

  test("ランドマーク名が付くとラベルに鉤括弧付きで連結される", () => {
    const nodes: A11yNode[] = [make({ role: "navigation", depth: 0, name: "サイドバー" })];

    const sections = buildReaderView(nodes);

    expect(sections[0]?.label).toBe("navigation「サイドバー」");
  });

  test("ランドマーク名が空白のみの場合はロール名だけになる", () => {
    const nodes: A11yNode[] = [make({ role: "region", depth: 0, name: "   " })];

    const sections = buildReaderView(nodes);

    expect(sections[0]?.label).toBe("region");
  });

  test("ネストしたランドマークはフラットに隣接セクションとして扱う", () => {
    const nodes: A11yNode[] = [
      make({ role: "main", depth: 0 }),
      make({ role: "heading", depth: 1, name: "記事" }),
      make({ role: "navigation", depth: 1, name: "目次" }),
      make({ role: "link", depth: 2, name: "概要" }),
      make({ role: "paragraph", depth: 1, name: "本文" }),
    ];

    const sections = buildReaderView(nodes);

    // main → navigation → (main に戻るが暗黙の無名セクション) の 3 つ
    expect(sections.map((s) => s.landmark?.role ?? null)).toEqual(["main", "navigation", null]);
    expect(sections[2]?.items.map((i) => i.node.role)).toEqual(["paragraph"]);
  });

  test("空配列を渡した場合はセクションも 0 件になる", () => {
    expect(buildReaderView([])).toEqual([]);
  });

  test("アイテム 0 件のランドマークもセクションとして残る", () => {
    const nodes: A11yNode[] = [make({ role: "main", depth: 0 })];

    const sections = buildReaderView(nodes);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.landmark?.role).toBe("main");
    expect(sections[0]?.items).toEqual([]);
  });

  test("ReaderItem.node は元の A11yNode 参照をそのまま保持する", () => {
    const heading = make({ role: "heading", depth: 1, name: "タイトル" });
    const nodes: A11yNode[] = [make({ role: "main", depth: 0 }), heading];

    const sections = buildReaderView(nodes);

    expect(sections[0]?.items[0]?.node).toBe(heading);
  });
});
