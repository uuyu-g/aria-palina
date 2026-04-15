/**
 * 仮想スクロールの可視レンジを算出する純粋関数。
 *
 * DD §3.2 の疑似コードを補正し、末尾付近でもビューポートを埋められる
 * ようにする。戻り値の `[start, end)` は half-open。`cursor` は常に
 * `[start, end)` に含まれる (total が 0 の場合を除く)。
 *
 * @see ../../../docs/dd.md §3.2 「TUI のパフォーマンス最適化 (Windowing)」
 */
export interface VirtualWindowInput {
  /** 全ノード数。 */
  total: number;
  /** 現在のカーソル位置 (0 <= cursor < total 前提)。 */
  cursor: number;
  /** ビューポート行数 (1 以上)。 */
  viewport: number;
}

export interface VirtualWindow {
  /** 可視範囲の開始インデックス (含む)。 */
  start: number;
  /** 可視範囲の終了インデックス (含まない)。 */
  end: number;
}

export function computeWindow(input: VirtualWindowInput): VirtualWindow {
  const total = Math.max(0, input.total);
  if (total === 0) return { start: 0, end: 0 };

  const viewport = Math.max(1, input.viewport);
  const cursor = Math.max(0, Math.min(total - 1, input.cursor));
  const half = Math.floor(viewport / 2);

  let start = Math.max(0, cursor - half);
  let end = Math.min(total, start + viewport);
  // 末尾付近で start + viewport が total を超えた場合、start を前詰めする。
  start = Math.max(0, end - viewport);
  end = Math.min(total, start + viewport);

  return { start, end };
}
