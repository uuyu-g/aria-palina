import { describe, expect, test } from "vite-plus/test";
import { render } from "ink-testing-library";
import { VirtualList } from "../tui/components/VirtualList.js";
import { makeNodes } from "./helpers.js";

describe("VirtualList", () => {
  test("ビューポート分のノードのみが描画される", () => {
    const nodes = makeNodes(100);
    const { lastFrame, unmount } = render(<VirtualList nodes={nodes} cursor={0} viewport={5} />);
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(5);
    expect(frame).toContain("ボタン1");
    expect(frame).toContain("ボタン5");
    expect(frame).not.toContain("ボタン6");
    unmount();
  });

  test("カーソルが末尾でも viewport 分の行が描画される", () => {
    const nodes = makeNodes(100);
    const { lastFrame, unmount } = render(<VirtualList nodes={nodes} cursor={99} viewport={5} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ボタン100");
    expect(frame).toContain("ボタン96");
    expect(frame).not.toContain("ボタン95");
    unmount();
  });

  test("選択行には > プレフィクスが付く", () => {
    const nodes = makeNodes(10);
    const { lastFrame, unmount } = render(<VirtualList nodes={nodes} cursor={3} viewport={10} />);
    const frame = lastFrame() ?? "";
    // "> " で始まる行が 1 行だけ存在する。
    const selectedLines = frame.split("\n").filter((l) => l.includes("> "));
    expect(selectedLines.length).toBe(1);
    expect(selectedLines[0]).toContain("ボタン4");
    unmount();
  });

  test("ノードが 0 件のときは空メッセージを表示する", () => {
    const { lastFrame, unmount } = render(<VirtualList nodes={[]} cursor={0} viewport={5} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("表示するノードがありません");
    unmount();
  });

  test("inlineSegments を持つ行も speechText のテキスト全体が 1 行に収まる", () => {
    // セグメント単位で Text が分割されても、表示上は 1 行にレンダリングされる
    // ことを確認する (分割が改行を生まない)。
    const speechText = "[paragraph] これは リンク の行";
    const linkStart = speechText.indexOf("リンク");
    const nodes = [
      {
        backendNodeId: 1,
        role: "paragraph",
        name: "これは リンク の行",
        depth: 0,
        properties: {},
        state: {},
        speechText,
        isFocusable: false,
        isIgnored: false,
        inlineSegments: [
          {
            role: "link",
            name: "リンク",
            backendNodeId: 11,
            isFocusable: true,
            state: {},
            properties: {},
            start: linkStart,
            end: linkStart + "リンク".length,
          },
        ],
      },
    ];
    const { lastFrame, unmount } = render(<VirtualList nodes={nodes} cursor={1} viewport={5} />);
    const frame = lastFrame() ?? "";
    const textLines = frame.split("\n").filter((l) => l.length > 0);
    expect(textLines).toHaveLength(1);
    expect(textLines[0]).toContain("これは");
    expect(textLines[0]).toContain("リンク");
    expect(textLines[0]).toContain("の行");
    unmount();
  });

  test("depth に応じてインデントが入る", () => {
    const nodes = [
      {
        backendNodeId: 1,
        role: "main",
        name: "",
        depth: 0,
        properties: {},
        state: {},
        speechText: "[main]",
        isFocusable: false,
        isIgnored: false,
      },
      {
        backendNodeId: 2,
        role: "button",
        name: "送信",
        depth: 2,
        properties: {},
        state: {},
        speechText: "[button] 送信",
        isFocusable: true,
        isIgnored: false,
      },
    ];
    const { lastFrame, unmount } = render(<VirtualList nodes={nodes} cursor={0} viewport={5} />);
    const frame = lastFrame() ?? "";
    // depth=2 のノードは 4 スペース ("  " x 2) インデントされている。
    const lines = frame.split("\n");
    const buttonLine = lines.find((l) => l.includes("送信"));
    expect(buttonLine).toBeDefined();
    expect(buttonLine).toMatch(/ {4}\[button\] 送信/);
    unmount();
  });
});
