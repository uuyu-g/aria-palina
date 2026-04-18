/**
 * TUI からブラウザへ発火するインタラクション系 CDP コマンドの薄いラッパー群。
 *
 * NVDA の確定操作 (`Enter` クリック / `Space` トグル) を再現するため、
 * `Accessibility` ドメインのノード id ではなく `DOM` ドメインの
 * `backendNodeId` を直接扱い、実要素の座標に対して `Input.dispatchMouseEvent`
 * を発行する。`Runtime.evaluate` で `element.click()` を呼ぶ方式は
 * `pointer-events: none` やフレームワーク側の合成イベントと整合しない
 * ため採用しない。
 *
 * 本モジュールは {@link ICDPClient} にのみ依存する純粋な CDP 呼び出し層で、
 * CLI ワンショット (`packages/cli/src/run.ts`) からは import されない。
 * TUI (`packages/cli/src/tui/*`) と Chrome Extension (Phase 7) で共有される。
 *
 * @see ../../../docs/proposals/tui-interaction.md §3 Stage 1
 */

import type { ICDPClient } from "./cdp-client.js";

/**
 * `DOM.getBoxModel` のレスポンス型 (必要な部分だけ)。
 *
 * `content` は要素のコンテンツボックスを表す 4 点 (x1,y1,x2,y2,x3,y3,x4,y4)
 * を時計回りに並べた長さ 8 の配列。中心座標は 4 点の算術平均で求める。
 */
interface BoxModelResult {
  model: {
    content: number[];
  };
}

function centerOfContent(content: number[]): { x: number; y: number } {
  const x0 = content[0] ?? 0;
  const y0 = content[1] ?? 0;
  const x1 = content[2] ?? 0;
  const y1 = content[3] ?? 0;
  const x2 = content[4] ?? 0;
  const y2 = content[5] ?? 0;
  const x3 = content[6] ?? 0;
  const y3 = content[7] ?? 0;
  return { x: (x0 + x1 + x2 + x3) / 4, y: (y0 + y1 + y2 + y3) / 4 };
}

/**
 * 指定した `backendNodeId` の DOM 要素をクリックする。
 *
 * 内部処理:
 * 1. `DOM.scrollIntoViewIfNeeded` で要素を可視領域へスクロール。
 * 2. `DOM.getBoxModel` でコンテンツボックスの座標を取得。
 * 3. 中心座標に対して `Input.dispatchMouseEvent` の
 *    `mousePressed` → `mouseReleased` の組を発行。
 *
 * `backendNodeId === 0` の場合は no-op。`flattenAXTree` が
 * `backendDOMNodeId` 未設定のノード (text node 等) に 0 を入れる
 * 仕様に合わせ、クリック不能なノードは静かに無視する。
 */
export async function clickNode(cdp: ICDPClient, backendNodeId: number): Promise<void> {
  if (backendNodeId === 0) return;
  await cdp.send("DOM.scrollIntoViewIfNeeded", { backendNodeId });
  const { model } = await cdp.send<BoxModelResult>("DOM.getBoxModel", { backendNodeId });
  const { x, y } = centerOfContent(model.content);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

/**
 * 指定した `backendNodeId` の DOM 要素にフォーカスを移す。
 *
 * `DOM.focus` は focusable でない要素に対しては CDP 側でエラーになるが、
 * 呼び出し側の役割は「TUI の意図をブラウザへ伝えること」に限定し、
 * 失敗した場合の扱いは呼び出し側 (runTui 等) に委ねる。
 *
 * `backendNodeId === 0` の場合は no-op。
 */
export async function focusNode(cdp: ICDPClient, backendNodeId: number): Promise<void> {
  if (backendNodeId === 0) return;
  await cdp.send("DOM.focus", { backendNodeId });
}
