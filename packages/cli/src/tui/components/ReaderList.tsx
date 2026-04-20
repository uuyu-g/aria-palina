import {
  LANDMARK_ROLES,
  readerBaseDepth,
  readerSectionLabel,
  type A11yNode,
} from "@aria-palina/core";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { roleTextStyle } from "../role-style.js";
import { computeWindow } from "../virtual-window.js";
import { NodeRow } from "./NodeRow.js";

export interface ReaderListProps {
  nodes: A11yNode[];
  /** A11yNode 配列上のカーソル位置 (VirtualList と共通の規約)。 */
  cursor: number;
  viewport: number;
}

/** ランドマーク境界に描画する罫線幅。CLI 側の `formatReaderTextOutput` と揃える。 */
const SEPARATOR_DASHES = "──";

/**
 * リーダブルビュー (`view=reader`) のための仮想スクロールリスト。
 *
 * `VirtualList` とほぼ同じで、ランドマーク行だけ `── label ──` の罫線表現に
 * 差し替える。`cursor` は A11yNode 配列上のインデックスそのままで扱え、
 * ランドマーク行にカーソルが乗るとそれも選択強調される。
 *
 * インデントは `readerBaseDepth` を引いて RootWebArea などの無意味な親ノードの
 * インデントを詰める。それ以外は raw view と同じ挙動。
 */
export function ReaderList({ nodes, cursor, viewport }: ReaderListProps) {
  const base = useMemo(() => readerBaseDepth(nodes), [nodes]);

  const { start, end } = useMemo(
    () => computeWindow({ total: nodes.length, cursor, viewport }),
    [nodes.length, cursor, viewport],
  );

  if (nodes.length === 0) {
    return (
      <Box>
        <Text dimColor>(表示するノードがありません)</Text>
      </Box>
    );
  }

  const visible = nodes.slice(start, end);

  return (
    <Box flexDirection="column">
      {visible.map((node, i) => {
        const globalIndex = start + i;
        const selected = globalIndex === cursor;
        const depth = Math.max(0, node.depth - base);

        if (LANDMARK_ROLES.has(node.role)) {
          const label = readerSectionLabel(node);
          const indent = "  ".repeat(depth);
          const prefix = selected ? "> " : "  ";
          const body = `${prefix}${indent}${SEPARATOR_DASHES} ${label} ${SEPARATOR_DASHES}`;
          if (selected) {
            return (
              <Text key={`sep-${globalIndex}`} inverse wrap="truncate-end">
                {body}
              </Text>
            );
          }
          const style = roleTextStyle(node.role);
          return (
            <Text
              key={`sep-${globalIndex}`}
              color={style.color}
              bold={style.bold}
              wrap="truncate-end"
            >
              {body}
            </Text>
          );
        }

        // 通常ノード: 正規化した depth を反映した浅いコピーを NodeRow に渡す。
        const displayNode: A11yNode = { ...node, depth };
        return (
          <NodeRow
            key={`${node.backendNodeId}-${globalIndex}`}
            node={displayNode}
            selected={selected}
          />
        );
      })}
    </Box>
  );
}
