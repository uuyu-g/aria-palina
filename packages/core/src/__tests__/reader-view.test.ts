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
    expect(sections[0]?.depth).toBe(0);
    expect(sections[0]?.items.map((i) => i.node.role)).toEqual(["heading", "paragraph"]);
  });

  test("兄弟ランドマークは全て depth=0 のフラットなセクションになる", () => {
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
    expect(sections.map((s) => s.depth)).toEqual([0, 0, 0]);
    expect(sections[0]?.label).toBe("banner「ヘッダ」");
  });

  test("ネストしたランドマークは親子関係が section.depth で保持される", () => {
    // <banner>
    //   <a>ホーム</a>
    //   <nav aria-label="グローバル">
    //     <a>概要</a>
    //   </nav>
    // </banner>
    // <main>...</main>
    const nodes: A11yNode[] = [
      make({ role: "banner", depth: 0 }),
      make({ role: "link", depth: 1, name: "ホーム" }),
      make({ role: "navigation", depth: 1, name: "グローバル" }),
      make({ role: "link", depth: 2, name: "概要" }),
      make({ role: "main", depth: 0 }),
      make({ role: "heading", depth: 1, name: "記事" }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections.map((s) => [s.landmark?.role, s.depth])).toEqual([
      ["banner", 0],
      ["navigation", 1],
      ["main", 0],
    ]);
    // banner の直下アイテムはホームだけ (navigation は別セクションへ分離)
    expect(sections[0]?.items.map((i) => i.node.name)).toEqual(["ホーム"]);
    // navigation 配下は概要だけ
    expect(sections[1]?.items.map((i) => i.node.name)).toEqual(["概要"]);
    // main 配下は記事
    expect(sections[2]?.items.map((i) => i.node.name)).toEqual(["記事"]);
  });

  test("ネスト配下の ReaderItem.depth は最も内側のランドマーク基準で再採番される", () => {
    // <banner depth=0>
    //   <nav depth=1>
    //     <ul depth=2>
    //       <li depth=3>概要</li>
    //     </ul>
    //   </nav>
    // </banner>
    const nodes: A11yNode[] = [
      make({ role: "banner", depth: 0 }),
      make({ role: "navigation", depth: 1 }),
      make({ role: "list", depth: 2 }),
      make({ role: "listitem", depth: 3, name: "概要" }),
    ];

    const sections = buildReaderView(nodes);

    // navigation (depth=1) の配下アイテムは nav.depth+1=2 を基準に 0 から採番
    expect(sections[1]?.items.map((i) => [i.node.role, i.depth])).toEqual([
      ["list", 0],
      ["listitem", 1],
    ]);
  });

  test("ネストしたランドマークから外側へ戻ると、内側セクションは閉じられる", () => {
    // <banner depth=0>
    //   <nav depth=1><a>概要</a></nav>
    //   <p>ヘッダ注記</p>  ← nav を抜けて banner 直下に戻る
    // </banner>
    // <main>...</main>
    const nodes: A11yNode[] = [
      make({ role: "banner", depth: 0 }),
      make({ role: "navigation", depth: 1 }),
      make({ role: "link", depth: 2, name: "概要" }),
      make({ role: "paragraph", depth: 1, name: "ヘッダ注記" }),
      make({ role: "main", depth: 0 }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections.map((s) => s.landmark?.role)).toEqual(["banner", "navigation", "main"]);
    // ヘッダ注記は navigation を抜けた後の banner 配下に積まれる
    expect(sections[0]?.items.map((i) => i.node.name)).toEqual(["ヘッダ注記"]);
    expect(sections[1]?.items.map((i) => i.node.name)).toEqual(["概要"]);
  });

  test("全ランドマークを抜けた後のノードは新しい暗黙セクションに積まれる", () => {
    const nodes: A11yNode[] = [
      make({ role: "main", depth: 0 }),
      make({ role: "heading", depth: 1, name: "記事" }),
      make({ role: "paragraph", depth: 0, name: "後書き" }),
    ];

    const sections = buildReaderView(nodes);

    expect(sections.map((s) => s.landmark?.role ?? null)).toEqual(["main", null]);
    expect(sections[1]?.depth).toBe(0);
    expect(sections[1]?.items.map((i) => i.node.name)).toEqual(["後書き"]);
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

  test("暗黙セクション内で後から浅い depth のノードが来ても相対 depth が再シフトされる", () => {
    const nodes: A11yNode[] = [
      make({ role: "paragraph", depth: 2, name: "深い" }),
      make({ role: "paragraph", depth: 0, name: "浅い" }),
    ];
    const sections = buildReaderView(nodes);
    // 浅い方を 0 に合わせて、深いノードは 2 として相対化される
    expect(sections[0]?.items.map((i) => [i.node.name, i.depth])).toEqual([
      ["深い", 2],
      ["浅い", 0],
    ]);
  });
});
