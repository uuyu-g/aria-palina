import type { A11yNode } from "@aria-palina/core";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { toReaderRows } from "../reader-rows.js";
import { roleTextStyle } from "../role-style.js";
import { computeWindow } from "../virtual-window.js";
import { NodeRow } from "./NodeRow.js";

export interface ReaderListProps {
  nodes: A11yNode[];
  /** A11yNode 配列上のカーソル位置 (VirtualList と共通の規約)。 */
  cursor: number;
  viewport: number;
}

/** 左レール文字と角記号。CLI 側 `formatReaderTextOutput` と揃える。 */
const RAIL = "│ ";
const CORNER_OPEN = "┌── ";
const CORNER_CONTINUE = "├── ";

/**
 * リーダブルビュー (`view=reader`) のための仮想スクロールリスト。
 *
 * 「左レール半ボックス」方式で章立てを視覚化する:
 * - ランドマーク境界の見出し行 (`┌── banner` / `├── main` 等)
 * - 各行頭に祖先ランドマーク数ぶん `│ ` レールを垂らす
 * - 閉じ線 (`└──`) は出さない (ライブ更新で破綻させないため)
 *
 * cursor は従来通り `A11yNode[]` 上のインデックスで管理され、ナビゲーション
 * 挙動は VirtualList と同一 (separator 行は飛ばされる格好になる)。
 */
export function ReaderList({ nodes, cursor, viewport }: ReaderListProps) {
  const { rows, cursorRow } = useMemo(() => {
    const { rows, nodeIndexToRow } = toReaderRows(nodes);
    const mapped = nodeIndexToRow.get(cursor);
    return { rows, cursorRow: mapped ?? 0 };
  }, [nodes, cursor]);

  const { start, end } = useMemo(
    () => computeWindow({ total: rows.length, cursor: cursorRow, viewport }),
    [rows.length, cursorRow, viewport],
  );

  if (rows.length === 0) {
    return (
      <Box>
        <Text dimColor>(表示するノードがありません)</Text>
      </Box>
    );
  }

  const visible = rows.slice(start, end);

  return (
    <Box flexDirection="column">
      {visible.map((row, i) => {
        const globalRow = start + i;
        if (row.kind === "separator") {
          const style = roleTextStyle(row.role);
          const rails = RAIL.repeat(row.rails);
          const corner = row.variant === "open" ? CORNER_OPEN : CORNER_CONTINUE;
          return (
            <Text
              key={`sep-${globalRow}`}
              color={style.color}
              bold={style.bold}
              wrap="truncate-end"
            >
              {`${rails}${corner}${row.label}`}
            </Text>
          );
        }
        const selected = row.nodeIndex === cursor;
        const indentPrefix = RAIL.repeat(row.rails) + "  ".repeat(row.extraIndent);
        return (
          <NodeRow
            key={`${row.node.backendNodeId}-${row.nodeIndex}`}
            node={row.node}
            selected={selected}
            indentPrefix={indentPrefix}
          />
        );
      })}
    </Box>
  );
}
