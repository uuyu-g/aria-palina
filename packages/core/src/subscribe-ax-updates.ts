import { extractA11yTree } from "./extract.js";
import type { ICDPClient } from "./cdp-client.js";
import type { FlattenOptions } from "./flatten.js";
import type { A11yNode } from "./types.js";

export type AXUpdateCause = "document" | "navigation" | "lifecycle" | "manual";

export interface AXUpdateSubscription {
  /** 購読を解除し、`DOM.disable` / `Page.disable` を送信する。 */
  unsubscribe(): Promise<void>;
  /** 強制的に再抽出を実行する (TUI の `r` キー等から呼ばれる)。 */
  refresh(): Promise<void>;
}

export interface AXUpdateOptions {
  /** イベント多発時のデバウンス (ms)。@default 200 */
  debounceMs?: number;
  /** `flattenAXTree` に渡すオプション。 */
  flatten?: FlattenOptions;
}

interface FrameNavigatedParams {
  frame: { id: string; parentId?: string };
}

interface LifecycleEventParams {
  name: string;
}

const DEFAULT_DEBOUNCE = 200;

/**
 * ページの DOM/Page イベントを購読して、変化が検出される度に AX ツリーを
 * 再抽出し {@link onUpdate} へ渡す。NVDA の「仮想バッファ自動更新」に相当する。
 *
 * 購読イベントは以下の 3 種。いずれかが届いた時点でデバウンスを張り、
 * {@link AXUpdateOptions.debounceMs | debounceMs} の静穏後に `extractA11yTree`
 * を呼んで `onUpdate` を発火する:
 *
 * - `DOM.documentUpdated` — 文書全体の再構築 (SPA ルーティング後など)
 * - `Page.frameNavigated` — メインフレームのナビゲーション
 * - `Page.lifecycleEvent` — `load` / `networkIdle` ライフサイクル
 *
 * 高頻度な `DOM.childNodeInserted/Removed` は負荷とノイズが大きいため意図的に
 * 購読対象から外している。細粒度変更は直後の `documentUpdated` か手動 refresh
 * (`subscription.refresh()`) で拾う設計。
 */
export async function subscribeAXTreeUpdates(
  cdp: ICDPClient,
  onUpdate: (nodes: A11yNode[], cause: AXUpdateCause) => void,
  options?: AXUpdateOptions,
): Promise<AXUpdateSubscription> {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE;
  const flattenOpts = options?.flatten;

  await cdp.send("DOM.enable");
  await cdp.send("Page.enable");

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingCause: AXUpdateCause | null = null;
  let extractInFlight: Promise<void> | null = null;
  let unsubscribed = false;

  async function runExtract(cause: AXUpdateCause): Promise<void> {
    if (unsubscribed) return;
    try {
      const nodes = await extractA11yTree(cdp, flattenOpts);
      if (unsubscribed) return;
      onUpdate(nodes, cause);
    } catch {
      // ブラウザが閉じられた / セッションが死んだ等は握りつぶす。
      // TUI 側は直前の nodes を表示し続ける。
    }
  }

  function schedule(cause: AXUpdateCause): void {
    if (unsubscribed) return;
    pendingCause = cause;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const c = pendingCause ?? cause;
      pendingCause = null;
      // 既に抽出中なら、それが終わってから再度実行 (最新状態を取り直すため)。
      if (extractInFlight) {
        extractInFlight = extractInFlight.then(() => runExtract(c));
      } else {
        extractInFlight = runExtract(c).finally(() => {
          extractInFlight = null;
        });
      }
    }, debounceMs);
  }

  const onDocumentUpdated = (): void => schedule("document");
  const onFrameNavigated = (params: unknown): void => {
    const { frame } = params as FrameNavigatedParams;
    // メインフレーム (parentId なし) のみ追従。iframe の遷移は無視する。
    if (!frame || frame.parentId) return;
    schedule("navigation");
  };
  const onLifecycleEvent = (params: unknown): void => {
    const { name } = params as LifecycleEventParams;
    if (name !== "load" && name !== "networkIdle") return;
    schedule("lifecycle");
  };

  cdp.on("DOM.documentUpdated", onDocumentUpdated);
  cdp.on("Page.frameNavigated", onFrameNavigated);
  cdp.on("Page.lifecycleEvent", onLifecycleEvent);

  return {
    async unsubscribe(): Promise<void> {
      if (unsubscribed) return;
      unsubscribed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      cdp.off("DOM.documentUpdated", onDocumentUpdated);
      cdp.off("Page.frameNavigated", onFrameNavigated);
      cdp.off("Page.lifecycleEvent", onLifecycleEvent);
      // DOM/Page ドメインは他のコンポーネント (例: headed モードの Overlay) が
      // 使っている可能性があるため disable は発行しない。
    },
    async refresh(): Promise<void> {
      if (unsubscribed) return;
      await runExtract("manual");
    },
  };
}
