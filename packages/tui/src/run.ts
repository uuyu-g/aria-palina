import type { A11yNode } from "@aria-palina/core";
import { extractA11yTree, waitForNetworkIdle } from "@aria-palina/core";
import { createElement } from "react";
import { App } from "./components/App.js";
import type { MinimalCDPSession } from "./playwright-cdp-adapter.js";
import { adaptCDPSession } from "./playwright-cdp-adapter.js";

/**
 * TUI が利用する CLI 引数の最小形。
 *
 * `@aria-palina/cli` の `CliArgs` と構造的に一致する部分集合。依存を
 * 循環させないため、TUI は CliArgs を直接 import せず、構造型を再定義
 * する。CLI → TUI 側は bin でフィールド名ベースに橋渡しする。
 */
export interface TuiArgs {
  url: string;
  headed: boolean;
  role: string[] | undefined;
  wait: "none" | "network-idle";
  idleTime: number;
  timeout: number;
}

export interface BrowserHandle {
  newCDPSessionForUrl(url: string): Promise<MinimalCDPSession>;
  close(): Promise<void>;
}

export type BrowserFactory = (opts: { headed: boolean }) => Promise<BrowserHandle>;

export interface TuiRenderResult {
  waitUntilExit(): Promise<void>;
  unmount(): void;
}

export type TuiRenderer = (
  node: ReturnType<typeof createElement>,
  opts?: { stdout?: NodeJS.WriteStream; stdin?: NodeJS.ReadStream; exitOnCtrlC?: boolean },
) => TuiRenderResult | Promise<TuiRenderResult>;

export interface TuiIO {
  stderr: { write(chunk: string): boolean };
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  isTTY: boolean;
  browserFactory: BrowserFactory;
  renderer: TuiRenderer;
  /** テスト用: A11yNode 取得処理を差し替える。 */
  extractor?: (session: MinimalCDPSession, args: TuiArgs) => Promise<A11yNode[]>;
}

async function defaultBrowserFactory(opts: { headed: boolean }): Promise<BrowserHandle> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext();
  return {
    async newCDPSessionForUrl(url: string): Promise<MinimalCDPSession> {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const session = await context.newCDPSession(page);
      return session as unknown as MinimalCDPSession;
    },
    async close(): Promise<void> {
      await browser.close();
    },
  };
}

async function defaultRender(
  node: ReturnType<typeof createElement>,
  opts?: { stdout?: NodeJS.WriteStream; stdin?: NodeJS.ReadStream; exitOnCtrlC?: boolean },
): Promise<TuiRenderResult> {
  const { render } = await import("ink");
  const instance = render(node, opts);
  return {
    waitUntilExit: () => instance.waitUntilExit(),
    unmount: () => instance.unmount(),
  };
}

async function defaultExtractor(session: MinimalCDPSession, args: TuiArgs): Promise<A11yNode[]> {
  const adapter = adaptCDPSession(session);
  if (args.wait === "network-idle") {
    await waitForNetworkIdle(adapter, {
      idleTime: args.idleTime,
      timeout: args.timeout,
    });
  }
  return extractA11yTree(adapter);
}

function isBrowserNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return msg.includes("Executable doesn't exist") || msg.includes("browserType.launch");
}

function applyRoleFilter(nodes: A11yNode[], roles: string[] | undefined): A11yNode[] {
  if (!roles || roles.length === 0) return nodes;
  const filtered = nodes.filter((n) => roles.includes(n.role));
  if (filtered.length === 0) return filtered;
  const minDepth = Math.min(...filtered.map((n) => n.depth));
  return filtered.map((n) => ({ ...n, depth: n.depth - minDepth }));
}

/**
 * TUI モードの実行エントリポイント。
 *
 * CLI と同じ引数を受け取り、Playwright 経由で AOM を抽出した後 Ink で
 * 描画する。`runCli` から `--tui` フラグ時に dynamic import される
 * ことを想定している。
 */
export async function runTui(args: TuiArgs, io: TuiIO): Promise<number> {
  const stderr = io.stderr;

  if (!io.isTTY) {
    stderr.write(
      "--tui モードは TTY 環境でのみ動作します。パイプや非対話環境ではご利用いただけません。\n",
    );
    return 2;
  }

  const browserFactory = io.browserFactory;
  const renderer = io.renderer;
  const extractor = io.extractor ?? defaultExtractor;

  let handle: BrowserHandle | undefined;
  try {
    handle = await browserFactory({ headed: args.headed });
    const session = await handle.newCDPSessionForUrl(args.url);
    const nodes = await extractor(session, args);

    const filteredNodes = applyRoleFilter(nodes, args.role);

    const element = createElement(App, {
      url: args.url,
      nodes: filteredNodes,
    });

    const instance = await renderer(element, {
      stdout: io.stdout,
      stdin: io.stdin,
      exitOnCtrlC: false,
    });

    await instance.waitUntilExit();
    return 0;
  } catch (error) {
    if (isBrowserNotFound(error)) {
      stderr.write(
        "Chromium が見つかりません。次を実行してください: npx playwright install chromium\n",
      );
    } else {
      stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    }
    return 1;
  } finally {
    await handle?.close();
  }
}

/**
 * プロダクション用の IO デフォルトを組み立てるヘルパー。
 * CLI 側の `--tui` dispatch から利用される。
 */
export function defaultTuiIO(): TuiIO {
  return {
    stderr: process.stderr,
    stdout: process.stdout,
    stdin: process.stdin,
    isTTY: process.stdout.isTTY === true && process.stdin.isTTY === true,
    browserFactory: defaultBrowserFactory,
    renderer: defaultRender,
  };
}
