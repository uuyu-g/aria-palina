import type { A11yNode } from "@aria-palina/core";
import { clearHighlight, highlightNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import { render } from "ink-testing-library";
import { App } from "../tui/components/App.js";
import { adaptCDPSession, type MinimalCDPSession } from "../playwright-cdp-adapter.js";
import type { HighlightController } from "../tui/use-highlight.js";
import { makeNode, makeNodes } from "./helpers.js";

/** フィルタモード検証用に混合種別のノード列を作成する。 */
function makeMixedNodes(): A11yNode[] {
  return [
    makeNode({
      backendNodeId: 1,
      role: "main",
      name: "main-landmark",
      speechText: "[main] main-landmark",
    }), // 0: landmark
    makeNode({
      backendNodeId: 2,
      role: "heading",
      name: "見出し 1",
      speechText: "[heading] 見出し 1",
    }), // 1
    makeNode({
      backendNodeId: 3,
      role: "button",
      isFocusable: true,
      name: "btn1",
      speechText: "[button] btn1",
    }), // 2
    makeNode({
      backendNodeId: 4,
      role: "link",
      isFocusable: true,
      state: { disabled: true },
      name: "disabled-link",
      speechText: "[link] disabled-link",
    }), // 3: disabled interactive
    makeNode({
      backendNodeId: 5,
      role: "heading",
      name: "見出し 2",
      speechText: "[heading] 見出し 2",
    }), // 4
    makeNode({
      backendNodeId: 6,
      role: "navigation",
      name: "nav-landmark",
      speechText: "[navigation] nav-landmark",
    }), // 5: landmark
    makeNode({
      backendNodeId: 7,
      role: "button",
      isFocusable: true,
      name: "btn2",
      speechText: "[button] btn2",
    }), // 6
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

  test("h で見出しモーダルが開き次の見出しへ移動する", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("見出し ("); // アクティブタブ
    expect(frame).toContain("> [heading] 見出し 1"); // 選択行が見出し 1
    unmount();
  });

  test("d でランドマークモーダルが開き最寄りのランドマークが選択される", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    // cursor=0 (main landmark) → findNearest で現在位置が一致するため cursor=0 のまま
    stdin.write("d");
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ランドマーク ("); // アクティブタブ
    expect(frame).toContain("> [main] main-landmark"); // 現在位置の main が選択
    unmount();
  });

  test("該当要素が無い場合はカーソル位置を維持しモーダルも開かない", async () => {
    const nodes = makeNodes(5); // isFocusable=false の button のみ (heading / landmark / interactive 全て不一致)
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    let frame = lastFrame() ?? "";
    expect(frame).toContain("[1/5]");
    expect(frame).not.toContain("種別切替"); // モーダルは出ていない
    expect(frame).toContain("h 見出し"); // 通常モードのフッターのまま
    stdin.write("d");
    await waitFrames();
    frame = lastFrame() ?? "";
    expect(frame).toContain("[1/5]");
    expect(frame).not.toContain("種別切替");
    unmount();
  });

  test("h でカーソルより前の見出しも検出してモーダルが開く", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("G"); // cursor=6 (末尾の btn2)
    await waitFrames();
    stdin.write("h"); // 前方に見出しは無いが後方に見出し 2 (index 4) がある
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("見出し ("); // モーダルが開いている
    expect(frame).toContain("> [heading] 見出し 2"); // 最寄りの見出し 2 が選択
    unmount();
  });
});

