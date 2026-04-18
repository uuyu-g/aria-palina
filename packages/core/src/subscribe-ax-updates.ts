import { extractA11yTree } from "./extract.js";
import type { ICDPClient } from "./cdp-client.js";
import type { FlattenOptions } from "./flatten.js";
import type { A11yNode } from "./types.js";

export type AXUpdateCause = "document" | "navigation" | "lifecycle" | "mutation" | "manual";

export interface AXUpdateSubscription {
  /** 購読を解除し、`DOM.disable` / `Page.disable` を送信する。 */
  unsubscribe(): Promise<void>;
  /** 強制的に再抽出を実行する (TUI の `r` キー等から呼ばれる)。 */
  refresh(): Promise<void>;
}

export interface AXUpdateOptions {
  /**
   * 粗粒度イベント (`DOM.documentUpdated` / `Page.frameNavigated` /
   * `Page.lifecycleEvent`) のデバウンス (ms)。@default 200
   */
  debounceMs?: number;
  /**
   * 細粒度 DOM mutation (`DOM.childNodeInserted` / `DOM.childNodeRemoved` /
   * `DOM.attributeModified`) のデバウンス (ms)。SPA のロード進行 (スケルトン →
   * 実データ、`aria-busy` トグル等) は高頻度に発火するため、粗粒度より長めに
   * 設定して連続変更をまとめる。@default 400
   */
  mutationDebounceMs?: number;
  /**
   * DOM mutation イベントを購読するか。ローディング進行の TUI 反映を担保する
   * ため既定で ON。更新頻度が極端に高いページ向けに粗粒度だけで運用したい
   * 場合は `false` にできる。@default true
   */
  subscribeMutations?: boolean;
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
const DEFAULT_MUTATION_DEBOUNCE = 400;

/**
 * 同一デバウンスウィンドウで複数のイベントが重なった際、どの `cause` を
 * `onUpdate` に通知するかを決める優先順位。より「確からしい」原因を残す:
 *
 * - `manual` は直接 `refresh()` から呼ばれるため常に最優先。
 * - `navigation` / `document` は「ページ全体の構造変化」の強いシグナル。
 * - `lifecycle` は `load` / `networkIdle` の節目。
 * - `mutation` は細粒度で発火数が多く、他シグナルがあればそちらを残す。
 */
const CAUSE_PRIORITY: Record<AXUpdateCause, number> = {
  manual: 5,
  navigation: 4,
  document: 3,
  lifecycle: 2,
  mutation: 1,
};

/**
 * ページの DOM/Page イベントを購読して、変化が検出される度に AX ツリーを
 * 再抽出し {@link onUpdate} へ渡す。NVDA の「仮想バッファ自動更新」に相当する。
 *
 * 購読イベントは次の 2 系統。デバウンスを張って静穏化後に `extractA11yTree`
 * を呼び `onUpdate` を発火する:
 *
 * **粗粒度** (`debounceMs` / 既定 200ms)
 * - `DOM.documentUpdated` — 文書全体の再構築 (SPA ルーティング後など)
 * - `Page.frameNavigated` — メインフレームのナビゲーション
 * - `Page.lifecycleEvent` — `load` / `networkIdle` ライフサイクル
 *
 * **細粒度** (`mutationDebounceMs` / 既定 400ms、`subscribeMutations: false` で OFF)
 * - `DOM.childNodeInserted` / `DOM.childNodeRemoved` — 部分再レンダリング
 * - `DOM.attributeModified` — `aria-busy` / `aria-expanded` 等の属性トグル
 *
 * 細粒度は SPA のロード進行 (スケルトン → 実データ差し替え等) を拾うために
 * 既定で ON にするが、発火頻度が高いため粗粒度より長めのデバウンスで連続
 * 変更をまとめて 1 回の再抽出に収束させる。複数イベントが重なった場合は
 * {@link CAUSE_PRIORITY} 順で最も意味のある cause を `onUpdate` に渡す。
 */
export async function subscribeAXTreeUpdates(
  cdp: ICDPClient,
  onUpdate: (nodes: A11yNode[], cause: AXUpdateCause) => void,
  options?: AXUpdateOptions,
): Promise<AXUpdateSubscription> {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE;
  const mutationDebounceMs = options?.mutationDebounceMs ?? DEFAULT_MUTATION_DEBOUNCE;
  const subscribeMutations = options?.subscribeMutations ?? true;
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

  function schedule(cause: AXUpdateCause, delayMs: number): void {
    if (unsubscribed) return;
    if (pendingCause === null || CAUSE_PRIORITY[cause] > CAUSE_PRIORITY[pendingCause]) {
      pendingCause = cause;
    }
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
    }, delayMs);
  }

  const onDocumentUpdated = (): void => schedule("document", debounceMs);
  const onFrameNavigated = (params: unknown): void => {
    const { frame } = params as FrameNavigatedParams;
    // メインフレーム (parentId なし) のみ追従。iframe の遷移は無視する。
    if (!frame || frame.parentId) return;
    schedule("navigation", debounceMs);
  };
  const onLifecycleEvent = (params: unknown): void => {
    const { name } = params as LifecycleEventParams;
    if (name !== "load" && name !== "networkIdle") return;
    schedule("lifecycle", debounceMs);
  };
  const onMutation = (): void => schedule("mutation", mutationDebounceMs);

  cdp.on("DOM.documentUpdated", onDocumentUpdated);
  cdp.on("Page.frameNavigated", onFrameNavigated);
  cdp.on("Page.lifecycleEvent", onLifecycleEvent);
  if (subscribeMutations) {
    cdp.on("DOM.childNodeInserted", onMutation);
    cdp.on("DOM.childNodeRemoved", onMutation);
    cdp.on("DOM.attributeModified", onMutation);
  }

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
      if (subscribeMutations) {
        cdp.off("DOM.childNodeInserted", onMutation);
        cdp.off("DOM.childNodeRemoved", onMutation);
        cdp.off("DOM.attributeModified", onMutation);
      }
      // DOM/Page ドメインは他のコンポーネント (例: headed モードの Overlay) が
      // 使っている可能性があるため disable は発行しない。
    },
    async refresh(): Promise<void> {
      if (unsubscribed) return;
      await runExtract("manual");
    },
  };
}
