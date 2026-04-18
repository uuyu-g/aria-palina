/**
 * CDP `Overlay` ドメインを通じてブラウザ画面上の DOM 要素をハイライトする
 * 薄いラッパー群。
 *
 * Phase 6 (Matrix View / Headed モード同期) で TUI のカーソル位置を
 * `--headed` で起動した実ブラウザ画面に反映する (TUI → ブラウザの
 * 片方向同期) ために使う。
 *
 * 本モジュールは {@link ICDPClient} だけに依存し、Playwright や
 * `chrome.debugger` といった具体実装には依存しない。アダプタ層は
 * `enableOverlay` を一度呼んだ後、カーソル変更時に `highlightNode` を
 * 呼び、終了時に `clearHighlight` (および必要なら `disableOverlay`) を
 * 呼ぶ責務を負う。
 *
 * @see ../../../docs/dd.md §3.3 「Matrix View (Headed モード同期)」
 */

import type { ICDPClient } from "./cdp-client.js";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  /** 0〜1。CDP の `Overlay.RGBA.a` は省略可能。 */
  a?: number;
}

export interface HighlightConfig {
  /** ノードの content box を塗る色。@default `{ r: 0, g: 120, b: 255, a: 0.5 }` */
  contentColor?: RGBA;
  /** ノードの padding 領域を塗る色。 */
  paddingColor?: RGBA;
  /** ノードの border 領域を塗る色。 */
  borderColor?: RGBA;
  /** ノードの margin 領域を塗る色。 */
  marginColor?: RGBA;
}

const DEFAULT_CONTENT_COLOR: RGBA = { r: 0, g: 120, b: 255, a: 0.5 };

/**
 * `Overlay` ドメインを enable する。`highlightNode` を呼ぶ前に
 * 1 度だけ呼べばよい (CDP 仕様上、複数回呼んでも冪等)。
 *
 * `Overlay.highlightNode` は内部で DOM ノードツリーを引くため、
 * Chromium の実装上 `DOM` ドメインが有効化されていないと backendNodeId
 * から実際の要素を解決できない (ハイライトが出ない)。そのため本関数は
 * `DOM.enable` も併せて発行する。Chrome DevTools 本体も同様の順序で
 * 有効化しており、この組み合わせがハイライト動作の前提となる。
 */
export async function enableOverlay(cdp: ICDPClient): Promise<void> {
  await cdp.send("DOM.enable");
  await cdp.send("Overlay.enable");
}

/**
 * `Overlay` ドメインを disable する。アプリ終了時など、ブラウザを
 * 引き続き使うが overlay だけ片付けたい場合に呼ぶ。
 */
export async function disableOverlay(cdp: ICDPClient): Promise<void> {
  await cdp.send("Overlay.disable");
}

/**
 * 指定した backendNodeId の DOM 要素にハイライトを描画する。
 *
 * `backendNodeId === 0` の場合は no-op。`flattenAXTree` は
 * `backendDOMNodeId` が無いノード (text node など) に対して 0 を
 * フォールバック値として格納するため、ハイライト不能なノードは
 * ここで黙って無視する。
 */
export async function highlightNode(
  cdp: ICDPClient,
  backendNodeId: number,
  config?: HighlightConfig,
): Promise<void> {
  if (backendNodeId === 0) return;
  await cdp.send("Overlay.highlightNode", {
    highlightConfig: {
      contentColor: config?.contentColor ?? DEFAULT_CONTENT_COLOR,
      ...(config?.paddingColor !== undefined && { paddingColor: config.paddingColor }),
      ...(config?.borderColor !== undefined && { borderColor: config.borderColor }),
      ...(config?.marginColor !== undefined && { marginColor: config.marginColor }),
    },
    backendNodeId,
  });
}

/**
 * 現在表示中のハイライトを消去する。ハイライトが無い状態で呼んでも
 * エラーにはならない (CDP 仕様)。
 */
export async function clearHighlight(cdp: ICDPClient): Promise<void> {
  await cdp.send("Overlay.hideHighlight");
}

/**
 * 指定した backendNodeId の DOM 要素がビューポート内に入るようにスクロールする。
 *
 * TUI カーソルの移動に追従してブラウザ側も同じ要素が見える状態を維持するために
 * 使う。既に画面内にある要素の場合は CDP 実装側が no-op として扱うため、毎回
 * 呼び出してもコストは最小限に抑えられる。
 *
 * `backendNodeId === 0` の場合は no-op (`highlightNode` と同じポリシー)。
 */
export async function scrollIntoView(cdp: ICDPClient, backendNodeId: number): Promise<void> {
  if (backendNodeId === 0) return;
  await cdp.send("DOM.scrollIntoViewIfNeeded", { backendNodeId });
}