describe("App filter modal", () => {
  test("モーダルでは一覧が絞り込まれて表示される", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("見出し ("); // アクティブタブ
    expect(frame).toContain("見出し 1");
    // 非見出しノードの name は表示されない
    expect(frame).not.toContain("btn1");
    expect(frame).not.toContain("main-landmark");
    expect(frame).not.toContain("nav-landmark");
    unmount();
  });

  test("モーダル内の深いネスト構造が親子関係を保ちつつ正規化される", async () => {
    const nodes = [
      makeNode({ backendNodeId: 1, role: "heading", speechText: "[heading] h1", depth: 0 }),
      makeNode({ backendNodeId: 2, role: "text", speechText: "[text] t1", depth: 1 }),
      makeNode({ backendNodeId: 3, role: "text", speechText: "[text] t2", depth: 2 }),
      makeNode({ backendNodeId: 4, role: "text", speechText: "[text] t3", depth: 3 }),
      makeNode({ backendNodeId: 5, role: "heading", speechText: "[heading] h2", depth: 4 }),
    ];
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    const frame = lastFrame() ?? "";
    // 元の depth [0, 4] が正規化されて [0, 1] になる。
    // depth=4 のままなら "  ".repeat(4) = 8 文字のインデントがつくが
    // 正規化により "  ".repeat(1) = 2 文字で済む。
    expect(frame).not.toMatch(/\s{8}\[heading\]/); // 8 文字以上のインデントは無い
    expect(frame).toContain("[heading] h1");
    expect(frame).toContain("[heading] h2");
    unmount();
  });

  test("モーダル中の ↓ は絞り込みリスト内を移動する", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h"); // heading モーダル → 選択=見出し 1
    await waitFrames();
    expect(lastFrame() ?? "").toContain("> [heading] 見出し 1");
    stdin.write("\u001B[B"); // ↓
    await waitFrames();
    expect(lastFrame() ?? "").toContain("> [heading] 見出し 2");
    unmount();
  });

  test("→ で heading → landmark → interactive の順にモーダル種別が切り替わる", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("見出し (");
    stdin.write("\u001B[C"); // →
    await waitFrames();
    expect(lastFrame() ?? "").toContain("ランドマーク (");
    stdin.write("\u001B[C"); // →
    await waitFrames();
    expect(lastFrame() ?? "").toContain("インタラクティブ (");
    stdin.write("\u001B[C"); // →
    await waitFrames();
    expect(lastFrame() ?? "").toContain("見出し (");
    unmount();
  });

  test("← で逆方向にモーダル種別が切り替わる", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h");
    await waitFrames();
    stdin.write("\u001B[D"); // ←
    await waitFrames();
    expect(lastFrame() ?? "").toContain("インタラクティブ (");
    stdin.write("\u001B[D"); // ←
    await waitFrames();
    expect(lastFrame() ?? "").toContain("ランドマーク (");
    unmount();
  });

  test("Esc でモーダルを閉じて通常モードに戻る", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h"); // cursor=1 (見出し 1)
    await waitFrames();
    stdin.write("\u001B[B"); // ↓ → cursor=4 (見出し 2)
    await waitFrames();
    stdin.write("\u001B"); // Esc
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("種別切替"); // モーダルは閉じている
    expect(frame).toContain("[5/7]"); // 解除後も cursor=4 を維持
    expect(frame).toContain("h 見出し"); // 通常モードのフッター
    // 解除後は全ノードが見える
    expect(frame).toContain("main-landmark");
    unmount();
  });

  test("Enter でモーダルを閉じ選択位置に留まる", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h"); // cursor=1 (見出し 1)
    await waitFrames();
    stdin.write("\u001B[B"); // ↓ → cursor=4 (見出し 2)
    await waitFrames();
    stdin.write("\r"); // Enter
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("種別切替"); // モーダルは閉じている
    expect(frame).toContain("[5/7]"); // cursor=4 を維持
    expect(frame).toContain("h 見出し"); // 通常モードのフッター
    unmount();
  });

  test("g でモーダル内の先頭、G で末尾へ移動する", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h"); // 見出しモーダル (選択=見出し 1)
    await waitFrames();
    stdin.write("G");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("> [heading] 見出し 2");
    stdin.write("g");
    await waitFrames();
    expect(lastFrame() ?? "").toContain("> [heading] 見出し 1");
    unmount();
  });

  test("モーダル中に Tab を押すとモーダルを閉じ次のインタラクティブ要素へ移動する", async () => {
    const nodes = makeMixedNodes();
    const { lastFrame, stdin, unmount } = render(
      <App url="https://example.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("h"); // cursor=1 (見出し 1)
    await waitFrames();
    stdin.write("\t"); // Tab
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("種別切替"); // 通常モードに戻っている
    expect(frame).toContain("[3/7]"); // index 2 (btn1) へ移動
    unmount();
  });
});

