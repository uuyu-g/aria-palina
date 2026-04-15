import type { A11yNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import type {
  BrowserFactory,
  BrowserHandle,
  TuiArgs,
  TuiRenderer,
  TuiRenderResult,
} from "../run.js";
import { runTui } from "../run.js";
import type { MinimalCDPSession } from "../playwright-cdp-adapter.js";
import { createWritableBuffer, makeNodes } from "./helpers.js";

const BASE_ARGS: TuiArgs = {
  url: "https://example.com",
  headed: false,
  role: undefined,
  wait: "none",
  idleTime: 500,
  timeout: 30_000,
};

function fakeBrowserFactory(opts?: { throwOnSession?: boolean }): {
  factory: BrowserFactory;
  closed: { value: boolean };
} {
  const closed = { value: false };
  const factory: BrowserFactory = async () => {
    const handle: BrowserHandle = {
      async newCDPSessionForUrl(): Promise<MinimalCDPSession> {
        if (opts?.throwOnSession) throw new Error("CDP connection failed");
        return {
          async send() {
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
  return { factory, closed };
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
