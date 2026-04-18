import os from "node:os";
import path from "node:path";
import type { A11yNode, AXUpdateCause, AXUpdateSubscription, ICDPClient } from "@aria-palina/core";
import {
  clearHighlight,
  delay,
  diffLiveRegions,
  disableOverlay,
  enableOverlay,
  extractA11yTree,
  highlightNode,
  scrollIntoView,
  subscribeAXTreeUpdates,
  waitForFunction,
  waitForNetworkIdle,
  waitForSelector,
} from "@aria-palina/core";
import type { LiveChange } from "@aria-palina/core";
import { createElement } from "react";
import type { MinimalCDPSession } from "../playwright-cdp-adapter.js";
import { adaptCDPSession } from "../playwright-cdp-adapter.js";
import { App } from "./components/App.js";
import type { HighlightController } from "./use-highlight.js";

/**
 * TUI が利用する CLI 引数の最小形。
 *
 * `CliArgs` (../args.ts) の構造的部分集合。テストが巨大な CliArgs を
 * 組み立てる必要がないよう、必要なフィールドだけの型として公開している。
 */
export interface TuiArgs {
  url: string;
  headed: boolean;
  role: string[] | undefined;
  wait: "none" | "network-idle";
  idleTime: number;
  timeout: number;
  persist: boolean;
  userDataDir: string | undefined;
  waitForSelector?: string | undefined;
  waitForFunction?: string | undefined;
  delay?: number;
  /** DOM 変化での自動再取得を有効にするか。@default true */
  live?: boolean;
}

export interface BrowserHandle {
  newCDPSessionForUrl(url: string): Promise<MinimalCDPSession>;
  close(): Promise<void>;
}

export interface BrowserFactoryOptions {
  headed: boolean;
  persist: boolean;
  userDataDir: string | undefined;
}

export type BrowserFactory = (opts: BrowserFactoryOptions) => Promise<BrowserHandle>;

/**
 * `--user-data-dir` 未指定かつ永続化有効時のデフォルトプロファイルパス。
 * CLI 側の `defaultUserDataDir` と揃えて `~/.palina/profile` に固定する。
 */
export function defaultUserDataDir(): string {
  return path.join(os.homedir(), ".palina", "profile");
}

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

/**
 * TUI の App に渡す「ライブ更新ブリッジ」。
 *
 * App 側は `subscribe` でリスナを登録し、ブラウザ側の非同期変化を受け取って
 * `nodes` state を差し替える。`refresh` は `r` キー、`toggleLive` は `L` キー
 * に対応する。CDP 購読の生ライフサイクルは `runTui` が完全に握り、App は
 * ブリッジ越しにしか触らない。
 */
export interface LiveUpdate {
  nodes: A11yNode[];
  cause: AXUpdateCause;
  liveChanges: LiveChange[];
}

export interface LiveBridge {
  getSnapshot(): A11yNode[];
  subscribe(listener: (update: LiveUpdate) => void): () => void;
  refresh(): Promise<void>;
  toggleLive(): Promise<boolean>;
  isLiveEnabled(): boolean;
}

