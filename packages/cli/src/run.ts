import {
  delay,
  extractA11yTree,
  waitForFunction,
  waitForNetworkIdle,
  waitForSelector,
} from "@aria-palina/core";
import type { CliArgs } from "./args.js";
import { parseCliArgs } from "./args.js";
import { defaultBrowserFactory, isBrowserNotFound } from "./browser-factory.js";
import type { BrowserFactory, BrowserHandle } from "./browser-types.js";
import { normalizeDisplayOptions } from "./display-options.js";
import { formatJsonOutput, formatTextOutput } from "./formatter.js";
import { adaptCDPSession } from "./playwright-cdp-adapter.js";
import { applyRoleFilter } from "./role-filter.js";

export { defaultUserDataDir } from "./browser-factory.js";
export type { BrowserFactory, BrowserFactoryOptions, BrowserHandle } from "./browser-types.js";

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

  const { indent, color } = normalizeDisplayOptions(args, isTTY);

  let handle: BrowserHandle | undefined;
  try {
    handle = await browserFactory({
      headed: args.headed,
      persist: args.persist,
      userDataDir: args.userDataDir,
    });
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
    const outputNodes = applyRoleFilter(nodes, args.role);

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
