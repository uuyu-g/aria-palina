import type { A11yNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import type {
  BrowserFactory,
  BrowserFactoryOptions,
  BrowserHandle,
  TuiArgs,
  TuiRenderer,
  TuiRenderResult,
} from "../tui/run.js";
import { runTui } from "../tui/run.js";
import type { MinimalCDPSession } from "../playwright-cdp-adapter.js";
import { createWritableBuffer, makeNodes } from "./helpers.js";

const BASE_ARGS: TuiArgs = {
  url: "https://example.com",
  headed: false,
  role: undefined,
  wait: "none",
  idleTime: 500,
  timeout: 30_000,
  persist: true,
  userDataDir: undefined,
};

function fakeBrowserFactory(opts?: { throwOnSession?: boolean }): {
  factory: BrowserFactory;
  closed: { value: boolean };
  cdpCalls: string[];
  receivedOpts: { value: BrowserFactoryOptions | null };
} {
  const closed = { value: false };
  const cdpCalls: string[] = [];
  const receivedOpts: { value: BrowserFactoryOptions | null } = { value: null };
  const factory: BrowserFactory = async (factoryOpts) => {
    receivedOpts.value = factoryOpts;
    const handle: BrowserHandle = {
      async newCDPSessionForUrl(): Promise<MinimalCDPSession> {
        if (opts?.throwOnSession) throw new Error("CDP connection failed");
        return {
          async send(method: string) {
            cdpCalls.push(method);
            return { nodes: [] };
          },
          on() {},
          off() {},
        };
      },
      async close() {
        closed.value = true;
      },
    };
    return handle;
  };
  return { factory, closed, cdpCalls, receivedOpts };
}

/** テスト用: waitUntilExit が即座に resolve する fake renderer。 */
function captureRenderer(captured: { element?: unknown }): TuiRenderer {
  return (element): TuiRenderResult => {
    captured.element = element;
    return {
      async waitUntilExit() {},
      unmount() {},
    };
  };
}

describe("runTui", () => {
  test("非 TTY 環境では exitCode:2 を返し、ブラウザは起動しない", async () => {
    const stderr = createWritableBuffer();
    const { factory, closed } = fakeBrowserFactory();

    const code = await runTui(BASE_ARGS, {
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
      renderer: captureRenderer({}),
    });

    expect(code).toBe(2);
    expect(stderr.value).toContain("TTY");
    expect(closed.value).toBe(false);
  });

  test("TTY 環境では抽出結果を App に渡して render する", async () => {
    const stderr = createWritableBuffer();
    const { factory, closed } = fakeBrowserFactory();
    const captured: { element?: unknown } = {};
    const nodes = makeNodes(3);

    const code = await runTui(BASE_ARGS, {
      stderr: stderr.stream,
      isTTY: true,
      browserFactory: factory,
      renderer: captureRenderer(captured),
      extractor: async () => nodes,
    });

    expect(code).toBe(0);
    expect(stderr.value).toBe("");
    expect(closed.value).toBe(true);
    const element = captured.element as { props: { nodes: A11yNode[]; url: string } };
    expect(element.props.url).toBe("https://example.com");
    expect(element.props.nodes.length).toBe(3);
  });

  test("抽出中に失敗しても browser.close が呼ばれる", async () => {
    const stderr = createWritableBuffer();
    const { factory, closed } = fakeBrowserFactory({ throwOnSession: true });

    const code = await runTui(BASE_ARGS, {
      stderr: stderr.stream,
      isTTY: true,
      browserFactory: factory,
      renderer: captureRenderer({}),
    });

    expect(code).toBe(1);
    expect(closed.value).toBe(true);
    expect(stderr.value).toContain("CDP connection failed");
  });

  test("role フィルタが指定されると該当ロールのみ App に渡される", async () => {
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();
    const captured: { element?: unknown } = {};
    const nodes: A11yNode[] = [
      {
        backendNodeId: 1,
        role: "heading",
        name: "タイトル",
        depth: 0,
        properties: { level: 1 },
        state: {},
        speechText: "[heading] タイトル",
        isFocusable: false,
        isIgnored: false,
      },
      {
        backendNodeId: 2,
        role: "button",
        name: "送信",
        depth: 1,
        properties: {},
        state: {},
        speechText: "[button] 送信",
        isFocusable: true,
        isIgnored: false,
      },
    ];

    const code = await runTui(
      { ...BASE_ARGS, role: ["button"] },
      {
        stderr: stderr.stream,
        isTTY: true,
        browserFactory: factory,
        renderer: captureRenderer(captured),
        extractor: async () => nodes,
      },
    );

    expect(code).toBe(0);
    const element = captured.element as { props: { nodes: A11yNode[] } };
    expect(element.props.nodes.length).toBe(1);
    expect(element.props.nodes[0]?.role).toBe("button");
    // フィルタ後は最小 depth 分引かれて 0 起点になる。
    expect(element.props.nodes[0]?.depth).toBe(0);
  });

  test("--headed 指定時は Overlay.enable と終了時の hideHighlight/disable を発行する", async () => {
    const stderr = createWritableBuffer();
    const { factory, cdpCalls } = fakeBrowserFactory();
    const captured: { element?: unknown } = {};
    const nodes = makeNodes(2);

    const code = await runTui(
      { ...BASE_ARGS, headed: true },
      {
        stderr: stderr.stream,
        isTTY: true,
        browserFactory: factory,
        renderer: captureRenderer(captured),
        extractor: async () => nodes,
      },
    );

    expect(code).toBe(0);
    // DOM.enable は Overlay.highlightNode の前提条件 (Chromium が backendNodeId を
    // 解決するために必要) なので Overlay.enable より前に発行されている。
    const domEnableIdx = cdpCalls.indexOf("DOM.enable");
    const overlayEnableIdx = cdpCalls.indexOf("Overlay.enable");
    expect(domEnableIdx).toBeGreaterThanOrEqual(0);
    expect(overlayEnableIdx).toBeGreaterThan(domEnableIdx);
    expect(cdpCalls).toContain("Overlay.hideHighlight");
    expect(cdpCalls).toContain("Overlay.disable");
    const element = captured.element as { props: { highlightController: unknown } };
    expect(element.props.highlightController).not.toBe(null);
  });

  test("--headed の highlightController.highlight は overlay と scrollIntoViewIfNeeded を両方発行する", async () => {
    const stderr = createWritableBuffer();
    const cdpCalls: Array<{ method: string; params: unknown }> = [];
    const closed = { value: false };
    const factory: BrowserFactory = async () => ({
      async newCDPSessionForUrl(): Promise<MinimalCDPSession> {
        return {
          async send(method: string, params?: Record<string, unknown>) {
            cdpCalls.push({ method, params });
            return {};
          },
          on() {},
          off() {},
        };
      },
      async close() {
        closed.value = true;
      },
    });
    const captured: { element?: unknown } = {};
    const nodes = makeNodes(2);

    const code = await runTui(
      { ...BASE_ARGS, headed: true },
      {
        stderr: stderr.stream,
        isTTY: true,
        browserFactory: factory,
        renderer: captureRenderer(captured),
        extractor: async () => nodes,
      },
    );

    expect(code).toBe(0);
    const element = captured.element as {
      props: { highlightController: { highlight: (id: number) => void } | null };
    };
    const controller = element.props.highlightController;
    expect(controller).not.toBe(null);
    controller?.highlight(77);
    // fire-and-forget された Promise のマイクロタスクを流す
    await Promise.resolve();
    await Promise.resolve();

    const highlightCall = cdpCalls.find((c) => c.method === "Overlay.highlightNode");
    const scrollCall = cdpCalls.find((c) => c.method === "DOM.scrollIntoViewIfNeeded");
    expect(highlightCall).toBeDefined();
    expect(scrollCall).toBeDefined();
    expect((scrollCall!.params as { backendNodeId: number }).backendNodeId).toBe(77);
  });

  test("headless モードでは Overlay/DOM コマンドを一切発行せず controller も null", async () => {
    const stderr = createWritableBuffer();
    const { factory, cdpCalls } = fakeBrowserFactory();
    const captured: { element?: unknown } = {};
    const nodes = makeNodes(2);

    const code = await runTui(BASE_ARGS, {
      stderr: stderr.stream,
      isTTY: true,
      browserFactory: factory,
      renderer: captureRenderer(captured),
      extractor: async () => nodes,
    });

    expect(code).toBe(0);
    expect(cdpCalls.some((m) => m.startsWith("Overlay."))).toBe(false);
    expect(cdpCalls).not.toContain("DOM.enable");
    const element = captured.element as { props: { highlightController: unknown } };
    expect(element.props.highlightController).toBe(null);
  });

  test("--headed で Overlay.enable が失敗した場合は終了時に stderr で案内する", async () => {
    const stderr = createWritableBuffer();
    const closed = { value: false };
    const factory: BrowserFactory = async () => ({
      async newCDPSessionForUrl(): Promise<MinimalCDPSession> {
        return {
          async send(method: string) {
            if (method === "Overlay.enable") {
              throw new Error("Target closed");
            }
            return { nodes: [] };
          },
          on() {},
          off() {},
        };
      },
      async close() {
        closed.value = true;
      },
    });

    const code = await runTui(
      { ...BASE_ARGS, headed: true },
      {
        stderr: stderr.stream,
        isTTY: true,
        browserFactory: factory,
        renderer: captureRenderer({}),
        extractor: async () => makeNodes(2),
      },
    );

    expect(code).toBe(0);
    expect(stderr.value).toContain("ハイライト同期が失敗しました");
    expect(stderr.value).toContain("Target closed");
    expect(closed.value).toBe(true);
  });

  test("persist と userDataDir が browserFactory に受け渡される", async () => {
    const stderr = createWritableBuffer();
    const { factory, receivedOpts } = fakeBrowserFactory();

    await runTui(
      { ...BASE_ARGS, persist: false, userDataDir: "/tmp/tui-profile" },
      {
        stderr: stderr.stream,
        isTTY: true,
        browserFactory: factory,
        renderer: captureRenderer({}),
        extractor: async () => makeNodes(1),
      },
    );

    expect(receivedOpts.value).toEqual({
      headed: false,
      persist: false,
      userDataDir: "/tmp/tui-profile",
    });
  });

  test("Chromium 未インストールのエラーは日本語で案内する", async () => {
    const stderr = createWritableBuffer();
    const factory: BrowserFactory = async () => {
      throw new Error("Executable doesn't exist at /some/path");
    };

    const code = await runTui(BASE_ARGS, {
      stderr: stderr.stream,
      isTTY: true,
      browserFactory: factory,
      renderer: captureRenderer({}),
    });

    expect(code).toBe(1);
    expect(stderr.value).toContain("Chromium");
    expect(stderr.value).toContain("playwright install");
  });
});
