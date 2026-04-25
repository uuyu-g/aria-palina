import os from "node:os";
import path from "node:path";
import type { BrowserFactory, BrowserFactoryOptions, BrowserHandle } from "./browser-types.js";
import type { MinimalCDPSession } from "./playwright-cdp-adapter.js";

/**
 * `--user-data-dir` 未指定かつ永続化有効時のデフォルトプロファイルパス。
 * `~/.palina/profile` に固定。存在しなければ Playwright が自動生成する。
 */
export function defaultUserDataDir(): string {
  return path.join(os.homedir(), ".palina", "profile");
}

/**
 * Playwright Chromium をバックエンドとするデフォルトの BrowserFactory。
 * CLI / TUI 双方から共有される。`--headed` / `--persist` / `--user-data-dir`
 * をオプションで受け取り、共通の `BrowserHandle` を返す。
 */
export const defaultBrowserFactory: BrowserFactory = async (
  opts: BrowserFactoryOptions,
): Promise<BrowserHandle> => {
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
        // launchPersistentContext は起動時に空タブを 1 つ自動で開く。
        // そのページを再利用し、見えない空タブが残らないようにする。
        const existing = context.pages()[0];
        const page = existing ?? (await context.newPage());
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
};

/** Playwright の `browserType.launch` 失敗を「Chromium 未インストール」と判定する。 */
export function isBrowserNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return msg.includes("Executable doesn't exist") || msg.includes("browserType.launch");
}
