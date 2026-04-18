/**
 * TUI リーダブルビュー描画のための行モデル (Phase 6.5)。
 *
 * `buildReaderView` が返す {@link ReaderSection} をフラットな行配列に展開する
 * 純粋関数を提供する。`ReaderList` はここで作られた {@link ReaderRow} を
 * `computeWindow` に流し込み、可視分だけを描画する。
 *
 * 各行は罫線 (separator) かノード (node) のどちらかで、いずれも描画時に
 * 使う **合計インデント段数** (`indent`) を持つ。`ReaderSection.depth`
 * (ランドマーク入れ子段数) と `ReaderItem.depth` (セクション内 depth) の
 * 合算をここで計算しておくことで、コンポーネント側はインデントの意味論を
 * 意識せずに済む。
 */

import { buildReaderView, type A11yNode } from "@aria-palina/core";

/** リーダブルビューのレンダー行。ランドマーク罫線 or ノード 1 行。 */
export type ReaderRow =
  | {
      kind: "separator";
      label: string;
      role: string;
      /** 描画時のインデント段数 (ランドマーク入れ子に応じて増える)。 */
      indent: number;
    }
  | {
      kind: "node";
      node: A11yNode;
      /** 描画時のインデント段数 (罫線より 1 段深い)。 */
      indent: number;
      nodeIndex: number;
    };

export interface ReaderRowsResult {
  /** フラット化された行配列。separator と node が混在する。 */
  rows: ReaderRow[];
  /** A11yNode インデックス → `rows` 上のインデックスへの参照表。 */
  nodeIndexToRow: Map<number, number>;
}

/**
 * `A11yNode[]` から `ReaderRow[]` を構築する純粋関数。
 *
 * - 各セクションの先頭に `kind: "separator"` 行を挿入する。
 *   (ランドマーク無しセクションでは罫線を出さないため separator も挿入しない)
 * - 各アイテムは `kind: "node"` 行として、事前計算済みの `indent` を持つ。
 *   `indent = (section.depth + 1) + item.depth` (ランドマーク有セクション) /
 *   `indent = item.depth` (暗黙セクション)
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
        indent: section.depth,
      });
    }
    const itemBaseIndent = section.landmark !== null ? section.depth + 1 : section.depth;
    for (const item of section.items) {
      const nodeIndex = nodeToIndex.get(item.node);
      if (nodeIndex === undefined) continue;
      const rowIndex = rows.length;
      rows.push({
        kind: "node",
        node: item.node,
        indent: itemBaseIndent + item.depth,
        nodeIndex,
      });
      nodeIndexToRow.set(nodeIndex, rowIndex);
    }
  }

  return { rows, nodeIndexToRow };
}
