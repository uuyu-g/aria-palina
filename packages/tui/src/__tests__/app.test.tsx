import { describe, expect, test } from "vite-plus/test";
import { render } from "ink-testing-library";
import { App } from "../components/App.js";
import { makeNodes } from "./helpers.js";

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
});
