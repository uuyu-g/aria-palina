import type { A11yNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import { render } from "ink-testing-library";
import { App } from "../components/App.js";
import { makeNode, makeNodes } from "./helpers.js";

/** Phase 5 キーバインドのテスト用に混合種別のノード列を作成する。 */
function makeMixedNodes(): A11yNode[] {
  return [
    makeNode({ backendNodeId: 1, role: "main" }), // 0: landmark
    makeNode({ backendNodeId: 2, role: "heading", name: "見出し 1" }), // 1
    makeNode({ backendNodeId: 3, role: "button", isFocusable: true, name: "btn1" }), // 2
    makeNode({
      backendNodeId: 4,
      role: "link",
      isFocusable: true,
      state: { disabled: true },
      name: "disabled-link",
    }), // 3: disabled interactive
    makeNode({ backendNodeId: 5, role: "heading", name: "見出し 2" }), // 4
    makeNode({ backendNodeId: 6, role: "navigation" }), // 5: landmark
    makeNode({ backendNodeId: 7, role: "button", isFocusable: true, name: "btn2" }), // 6
  ];
}

function waitFrames(n = 3): Promise<void> {
  // useInput は useEffect 内で stdin にリスナを貼るため、マウント直後は
  // まだ拾えない。複数回 setImmediate を回して React のコミット/エフェクト
  // を確実に流す。
  return new Promise<void>((resolve) => {
    const tick = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      setImmediate(() => tick(remaining - 1));
    };
    tick(n);
  });
}

describe("App", () => {
  test("ヘッダーに URL と位置情報が表示される", async () => {
    const nodes = makeNodes(5);
    const { lastFrame, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("aria-palina");
    expect(frame).toContain("https://example.com");
    expect(frame).toContain("1/5");
    unmount();
  });

  test("↓ キーでカーソルが 1 つ下に進む", async () => {
    const nodes = makeNodes(5);
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("\u001B[B"); // 下矢印
    await waitFrames();
    expect(lastFrame() ?? "").toContain("2/5");
    unmount();
  });

  test("↑ キーは先頭では止まる", async () => {
    const nodes = makeNodes(5);
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("\u001B[A"); // 上矢印
    await waitFrames();
    expect(lastFrame() ?? "").toContain("1/5");
    unmount();
  });

  test("G キーで末尾にジャンプする", async () => {
    const nodes = makeNodes(50);
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("G");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("50/50");
    unmount();
  });

  test("g キーで先頭に戻る", async () => {
    const nodes = makeNodes(50);
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("G");
    await waitFrames();
    stdin.write("g");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("1/50");
    unmount();
  });

  test("PageDown でカーソルが viewport 分進む", async () => {
    const nodes = makeNodes(50);
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("\u001B[6~"); // PageDown
    await waitFrames();
    // 初期 cursor=0, viewport=10 → PageDown で cursor=10、表示は 11/50
    expect(lastFrame() ?? "").toContain("11/50");
    unmount();
  });

  test("フッターにキーバインドのヘルプが表示される", async () => {
    const nodes = makeNodes(3);
    const { lastFrame, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("移動");
    expect(frame).toContain("終了");
    unmount();
  });

  test("ノードが空でも 0/0 を表示してクラッシュしない", async () => {
    const { lastFrame, unmount } = render(
      <App url="https://example.com" nodes={[]} viewportOverride={10} />,
    );
    await waitFrames();
    expect(lastFrame() ?? "").toContain("0/0");
    unmount();
  });

  test("Tab キーで次のインタラクティブ要素にカーソルが移動する", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    // cursor=0 → 次の interactive (disabled をスキップ) は index 2 → 表示 3/7
    stdin.write("\t");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("3/7");
    // もう一度 Tab で disabled を飛ばして index 6 → 7/7
    stdin.write("\t");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("7/7");
    unmount();
  });

  test("Shift+Tab で前のインタラクティブ要素へ戻る", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("G"); // cursor = 6 (7/7)
    await waitFrames();
    stdin.write("\u001B[Z"); // Shift+Tab
    await waitFrames();
    // index 6 の前で interactive かつ enabled なのは index 2 → 3/7
    expect(lastFrame() ?? "").toContain("3/7");
    unmount();
  });

  test("h キーで次の見出しへ、H キーで前の見出しへジャンプする", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("2/7"); // index 1 (heading 1)
    stdin.write("h");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("5/7"); // index 4 (heading 2)
    stdin.write("H");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("2/7"); // 逆方向: index 1
    unmount();
  });

  test("D キーで次のランドマークへジャンプする", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    // cursor=0 (main landmark) から D で次の landmark (navigation, index 5) へ
    stdin.write("D");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("6/7");
    unmount();
  });

  test("該当要素が無い場合はカーソル位置を維持する", async () => {
    const nodes = makeNodes(5); // button のみ (heading / landmark なし)
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("1/5");
    stdin.write("D");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("1/5");
    unmount();
  });
});
