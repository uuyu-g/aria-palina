import type { A11yNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import { render } from "ink-testing-library";
import { ReaderList } from "../tui/components/ReaderList.js";

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

describe("ReaderList", () => {
  test("ランドマーク行は `── label ──` 罫線として描画される", () => {
    const { lastFrame, unmount } = render(
      <ReaderList nodes={sectionedNodes()} cursor={1} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("── banner ──");
    expect(frame).toContain("── main ──");
    unmount();
  });

  test("通常ノードにカーソルが乗ると > プレフィクスで選択強調される", () => {
    const { lastFrame, unmount } = render(
      <ReaderList nodes={sectionedNodes()} cursor={4} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    const selectedLines = frame.split("\n").filter((l) => l.includes("> "));
    expect(selectedLines.length).toBe(1);
    expect(selectedLines[0]).toContain("本文");
    unmount();
  });

  test("ランドマーク行にカーソルが乗ると罫線行が選択強調される", () => {
    // nodes[2] は main ランドマーク
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

  test("ランドマーク未出現のページでは罫線が出ない", () => {
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

  test("readerBaseDepth で RootWebArea ぶんのインデントが詰められる", () => {
    // depth=2 から始まるケースでも rendering depth は 0 に寄せられる
    const nodes: A11yNode[] = [
      node({
        backendNodeId: 1,
        role: "main",
        depth: 2,
        speechText: "[main]",
      }),
      node({
        backendNodeId: 2,
        role: "heading",
        depth: 3,
        name: "タイトル",
        speechText: "[heading1] タイトル",
      }),
    ];
    const { lastFrame, unmount } = render(<ReaderList nodes={nodes} cursor={1} viewport={10} />);
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    // main 罫線: インデント 0
    expect(lines[0]).toBe("  ── main ──");
    // heading: NodeRow の "> " (選択中) + indent 1 段 ("  ") + speechText
    expect(lines[1]).toBe(">   [heading1] タイトル");
    unmount();
  });

  test("外側ランドマークの途中に内側が挟まっても DOM 順がそのまま維持される", () => {
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
    const { lastFrame, unmount } = render(
      <ReaderList nodes={inlineNested} cursor={0} viewport={20} />,
    );
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n").filter((l) => l.length > 0);
    expect(lines[0]).toContain("── main ──");
    expect(lines[1]).toContain("[paragraph] intro");
    expect(lines[2]).toContain("── navigation「User profile」 ──");
    expect(lines[3]).toContain("[link] Overview");
    expect(lines[4]).toContain("[paragraph] after-nav");
    // main の罫線は 1 度だけ
    expect(lines.filter((l) => l.includes("── main ──")).length).toBe(1);
    unmount();
  });

  test("viewport がノード数より小さいとき cursor 周辺のみ描画される", () => {
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
