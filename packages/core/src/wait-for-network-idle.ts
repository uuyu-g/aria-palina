import type { ICDPClient } from "./cdp-client.js";

export interface NetworkIdleOptions {
  /** アイドル判定の静穏時間 (ms)。この間インフライト 0 なら完了。@default 500 */
  idleTime?: number;
  /** 最大待機時間 (ms)。超過時はアイドル未達でも resolve する。@default 30_000 */
  timeout?: number;
  /** 無視する URL パターン (フォント等の長寿命リソース)。 */
  ignorePatterns?: RegExp[];
}

const DEFAULT_IDLE_TIME = 500;
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_IGNORE_PATTERNS: RegExp[] = [/\.(woff2?|ttf|otf|eot)(\?|$)/i];

interface RequestWillBeSentParams {
  requestId: string;
  request: { url: string };
}

interface LoadingEndParams {
  requestId: string;
}

/**
 * CDP Network ドメインのイベントを監視し、インフライトリクエストが
 * ゼロの状態が {@link NetworkIdleOptions.idleTime | idleTime} ms 持続した
 * 時点で resolve する。
 *
 * タイムアウトに達した場合もエラーを投げずに resolve する (ベストエフォート)。
 *
 * @returns idle 達成なら `true`、タイムアウトなら `false`。
 */
export async function waitForNetworkIdle(
  cdp: ICDPClient,
  options?: NetworkIdleOptions,
): Promise<boolean> {
  const idleTime = options?.idleTime ?? DEFAULT_IDLE_TIME;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const ignorePatterns = options?.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;

  await cdp.send("Network.enable");

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const inflight = new Map<string, string>(); // requestId → url
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let globalTimer: ReturnType<typeof setTimeout> | null = null;

    function cleanup(): void {
      if (idleTimer !== null) clearTimeout(idleTimer);
      if (globalTimer !== null) clearTimeout(globalTimer);
      cdp.off("Network.requestWillBeSent", onRequestStart);
      cdp.off("Network.loadingFinished", onRequestEnd);
      cdp.off("Network.loadingFailed", onRequestEnd);
      cdp.send("Network.disable").catch(() => {});
    }

    function settle(idleAchieved: boolean): void {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(idleAchieved);
    }

    function tryStartIdleTimer(): void {
      if (inflight.size > 0 || idleTimer !== null) return;
      idleTimer = setTimeout(() => settle(true), idleTime);
    }

    function shouldIgnore(url: string): boolean {
      return ignorePatterns.some((re) => re.test(url));
    }

    const onRequestStart = (params: unknown): void => {
      const { requestId, request } = params as RequestWillBeSentParams;
      if (shouldIgnore(request.url)) return;
      inflight.set(requestId, request.url);
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const onRequestEnd = (params: unknown): void => {
      const { requestId } = params as LoadingEndParams;
      inflight.delete(requestId);
      tryStartIdleTimer();
    };

    cdp.on("Network.requestWillBeSent", onRequestStart);
    cdp.on("Network.loadingFinished", onRequestEnd);
    cdp.on("Network.loadingFailed", onRequestEnd);

    globalTimer = setTimeout(() => settle(false), timeout);

    // 静的ページ (リクエスト 0) を即座に処理するため初回タイマーを起動
    tryStartIdleTimer();
  });
}