async function defaultBrowserFactory(opts: BrowserFactoryOptions): Promise<BrowserHandle> {
  const { chromium } = await import("playwright-core");
  // headed 時は viewport を null にして OS ウィンドウサイズに追従させる
  // (Playwright 既定の 1280x720 固定だとリサイズしてもレスポンシブが効かないため)
  const viewport = opts.headed ? null : { width: 1280, height: 720 };
  const headless = !opts.headed;

  if (opts.persist) {
    const dir = opts.userDataDir ?? defaultUserDataDir();
    const context = await chromium.launchPersistentContext(dir, { headless, viewport });
    return {
      async newCDPSessionForUrl(url: string): Promise<MinimalCDPSession> {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const session = await context.newCDPSession(page);
        return session as unknown as MinimalCDPSession;
      },
      async close(): Promise<void> {
        await context.close();
      },
    };
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport });
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
  if (args.waitForSelector !== undefined) {
    await waitForSelector(adapter, args.waitForSelector, { timeout: args.timeout });
  }
  if (args.waitForFunction !== undefined) {
    await waitForFunction(adapter, args.waitForFunction, { timeout: args.timeout });
  }
  if (args.delay !== undefined && args.delay > 0) {
    await delay(args.delay);
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

function safeIgnore(p: Promise<unknown>): Promise<void> {
  return p.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * `--headed` 時に App へ渡す HighlightController。
 * CDP コマンドはすべて fire-and-forget で発行する。ブラウザが既に閉じられて
 * いた場合の失敗は TUI 描画を壊さないよう握りつぶすが、**最初の 1 回**の
 * 失敗だけは `onFirstError` で通知する。ユーザーが「ハイライトされない」
 * 問題に気付けるようにするため、`runTui` の finally でまとめて stderr に
 * 書き出す。
 *
 * `highlight()` は overlay 描画と同時に `DOM.scrollIntoViewIfNeeded` も
 * 並行発行し、対象要素がビューポート外にある場合はブラウザ側でもスクロール
 * させて TUI カーソルと視覚的に揃える。
 */
function createHighlightController(
  adapter: ICDPClient,
  onFirstError: (error: unknown) => void,
): HighlightController {
  let errorReported = false;
  const onError = (error: unknown): void => {
    if (errorReported) return;
    errorReported = true;
    onFirstError(error);
  };
  return {
    highlight(backendNodeId: number) {
      void highlightNode(adapter, backendNodeId).catch(onError);
      void scrollIntoView(adapter, backendNodeId).catch(onError);
    },
    clear() {
      void clearHighlight(adapter).catch(onError);
    },
  };
}

interface LiveBridgeInternals {
  bridge: LiveBridge;
  startup(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * {@link LiveBridge} を構築し、`subscribeAXTreeUpdates` の購読ライフサイクルを
 * 管理する。ライブ OFF 時は購読せず、`refresh()` だけが有効になる。
 * 購読開始 (`startup`) と解除 (`shutdown`) は `runTui` が握る。
 */
function createLiveBridge(
  adapter: ICDPClient,
  args: TuiArgs,
  initialNodes: A11yNode[],
): LiveBridgeInternals {
  let currentNodes = initialNodes;
  let isLive = args.live !== false;
  let subscription: AXUpdateSubscription | null = null;
  const listeners = new Set<(u: LiveUpdate) => void>();

  const notify = (nodes: A11yNode[], cause: AXUpdateCause): void => {
    const filtered = applyRoleFilter(nodes, args.role);
    const liveChanges = diffLiveRegions(currentNodes, filtered);
    currentNodes = filtered;
    for (const l of listeners) l({ nodes: filtered, cause, liveChanges });
  };

  async function ensureSubscribed(): Promise<void> {
    if (subscription || !isLive) return;
    try {
      subscription = await subscribeAXTreeUpdates(adapter, notify);
    } catch {
      // 購読失敗時は live OFF 状態にフォールバック
      isLive = false;
    }
  }

  async function teardown(): Promise<void> {
    const s = subscription;
    subscription = null;
    if (s) await safeIgnore(s.unsubscribe());
  }

  const bridge: LiveBridge = {
    getSnapshot: () => currentNodes,
    subscribe(listener) {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    async refresh(): Promise<void> {
      try {
        const fresh = await extractA11yTree(adapter);
        notify(fresh, "manual");
      } catch {
        // ブラウザが閉じられた等のエラーは握りつぶす
      }
    },
    async toggleLive(): Promise<boolean> {
      isLive = !isLive;
      if (isLive) await ensureSubscribed();
      else await teardown();
      return isLive;
    },
    isLiveEnabled: () => isLive,
  };

  return { bridge, startup: ensureSubscribed, shutdown: teardown };
}

/**
 * TUI モードの実行エントリポイント。
 *
 * CLI と同じ引数を受け取り、Playwright 経由で AOM を抽出した後 Ink で
 * 描画する。`runCli` から `--tui` フラグ時に dynamic import される
 * ことを想定している。
 *
 * `args.live !== false` のとき、初回抽出後に {@link subscribeAXTreeUpdates}
 * で DOM/Page イベントを購読し、ブラウザ側の非同期変化に追従する。App は
 * {@link LiveBridge} を介して更新を受け取り、`r` / `L` キーで手動再取得
 * とライブトグルをユーザーに提供する。
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
  let highlightController: HighlightController | null = null;
  let highlightAdapter: ICDPClient | null = null;
  let highlightFirstError: unknown = null;
  let live: LiveBridgeInternals | null = null;
  try {
    handle = await browserFactory({
      headed: args.headed,
      persist: args.persist,
      userDataDir: args.userDataDir,
    });
    const session = await handle.newCDPSessionForUrl(args.url);
    const nodes = await extractor(session, args);

    const filteredNodes = applyRoleFilter(nodes, args.role);
    const adapter = adaptCDPSession(session);
    live = createLiveBridge(adapter, args, filteredNodes);
    // 初回購読。購読対象が DOM/Page ドメインであり、Overlay とは独立。
    await live.startup();

    if (args.headed) {
      highlightAdapter = adapter;
      try {
        await enableOverlay(highlightAdapter);
        highlightController = createHighlightController(highlightAdapter, (error) => {
          if (highlightFirstError === null) highlightFirstError = error;
        });
      } catch (error) {
        // Overlay enable に失敗しても TUI 起動自体は止めない。ただし理由を
        // 終了時に stderr へ表示してユーザーが原因を追えるようにする。
        highlightAdapter = null;
        highlightFirstError = error;
      }
    }

    const element = createElement(App, {
      url: args.url,
      nodes: filteredNodes,
      liveBridge: live.bridge,
      highlightController,
    });

    const instance = await renderer(element, {
      stdout: io.stdout,
      stdin: io.stdin,
      exitOnCtrlC: false,
    });

    await instance.waitUntilExit();
    await live.shutdown();
    if (highlightAdapter !== null) {
      await safeIgnore(clearHighlight(highlightAdapter));
      await safeIgnore(disableOverlay(highlightAdapter));
    }
    if (args.headed && highlightFirstError !== null) {
      const msg =
        highlightFirstError instanceof Error
          ? highlightFirstError.message
          : String(highlightFirstError);
      stderr.write(`ハイライト同期が失敗しました: ${msg}\n`);
    }
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
    if (live) await safeIgnore(live.shutdown());
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
