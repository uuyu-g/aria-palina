import { extractA11yTree, waitForNetworkIdle } from "@aria-palina/core";
import { parseCliArgs } from "./args.js";
import { formatJsonOutput, formatTextOutput } from "./formatter.js";
import type { MinimalCDPSession } from "./playwright-cdp-adapter.js";
import { adaptCDPSession } from "./playwright-cdp-adapter.js";

export interface BrowserHandle {
  newCDPSessionForUrl(url: string): Promise<MinimalCDPSession>;
  close(): Promise<void>;
}

export type BrowserFactory = (opts: { headed: boolean }) => Promise<BrowserHandle>;

export interface RunIO {
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  isTTY: boolean;
  browserFactory: BrowserFactory;
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

export async function runCli(argv: readonly string[], io?: Partial<RunIO>): Promise<number> {
  const stdout = io?.stdout ?? process.stdout;
  const stderr = io?.stderr ?? process.stderr;
  const isTTY = io?.isTTY ?? process.stdout.isTTY === true;
  const browserFactory = io?.browserFactory ?? defaultBrowserFactory;

  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    const target = parsed.exitCode === 0 ? stdout : stderr;
    target.write(parsed.message + "\n");
    return parsed.exitCode;
  }

  const { args } = parsed;

  if (args.tui) {
    stderr.write("--tui モードは Phase 4 で実装予定です。\n");
    return 2;
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

    const nodes = await extractA11yTree(adapter);

    const output =
      args.format === "json" ? formatJsonOutput(nodes) : formatTextOutput(nodes, { indent, color });

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
