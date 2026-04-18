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

/** ランドマーク区切りの罫線幅。CLI 側の `formatReaderTextOutput` と揃える。 */
const SEPARATOR_DASHES = "──";

/**
 * リーダブルビュー (`view=reader`) のための仮想スクロールリスト。
 *
 * 内部的に {@link toReaderRows} でランドマーク区切りの罫線を含んだ行配列を
 * 構築し、`computeWindow` で可視レンジを算出する。cursor は従来通り
 * A11yNode 配列のインデックスで管理され、ナビゲーション挙動は VirtualList と
 * 同一 (separator 行は飛ばされる格好になる)。
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
          const prefix = "  ".repeat(row.indent);
          return (
            <Text
              key={`sep-${globalRow}`}
              color={style.color}
              bold={style.bold}
              wrap="truncate-end"
            >
              {`${prefix}${SEPARATOR_DASHES} ${row.label} ${SEPARATOR_DASHES}`}
            </Text>
          );
        }
        const selected = row.nodeIndex === cursor;
        // NodeRow は `node.depth` をインデントに使うため、合算済みの indent を
        // 上書きした浅いコピーを渡して reader view 上の階層を表示する。
        const displayNode: A11yNode = { ...row.node, depth: row.indent };
        return (
          <NodeRow
            key={`${row.node.backendNodeId}-${row.nodeIndex}`}
            node={displayNode}
            selected={selected}
          />
        );
      })}
    </Box>
  );
}
