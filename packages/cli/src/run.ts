import {
  delay,
  extractA11yTree,
  waitForFunction,
  waitForNetworkIdle,
  waitForSelector,
} from "@aria-palina/core";
import type { CliArgs } from "./args.js";
import { parseCliArgs } from "./args.js";
import { formatJsonOutput, formatTextOutput } from "./formatter.js";
import type { MinimalCDPSession } from "./playwright-cdp-adapter.js";
import { adaptCDPSession } from "./playwright-cdp-adapter.js";

export interface BrowserHandle {
  newCDPSessionForUrl(url: string): Promise<MinimalCDPSession>;
  close(): Promise<void>;
}

export type BrowserFactory = (opts: { headed: boolean }) => Promise<BrowserHandle>;

/**
 * `--tui` フラグ時に実行される TUI ランナー。
 *
 * 既定では `./tui/index.js` (同一パッケージ内のサブツリー) を dynamic import
 * して `runTui` を差し込む。ワンショット実行時は Ink/React をロードしない
 * 設計。テストでは fake を注入する。
 */
export type TuiRunner = (args: CliArgs) => Promise<number>;

export interface RunIO {
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  isTTY: boolean;
  browserFactory: BrowserFactory;
  /** --tui 指定時に呼び出されるランナー。未指定時は `./tui/index.js` を dynamic import する。 */
  tuiRunner?: TuiRunner;
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

function isBrowserNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return msg.includes("Executable doesn't exist") || msg.includes("browserType.launch");
}

async function defaultTuiRunner(args: CliArgs): Promise<number> {
  const mod = await import("./tui/index.js");
  return mod.runTui(args, mod.defaultTuiIO());
}

export async function runCli(argv: readonly string[], io?: Partial<RunIO>): Promise<number> {
  const stdout = io?.stdout ?? process.stdout;
  const stderr = io?.stderr ?? process.stderr;
  const isTTY = io?.isTTY ?? process.stdout.isTTY === true;
  const browserFactory = io?.browserFactory ?? defaultBrowserFactory;
  const tuiRunner = io?.tuiRunner ?? defaultTuiRunner;

  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    const target = parsed.exitCode === 0 ? stdout : stderr;
    target.write(parsed.message + "\n");
    return parsed.exitCode;
  }

  const { args } = parsed;

  if (args.tui) {
    return tuiRunner(args);
  }

  const indent = args.indent ?? isTTY;
  const color = args.color ?? isTTY;

  let handle: BrowserHandle | undefined;
  try {
    handle = await browserFactory({ headed: args.headed });
    const session = await handle.newCDPSessionForUrl(args.url);
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
    if (args.delay > 0) {
      await delay(args.delay);
    }

    const nodes = await extractA11yTree(adapter);

    let outputNodes = nodes;
    if (args.role) {
      const roles = args.role;
      const filtered = nodes.filter((n) => roles.includes(n.role));
      if (filtered.length > 0) {
        const minDepth = Math.min(...filtered.map((n) => n.depth));
        outputNodes = filtered.map((n) => ({ ...n, depth: n.depth - minDepth }));
      } else {
        outputNodes = filtered;
      }
    }

    const output =
      args.format === "json"
        ? formatJsonOutput(outputNodes)
        : formatTextOutput(outputNodes, { indent, color });

    stdout.write(output + "\n");
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
