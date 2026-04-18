import type { ICDPClient } from "./cdp-client.js";

export interface WaitConditionOptions {
  /** ポーリング間隔 (ms)。@default 100 */
  interval?: number;
  /** 最大待機時間 (ms)。@default 10_000 */
  timeout?: number;
}

interface RuntimeEvalResult {
  result?: { type: string; value?: unknown };
}

const DEFAULT_INTERVAL = 100;
const DEFAULT_TIMEOUT = 10_000;

async function pollTruthy(
  cdp: ICDPClient,
  expression: string,
  opts?: WaitConditionOptions,
): Promise<boolean> {
  const interval = opts?.interval ?? DEFAULT_INTERVAL;
  const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const res = await cdp.send<RuntimeEvalResult>("Runtime.evaluate", {
        expression,
        returnByValue: true,
      });
      if (res.result && res.result.value) return true;
    } catch {
      // 評価エラーはリトライ対象 (ロード中で document 未確立のケース等)
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise<void>((r) => setTimeout(r, Math.min(interval, remaining)));
  }
  return false;
}

/**
 * CDP `Runtime.evaluate` で `document.querySelector(selector) !== null` を
 * 真になるまでポーリングする。
 *
 * タイムアウト時は例外を投げず `false` を返すベストエフォート方針
 * ({@link waitForNetworkIdle} と同じ挙動)。
 */
export async function waitForSelector(
  cdp: ICDPClient,
  selector: string,
  options?: WaitConditionOptions,
): Promise<boolean> {
  // JSON.stringify でクォート/エスケープ処理を委譲する。
  const expression = `!!document.querySelector(${JSON.stringify(selector)})`;
  return pollTruthy(cdp, expression, options);
}

/**
 * ユーザー指定の JS 式 (真偽値を返す) を `Runtime.evaluate` で繰り返し評価し、
 * 真になるまで待つ。SPA の Redux ストア監視や data 属性確認などに使える。
 */
export async function waitForFunction(
  cdp: ICDPClient,
  expression: string,
  options?: WaitConditionOptions,
): Promise<boolean> {
  // 式がステートメントであっても評価できるよう arrow 関数で包む。
  // 先頭が `(` や `function` のようなケースもそのまま expression として評価可能。
  const wrapped = `!!((() => { return (${expression}); })())`;
  return pollTruthy(cdp, wrapped, options);
}

/** 単純な固定スリープ (エスケープハッチ)。 */
export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((r) => setTimeout(r, ms));
}
