/**
 * TUI リーダブルビュー描画のための行モデル (Phase 6.5)。
 *
 * `buildReaderView` が返す {@link ReaderSection} をフラットな行配列に展開する
 * 純粋関数を提供する。`ReaderList` はここで作られた {@link ReaderRow} を
 * {@link computeWindow} に流し込み、可視分だけを描画する。
 *
 * 分離方針:
 *
 * - フラット化・cursor → row index マッピング・depth 再採番はここで完結する
 *   純粋関数として実装する (Ink/React 非依存)。
 * - Ink コンポーネントは `toReaderRows(nodes)` の戻り値を `slice` して
 *   描画するだけに留める。
 */

import { buildReaderView, type A11yNode } from "@aria-palina/core";

/** リーダブルビューのレンダー行。ランドマーク区切りの罫線 or ノード 1 行。 */
export type ReaderRow =
  | { kind: "separator"; label: string; role: string }
  | { kind: "node"; node: A11yNode; depth: number; nodeIndex: number };

export interface ReaderRowsResult {
  /** フラット化された行配列。separator と node が混在する。 */
  rows: ReaderRow[];
  /** A11yNode インデックス → `rows` 上のインデックスへの参照表。 */
  nodeIndexToRow: Map<number, number>;
}

/**
 * `A11yNode[]` から `ReaderRow[]` を構築する純粋関数。
 *
 * - 各セクションの先頭に `kind: "separator"` 行を挿入する (ランドマーク無し
 *   セクションでは罫線を出さないため separator も挿入しない)。
 * - 各アイテムは `kind: "node"` 行として、rebased depth と
 *   元の A11yNode インデックス (`nodeIndex`) を持つ。
 * - `nodeIndexToRow` は cursor が A11yNode インデックスで管理されている前提で、
 *   それを row インデックスへ変換するためのマップ。
 */
export function toReaderRows(nodes: readonly A11yNode[]): ReaderRowsResult {
  const sections = buildReaderView(nodes);
  const rows: ReaderRow[] = [];
  const nodeIndexToRow = new Map<number, number>();

  // `buildReaderView` が保持する `ReaderItem.node` は元配列の参照と同一だが、
  // ここでは cursor 変換のため nodes 配列上のインデックスが必要。
  // 参照の identity を Map に逆引きさせる。
  const nodeToIndex = new Map<A11yNode, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeToIndex.set(nodes[i] as A11yNode, i);
  }

  for (const section of sections) {
    if (section.landmark !== null) {
      rows.push({
        kind: "separator",
        label: section.label,
        role: section.landmark.role,
      });
    }
    for (const item of section.items) {
      const nodeIndex = nodeToIndex.get(item.node);
      if (nodeIndex === undefined) continue;
      const rowIndex = rows.length;
      rows.push({ kind: "node", node: item.node, depth: item.depth, nodeIndex });
      nodeIndexToRow.set(nodeIndex, rowIndex);
    }
  }

  return { rows, nodeIndexToRow };
}
