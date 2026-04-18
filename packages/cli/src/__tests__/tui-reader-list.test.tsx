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

  test("nodeIndexToRow は A11yNode インデックス → row インデックスを返す", () => {
    const nodes = sectionedNodes();
    const { nodeIndexToRow } = toReaderRows(nodes);
    // nodes[1] = ロゴ heading → row index 1 (banner separator の次)
    expect(nodeIndexToRow.get(1)).toBe(1);
    // nodes[2] = main ランドマーク → 除外 (アイテムではない)
    expect(nodeIndexToRow.has(2)).toBe(false);
    // nodes[4] = paragraph 本文 → row index 4
    expect(nodeIndexToRow.get(4)).toBe(4);
  });

  test("ReaderItem.depth はランドマーク基準で再採番される", () => {
    const { rows } = toReaderRows(sectionedNodes());
    const paragraph = rows.find((r) => r.kind === "node" && r.node.name === "本文");
    expect(paragraph?.kind === "node" && paragraph.depth).toBe(1);
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
