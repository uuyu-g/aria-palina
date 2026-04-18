import type { GetFullAXTreeResult, RawAXNode } from "./ax-protocol.js";
import type { ICDPClient } from "./cdp-client.js";

export interface AXStableOptions {
  /** ポーリング間隔 (ms)。@default 200 */
  interval?: number;
  /** 同じフィンガープリントが連続で何回一致したら「安定」とみなすか。@default 3 */
  stableCount?: number;
  /** 最大待機時間 (ms)。超過時は未達でも resolve する。@default 5_000 */
  timeout?: number;
}

const DEFAULT_INTERVAL = 200;
const DEFAULT_STABLE_COUNT = 3;
const DEFAULT_TIMEOUT = 5_000;

function fingerprint(nodes: readonly RawAXNode[]): string {
  // AX ツリーの「形」を軽量に要約する。nodeId + role + ignored の組で十分な
  // 差分検出力があり、getFullAXTree が返す大量のプロパティ全体を直列化
  // するよりも CPU コストを抑えられる。
  let out = "";
  for (const n of nodes) {
    const role = typeof n.role?.value === "string" ? n.role.value : "";
    out += `${n.nodeId}:${role}:${n.ignored ? 1 : 0};`;
  }
  return out;
}

/**
 * AX ツリーを {@link AXStableOptions.interval | interval} ms 間隔でポーリング
 * し、ツリーのフィンガープリントが {@link AXStableOptions.stableCount | stableCount}
 * 回連続で同一になったら resolve する。
 *
 * ネットワーク/DOM イベントに依存しないため、`setTimeout` 系の純粋な JS 駆動の
 * 非同期レンダリング (`requestIdleCallback`, SPA 遷移後のクライアントレンダ等)
 * にも有効。{@link waitForNetworkIdle} と組み合わせて利用することを想定。
 *
 * ベストエフォート設計: `timeout` 超過でも reject せず `false` で resolve する。
 *
 * @returns 安定化達成なら `true`、タイムアウトなら `false`。
 */
export async function waitForAXStable(
  cdp: ICDPClient,
  options?: AXStableOptions,
): Promise<boolean> {
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const stableCount = options?.stableCount ?? DEFAULT_STABLE_COUNT;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  const deadline = Date.now() + timeout;
  let last: string | null = null;
  let matches = 0;

  while (Date.now() < deadline) {
    const { nodes } = await cdp.send<GetFullAXTreeResult>("Accessibility.getFullAXTree");
    const fp = fingerprint(nodes);
    if (fp === last) {
      matches++;
      if (matches >= stableCount) return true;
    } else {
      last = fp;
      matches = 1;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise<void>((r) => setTimeout(r, Math.min(interval, remaining)));
  }

  return false;
}