describe("App highlight controller", () => {
  test("highlightController が null のときは highlight も clear も呼ばれない", async () => {
    const nodes = makeMixedNodes();
    const calls: Array<{ kind: "highlight" | "clear"; id?: number }> = [];
    const { stdin, unmount } = render(
      <App
        url="https://example.com"
        nodes={nodes}
        viewportOverride={10}
        highlightController={null}
        highlightDebounceMs={0}
      />,
    );
    await waitFrames();
    stdin.write("\u001B[B"); // ↓
    await waitFrames();
    unmount();
    await waitFrames();
    expect(calls).toEqual([]);
  });

  test("マウント直後とカーソル変更時に backendNodeId を highlight に渡す", async () => {
    const nodes = makeMixedNodes();
    const calls: Array<{ kind: "highlight" | "clear"; id?: number }> = [];
    const controller = {
      highlight: (id: number) => calls.push({ kind: "highlight", id }),
      clear: () => calls.push({ kind: "clear" }),
    };
    const { stdin, unmount } = render(
      <App
        url="https://example.com"
        nodes={nodes}
        viewportOverride={10}
        highlightController={controller}
        highlightDebounceMs={0}
      />,
    );
    await waitFrames();
    stdin.write("\u001B[B"); // ↓ → cursor=1 (見出し 1)
    await waitFrames();
    const highlights = calls.filter((c) => c.kind === "highlight").map((c) => c.id);
    expect(highlights).toEqual([1, 2]); // 初期 cursor=0 (backendNodeId=1) → cursor=1 (backendNodeId=2)
    unmount();
  });

  test("App→adaptCDPSession 経由で実際に Overlay.highlightNode が session に届く", async () => {
    // 実装の結合 (App → HighlightController → adaptCDPSession → session) を
    // 貫通して、カーソル変更時に CDP `Overlay.highlightNode` コマンドが
    // セッションへ送られることを検証する。
    const cdpCalls: Array<{ method: string; params: unknown }> = [];
    const session: MinimalCDPSession = {
      async send(method: string, params?: Record<string, unknown>) {
        cdpCalls.push({ method, params });
        return {};
      },
      on() {},
      off() {},
    };
    const adapter = adaptCDPSession(session);
    const controller: HighlightController = {
      highlight(id: number) {
        void highlightNode(adapter, id);
      },
      clear() {
        void clearHighlight(adapter);
      },
    };
    const nodes = makeMixedNodes();

    const { stdin, unmount } = render(
      <App
        url="https://example.com"
        nodes={nodes}
        viewportOverride={10}
        highlightController={controller}
        highlightDebounceMs={0}
      />,
    );
    await waitFrames();
    stdin.write("\u001B[B"); // ↓ → cursor=1 (backendNodeId=2)
    await waitFrames();
    unmount();
    await waitFrames();

    const overlayCalls = cdpCalls.filter((c) => c.method === "Overlay.highlightNode");
    const overlayBackendIds = overlayCalls.map(
      (c) => (c.params as { backendNodeId: number }).backendNodeId,
    );
    // 初期 cursor=0 (backendNodeId=1) とカーソル移動後の backendNodeId=2 の
    // 両方が CDP に到達している。
    expect(overlayBackendIds).toEqual([1, 2]);
    // アンマウント時の clear が Overlay.hideHighlight として届いている。
    expect(cdpCalls.some((c) => c.method === "Overlay.hideHighlight")).toBe(true);
  });

  test("アンマウント時に clear が呼ばれる", async () => {
    const nodes = makeMixedNodes();
    const calls: Array<{ kind: "highlight" | "clear"; id?: number }> = [];
    const controller = {
      highlight: (id: number) => calls.push({ kind: "highlight", id }),
      clear: () => calls.push({ kind: "clear" }),
    };
    const { unmount } = render(
      <App
        url="https://example.com"
        nodes={nodes}
        viewportOverride={10}
        highlightController={controller}
        highlightDebounceMs={0}
      />,
    );
    await waitFrames();
    unmount();
    await waitFrames();
    expect(calls.some((c) => c.kind === "clear")).toBe(true);
  });

  test("liveBridge.subscribe 経由の更新で nodes が差し替わる", async () => {
    const first = makeNodes(3);
    const second = makeNodes(5);
    let listener: ((u: import("../tui/run.js").LiveUpdate) => void) | null = null;
    const bridge: import("../tui/run.js").LiveBridge = {
      getSnapshot: () => first,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
      refresh: async () => {},
      toggleLive: async () => true,
      isLiveEnabled: () => true,
    };
    const { lastFrame, unmount } = render(
      <App url="https://x.com" nodes={first} viewportOverride={10} liveBridge={bridge} />,
    );
    await waitFrames();
    expect(lastFrame() ?? "").toContain("1/3");

    listener?.({ nodes: second, cause: "document", liveChanges: [] });
    await waitFrames();
    expect(lastFrame() ?? "").toContain("1/5");
    unmount();
  });

  test("更新後も同じ backendNodeId にカーソルが追随する", async () => {
    const first: A11yNode[] = makeMixedNodes();
    // first の cursor を index=2 (backendNodeId=3) に移動させた状態で更新する
    // 新しいリストでは順序が変わり、backendNodeId=3 は index=0 に来る。
    const second: A11yNode[] = [
      makeNode({ backendNodeId: 3, role: "button", name: "btn1", speechText: "[button] btn1" }),
      makeNode({ backendNodeId: 99, role: "heading", name: "新規", speechText: "[heading] 新規" }),
    ];
    let listener: ((u: import("../tui/run.js").LiveUpdate) => void) | null = null;
    const bridge: import("../tui/run.js").LiveBridge = {
      getSnapshot: () => first,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
      refresh: async () => {},
      toggleLive: async () => true,
      isLiveEnabled: () => true,
    };
    const { lastFrame, stdin, unmount } = render(
      <App url="https://x.com" nodes={first} viewportOverride={10} liveBridge={bridge} />,
    );
    await waitFrames();
    stdin.write("\u001B[B"); // ↓
    await waitFrames();
    stdin.write("\u001B[B"); // ↓ cursor=2
    await waitFrames();
    expect(lastFrame() ?? "").toContain("3/7");

    listener?.({ nodes: second, cause: "document", liveChanges: [] });
    await waitFrames();
    // backendNodeId=3 が index=0 に移動 → カーソルも 0 に追随 → 表示は 1/2
    expect(lastFrame() ?? "").toContain("1/2");
    unmount();
  });

  test("r キーで liveBridge.refresh が呼ばれる", async () => {
    const nodes = makeNodes(2);
    let refreshCount = 0;
    const bridge: import("../tui/run.js").LiveBridge = {
      getSnapshot: () => nodes,
      subscribe: () => () => {},
      refresh: async () => {
        refreshCount++;
      },
      toggleLive: async () => true,
      isLiveEnabled: () => true,
    };
    const { stdin, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} liveBridge={bridge} />,
    );
    await waitFrames();
    stdin.write("r");
    await waitFrames();
    expect(refreshCount).toBe(1);
    unmount();
  });

  test("L キーで liveBridge.toggleLive が呼ばれライブ表示が切り替わる", async () => {
    const nodes = makeNodes(2);
    let enabled = true;
    const bridge: import("../tui/run.js").LiveBridge = {
      getSnapshot: () => nodes,
      subscribe: () => () => {},
      refresh: async () => {},
      toggleLive: async () => {
        enabled = !enabled;
        return enabled;
      },
      isLiveEnabled: () => enabled,
    };
    const { lastFrame, stdin, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} liveBridge={bridge} />,
    );
    await waitFrames();
    expect(lastFrame() ?? "").toContain("[live]");

    stdin.write("L");
    await waitFrames();
    await waitFrames();
    expect(lastFrame() ?? "").toContain("[live:off]");
    unmount();
  });

  test("Enter でクリックロール (button) の要素に対し actionBridge.click が呼ばれる", async () => {
    const nodes = makeMixedNodes();
    const clicks: A11yNode[] = [];
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click(node) {
        clicks.push(node);
      },
    };
    const { stdin, lastFrame, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} actionBridge={actionBridge} />,
    );
    await waitFrames();
    stdin.write("\t"); // Tab → cursor=2 (btn1, role=button)
    await waitFrames();
    stdin.write("\r"); // Enter
    await waitFrames();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.backendNodeId).toBe(3); // btn1 の backendNodeId
    expect(lastFrame() ?? "").toContain("✱ クリック: btn1");
    unmount();
  });

  test("Enter は非クリックロール (heading) では何もしない", async () => {
    const nodes = makeMixedNodes();
    const clicks: A11yNode[] = [];
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click(node) {
        clicks.push(node);
      },
    };
    const { stdin, lastFrame, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} actionBridge={actionBridge} />,
    );
    await waitFrames();
    stdin.write("\u001B[B"); // ↓ → cursor=1 (heading)
    await waitFrames();
    stdin.write("\r"); // Enter
    await waitFrames();
    expect(clicks).toEqual([]);
    expect(lastFrame() ?? "").not.toContain("✱ クリック");
    unmount();
  });

  test("Space でトグルロール (checkbox) に対し actionBridge.click が呼ばれる", async () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 10,
        role: "checkbox",
        isFocusable: true,
        name: "通知を受け取る",
        speechText: "[checkbox] 通知を受け取る",
      }),
    ];
    const clicks: A11yNode[] = [];
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click(node) {
        clicks.push(node);
      },
    };
    const { stdin, lastFrame, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} actionBridge={actionBridge} />,
    );
    await waitFrames();
    stdin.write(" "); // Space
    await waitFrames();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.backendNodeId).toBe(10);
    expect(lastFrame() ?? "").toContain("✱ クリック: 通知を受け取る");
    unmount();
  });

  test("Space は非トグルロール (link) では何もしない", async () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 10,
        role: "link",
        isFocusable: true,
        name: "トップ",
        speechText: "[link] トップ",
      }),
    ];
    const clicks: A11yNode[] = [];
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click(node) {
        clicks.push(node);
      },
    };
    const { stdin, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} actionBridge={actionBridge} />,
    );
    await waitFrames();
    stdin.write(" "); // Space
    await waitFrames();
    expect(clicks).toEqual([]);
    unmount();
  });

  test("ヘッドレス時の初回操作で headless 警告が表示されクリックは通常通り発火する", async () => {
    const nodes = makeMixedNodes();
    const clicks: A11yNode[] = [];
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click(node) {
        clicks.push(node);
      },
    };
    const { stdin, lastFrame, unmount } = render(
      <App
        url="https://x.com"
        nodes={nodes}
        viewportOverride={10}
        actionBridge={actionBridge}
        headless
      />,
    );
    await waitFrames();
    stdin.write("\t"); // → cursor=2 (btn1)
    await waitFrames();
    stdin.write("\r"); // Enter
    await waitFrames();
    expect(clicks).toHaveLength(1);
    const firstFrame = lastFrame() ?? "";
    expect(firstFrame).toContain("[headless]");
    expect(firstFrame).toContain("--headed");
    // 2 回目はもう警告は出ず、通常のクリックフィードバックに切り替わる。
    stdin.write("\t"); // → 次の interactive (btn2, index=6)
    await waitFrames();
    stdin.write("\r"); // Enter
    await waitFrames();
    expect(clicks).toHaveLength(2);
    const secondFrame = lastFrame() ?? "";
    expect(secondFrame).not.toContain("[headless]");
    expect(secondFrame).toContain("✱ クリック: btn2");
    unmount();
  });

  test("actionBridge 未指定のとき Enter / Space は no-op", async () => {
    const nodes = makeMixedNodes();
    const { stdin, lastFrame, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} />,
    );
    await waitFrames();
    stdin.write("\t"); // cursor=2 (btn1)
    await waitFrames();
    stdin.write("\r");
    await waitFrames();
    stdin.write(" ");
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("✱ クリック");
    expect(frame).not.toContain("[headless]");
    unmount();
  });

  test("クリック後に live 更新が来ても backendNodeId 基準でカーソルが保たれる", async () => {
    const first: A11yNode[] = [
      makeNode({
        backendNodeId: 5,
        role: "button",
        isFocusable: true,
        name: "開く",
        speechText: "[button] 開く",
      }),
      makeNode({
        backendNodeId: 6,
        role: "button",
        isFocusable: true,
        name: "閉じる",
        speechText: "[button] 閉じる",
      }),
    ];
    // クリック後 "閉じる" ボタンが先頭へ移動するシナリオ
    const second: A11yNode[] = [
      makeNode({
        backendNodeId: 7,
        role: "heading",
        name: "ダイアログ",
        speechText: "[heading] ダイアログ",
      }),
      first[1]!,
      first[0]!,
    ];
    let listener: ((u: import("../tui/run.js").LiveUpdate) => void) | null = null;
    const bridge: import("../tui/run.js").LiveBridge = {
      getSnapshot: () => first,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
      refresh: async () => {},
      toggleLive: async () => true,
      isLiveEnabled: () => true,
    };
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click() {},
    };
    const { lastFrame, stdin, unmount } = render(
      <App
        url="https://x.com"
        nodes={first}
        viewportOverride={10}
        liveBridge={bridge}
        actionBridge={actionBridge}
      />,
    );
    await waitFrames();
    stdin.write("\t"); // Tab → cursor=0 (button, backendNodeId=5)。既に 0 なので Tab は次へ → cursor=1
    await waitFrames();
    expect(lastFrame() ?? "").toContain("2/2"); // backendNodeId=6
    stdin.write("\r"); // Enter
    await waitFrames();
    // 新しいツリー: "閉じる" (backendNodeId=6) が index=1 → カーソルも index=1
    listener?.({ nodes: second, cause: "document", liveChanges: [] });
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("2/3"); // cursor=1 (2番目)
    expect(frame).toContain("閉じる");
    unmount();
  });

  test("backendNodeId=0 のノードでは Enter は no-op", async () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 0,
        role: "button",
        isFocusable: true,
        name: "text-only",
        speechText: "[button] text-only",
      }),
    ];
    const clicks: A11yNode[] = [];
    const actionBridge: import("../tui/run.js").ActionBridge = {
      async click(node) {
        clicks.push(node);
      },
    };
    const { stdin, lastFrame, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} actionBridge={actionBridge} />,
    );
    await waitFrames();
    stdin.write("\r"); // Enter
    await waitFrames();
    expect(clicks).toEqual([]);
    expect(lastFrame() ?? "").not.toContain("✱ クリック");
    unmount();
  });

  test("assertive な live 変更はステータスバーに ! 付きで表示される", async () => {
    const nodes = makeNodes(2);
    let listener: ((u: import("../tui/run.js").LiveUpdate) => void) | null = null;
    const bridge: import("../tui/run.js").LiveBridge = {
      getSnapshot: () => nodes,
      subscribe: (l) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
      refresh: async () => {},
      toggleLive: async () => true,
      isLiveEnabled: () => true,
    };
    const { lastFrame, unmount } = render(
      <App url="https://x.com" nodes={nodes} viewportOverride={10} liveBridge={bridge} />,
    );
    await waitFrames();
    const alertNode = makeNode({
      backendNodeId: 101,
      role: "alert",
      name: "エラー発生",
      speechText: "[alert] エラー発生",
    });
    listener?.({
      nodes,
      cause: "document",
      liveChanges: [
        {
          kind: "added",
          node: alertNode,
          politeness: "assertive",
          after: "[alert] エラー発生",
        },
      ],
    });
    await waitFrames();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("!");
    expect(frame).toContain("エラー発生");
    unmount();
  });
});
