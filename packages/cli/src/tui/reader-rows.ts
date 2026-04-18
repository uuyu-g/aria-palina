/**
 * TUI リーダブルビュー描画のための行モデル (Phase 6.5)。
 *
 * `buildReaderView` が返す {@link ReaderSection} をフラットな行配列に展開する
 * 純粋関数を提供する。`ReaderList` はここで作られた {@link ReaderRow} を
 * `computeWindow` に流し込み、可視分だけを描画する。
 *
 * 描画は「左レール半ボックス」方式を採用する (候補 B、閉じない派)。
 * - ランドマーク境界は `┌── label` (その rail 位置で最初のセクション) か
 *   `├── label` (同一 or 浅い rail に既出セクションがある場合) で始まる行。
 * - 各行の左側に祖先ランドマーク数だけ `│ ` のレールを垂らす。
 * - 閉じ (`└──`) は出さない。ライブ更新・ストリーミング時の再描画が破綻
 *   しないため。
 */

import { buildReaderView, type A11yNode } from "@aria-palina/core";

/** リーダブルビューのレンダー行。ランドマーク罫線 or ノード 1 行。 */
export type ReaderRow =
  | {
      kind: "separator";
      label: string;
      role: string;
      /** 祖先ランドマーク段数 = 描画時の左レール本数。 */
      rails: number;
      /**
       * セクション見出しの開閉種別。
       * - `"open"` — この rail 位置で初めて開くセクション (`┌──`)
       * - `"continue"` — 同 or 浅い rail に既に別のセクションがあった
       *   (`├──`、兄弟 or 外側への戻り)
       */
      variant: "open" | "continue";
    }
  | {
      kind: "node";
      node: A11yNode;
      nodeIndex: number;
      /** 祖先ランドマーク段数 = 描画時の左レール本数。 */
      rails: number;
      /** セクション内の相対インデント (スペース段数、item.depth と同値)。 */
      extraIndent: number;
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
 * variant 判定ルール: 直前に発行した separator の rail 位置を記録しておき、
 * `lastRail < section.depth` なら入れ子 (`"open"`) で `┌──` を描く。
 * 等しいか浅い場合は「同一 rail に既存の章がある」状態なので `"continue"`
 * で `├──` を描く。
 */
export function toReaderRows(nodes: readonly A11yNode[]): ReaderRowsResult {
  const sections = buildReaderView(nodes);
  const rows: ReaderRow[] = [];
  const nodeIndexToRow = new Map<number, number>();

  // `buildReaderView` が保持する `ReaderItem.node` は元配列の参照と同一だが、
  // ここでは cursor 変換のため nodes 配列上のインデックスが必要。
  const nodeToIndex = new Map<A11yNode, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeToIndex.set(nodes[i] as A11yNode, i);
  }

  let lastSeparatorRail = -1;
  for (const section of sections) {
    if (section.landmark !== null) {
      const variant: "open" | "continue" = lastSeparatorRail < section.depth ? "open" : "continue";
      rows.push({
        kind: "separator",
        label: section.label,
        role: section.landmark.role,
        rails: section.depth,
        variant,
      });
      lastSeparatorRail = section.depth;
    }
    // ランドマーク配下のアイテムは section.depth + 1 本のレールを持つ。
    // 暗黙セクション (landmark: null) の配下はそもそもランドマーク囲みが無い
    // ため、レール 0 本・item.depth だけで描画する。
    const itemRails = section.landmark !== null ? section.depth + 1 : 0;
    for (const item of section.items) {
      const nodeIndex = nodeToIndex.get(item.node);
      if (nodeIndex === undefined) continue;
      rows.push({
        kind: "node",
        node: item.node,
        nodeIndex,
        rails: itemRails,
        extraIndent: item.depth,
      });
      nodeIndexToRow.set(nodeIndex, rows.length - 1);
    }
  }

  return { rows, nodeIndexToRow };
}
