import type { A11yNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import { render } from "ink-testing-library";
import { ReaderList } from "../tui/components/ReaderList.js";
import { toReaderRows } from "../tui/reader-rows.js";

function node(partial: Partial<A11yNode> & { role: string; depth: number }): A11yNode {
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

function sectionedNodes(): A11yNode[] {
  return [
    node({ backendNodeId: 1, role: "banner", depth: 0, speechText: "[banner]" }),
    node({
      backendNodeId: 2,
      role: "heading",
      depth: 1,
      name: "ロゴ",
      properties: { level: 1 },
      speechText: "[heading1] ロゴ",
    }),
    node({ backendNodeId: 3, role: "main", depth: 0, speechText: "[main]" }),
    node({
      backendNodeId: 4,
      role: "heading",
      depth: 1,
      name: "記事",
      properties: { level: 2 },
      speechText: "[heading2] 記事",
    }),
    node({
      backendNodeId: 5,
      role: "paragraph",
      depth: 2,
      name: "本文",
      speechText: "[paragraph] 本文",
    }),
  ];
}

describe("toReaderRows", () => {
  test("ランドマークごとに separator 行が挿入される", () => {
    const { rows } = toReaderRows(sectionedNodes());
    expect(rows.map((r) => r.kind)).toEqual(["separator", "node", "separator", "node", "node"]);
    const [first, , third] = rows;
    expect(first?.kind === "separator" && first.label).toBe("banner");
    expect(third?.kind === "separator" && third.label).toBe("main");
  });

  test("nodeIndexToRow はアイテムだけでなくランドマーク自身も登録する", () => {
    const nodes = sectionedNodes();
    const { nodeIndexToRow } = toReaderRows(nodes);
    // nodes[0] = banner ランドマーク → row index 0 (separator 自身)
    expect(nodeIndexToRow.get(0)).toBe(0);
    // nodes[1] = ロゴ heading → row index 1 (banner separator の次)
    expect(nodeIndexToRow.get(1)).toBe(1);
    // nodes[2] = main ランドマーク → row index 2 (2 つ目の separator)
    expect(nodeIndexToRow.get(2)).toBe(2);
    // nodes[4] = paragraph 本文 → row index 4
    expect(nodeIndexToRow.get(4)).toBe(4);
  });

  test("separator 行は自分のランドマーク A11yNode インデックスを nodeIndex として持つ", () => {
    const nodes = sectionedNodes();
    const { rows } = toReaderRows(nodes);
    const bannerSep = rows[0];
    const mainSep = rows[2];
    expect(bannerSep?.kind === "separator" && bannerSep.nodeIndex).toBe(0);
    expect(mainSep?.kind === "separator" && mainSep.nodeIndex).toBe(2);
  });

  test("ノード行の indent はランドマーク段数 +1 + セクション内 depth の合算になる", () => {
    const { rows } = toReaderRows(sectionedNodes());
    const paragraph = rows.find((r) => r.kind === "node" && r.node.name === "本文");
    // main (depth=0) の配下で item.depth=1 → indent = 0+1+1 = 2
    expect(paragraph?.kind === "node" && paragraph.indent).toBe(2);
  });

  test("ネストしたランドマーク行の indent は入れ子段数を反映する", () => {
    // banner > navigation > link
    const nested: A11yNode[] = [
      node({ backendNodeId: 1, role: "banner", depth: 0, speechText: "[banner]" }),
      node({
        backendNodeId: 2,
        role: "navigation",
        depth: 1,
        name: "グローバル",
        speechText: "[navigation] グローバル",
      }),
      node({
        backendNodeId: 3,
        role: "link",
        depth: 2,
        name: "概要",
        speechText: "[link] 概要",
      }),
    ];
    const { rows } = toReaderRows(nested);
    const bannerSep = rows[0];
    const navSep = rows[1];
    const link = rows[2];
    expect(bannerSep?.kind === "separator" && bannerSep.indent).toBe(0);
    expect(navSep?.kind === "separator" && navSep.indent).toBe(1);
    expect(link?.kind === "node" && link.indent).toBe(2);
  });
});

describe("ReaderList", () => {
  test("ランドマーク罫線が `── {label} ──` 形式で描画される", () => {
    const { lastFrame, unmount } = render(
      <ReaderList nodes={sectionedNodes()} cursor={1} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("── banner ──");
    expect(frame).toContain("── main ──");
    unmount();
  });

  test("カーソルは A11yNode インデックスで指定され、該当ノードに > が付く", () => {
    const { lastFrame, unmount } = render(
      <ReaderList nodes={sectionedNodes()} cursor={4} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    const selectedLines = frame.split("\n").filter((l) => l.includes("> "));
    expect(selectedLines.length).toBe(1);
    expect(selectedLines[0]).toContain("本文");
    unmount();
  });

  test("カーソルがランドマーク位置にあるときは separator 行が選択強調される", () => {
    // sectionedNodes の nodes[2] は main ランドマーク
    const { lastFrame, unmount } = render(
      <ReaderList nodes={sectionedNodes()} cursor={2} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    const selectedLines = frame.split("\n").filter((l) => l.includes("> "));
    expect(selectedLines.length).toBe(1);
    expect(selectedLines[0]).toContain("main");
    expect(selectedLines[0]).toContain("──");
    unmount();
  });

  test("ランドマーク未出現のページでは separator が挟まれない", () => {
    const plain: A11yNode[] = [
      node({
        backendNodeId: 1,
        role: "heading",
        depth: 0,
        name: "タイトル",
        speechText: "[heading1] タイトル",
      }),
      node({
        backendNodeId: 2,
        role: "button",
        depth: 0,
        name: "送信",
        speechText: "[button] 送信",
      }),
    ];
    const { lastFrame, unmount } = render(<ReaderList nodes={plain} cursor={0} viewport={10} />);
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("──");
    expect(frame).toContain("タイトル");
    expect(frame).toContain("送信");
    unmount();
  });

  test("ノード 0 件のとき空メッセージを表示する", () => {
    const { lastFrame, unmount } = render(<ReaderList nodes={[]} cursor={0} viewport={5} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("表示するノードがありません");
    unmount();
  });

  test("ネストしたランドマークは罫線もアイテムも段階的にインデントされる", () => {
    const nested: A11yNode[] = [
      node({ backendNodeId: 1, role: "banner", depth: 0, speechText: "[banner]" }),
      node({
        backendNodeId: 2,
        role: "link",
        depth: 1,
        name: "ホーム",
        speechText: "[link] ホーム",
      }),
      node({
        backendNodeId: 3,
        role: "navigation",
        depth: 1,
        name: "グローバル",
        speechText: "[navigation] グローバル",
      }),
      node({
        backendNodeId: 4,
        role: "link",
        depth: 2,
        name: "概要",
        speechText: "[link] 概要",
      }),
    ];
    // cursor=1 (ホーム) を指す。banner/navigation の separator は非選択のまま
    const { lastFrame, unmount } = render(<ReaderList nodes={nested} cursor={1} viewport={20} />);
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    // banner 罫線 (indent=0, 非選択のため "  " プレフィクス付き)
    expect(lines[0]).toBe("  ── banner ──");
    // ホーム (選択中) = NodeRow プレフィクス "> " + indent 1 段 ("  ") + speechText
    expect(lines[1]).toBe(">   [link] ホーム");
    // navigation 罫線 (indent=1, 非選択) → "  " プレフィクス + indent 1 段 + 罫線
    expect(lines[2]).toBe("    ── navigation「グローバル」 ──");
    // 概要 (非選択) = NodeRow プレフィクス "  " + indent 2 段 ("    ") + speechText
    expect(lines[3]).toBe("      [link] 概要");
    unmount();
  });

  test("内側ランドマークが外側の途中に挟まると、外側の続きは見出しなしでインライン描画される", () => {
    // <main><p>intro</p><nav>...<a>Overview</a></nav><p>after-nav</p></main>
    const inlineNested: A11yNode[] = [
      node({ backendNodeId: 1, role: "main", depth: 0, speechText: "[main]" }),
      node({
        backendNodeId: 2,
        role: "paragraph",
        depth: 1,
        name: "intro",
        speechText: "[paragraph] intro",
      }),
      node({
        backendNodeId: 3,
        role: "navigation",
        depth: 1,
        name: "User profile",
        speechText: "[navigation] User profile",
      }),
      node({
        backendNodeId: 4,
        role: "link",
        depth: 2,
        name: "Overview",
        speechText: "[link] Overview",
      }),
      node({
        backendNodeId: 5,
        role: "paragraph",
        depth: 1,
        name: "after-nav",
        speechText: "[paragraph] after-nav",
      }),
    ];
    // cursor=0 で main 見出し選択。after-nav は main 継続セクションの items として
    // インラインで navigation の後に出ることを確認する。
    const { lastFrame, unmount } = render(
      <ReaderList nodes={inlineNested} cursor={0} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n").filter((l) => l.length > 0);
    // 期待される並び:
    // > ── main ──
    //   [paragraph] intro
    //   ── navigation「User profile」 ──
    //   [link] Overview
    //   [paragraph] after-nav   ← 継続セクションの item (見出し再描画なし)
    expect(lines[0]).toContain("── main ──");
    expect(lines[1]).toContain("[paragraph] intro");
    expect(lines[2]).toContain("── navigation「User profile」 ──");
    expect(lines[3]).toContain("[link] Overview");
    expect(lines[4]).toContain("[paragraph] after-nav");
    // main の見出し行は 1 度しか出ない (継続セクションで再描画されない)
    const mainHeaderLines = lines.filter((l) => l.includes("── main ──"));
    expect(mainHeaderLines.length).toBe(1);
    unmount();
  });

  test("viewport がセクション行数より小さいとき separator+カーソル周辺のみ描画される", () => {
    const { lastFrame, unmount } = render(
      <ReaderList nodes={sectionedNodes()} cursor={4} viewport={3} />,
    );
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    // カーソル位置の paragraph は必ず可視範囲に含まれる
    expect(frame).toContain("本文");
    unmount();
  });
});
