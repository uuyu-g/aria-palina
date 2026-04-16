import type { A11yNode, NodeKind } from "@aria-palina/core";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { computeWindow } from "../virtual-window.js";
import { NodeRow } from "./NodeRow.js";

const KIND_LABEL: Readonly<Record<NodeKind, string>> = {
  heading: "見出し",
  landmark: "ランドマーク",
  interactive: "インタラクティブ",
};

export interface FilterModalProps {
  kind: NodeKind;
  nodes: A11yNode[];
  cursor: number;
  /** アイテム表示領域の行数。 */
  viewport: number;
}

export function FilterModal({ kind, nodes, cursor, viewport }: FilterModalProps) {
  const { start, end } = useMemo(
    () => computeWindow({ total: nodes.length, cursor, viewport }),
    [nodes.length, cursor, viewport],
  );

  const label = KIND_LABEL[kind];
  const title = `${label}一覧 (${nodes.length}件)`;
  const visible = nodes.slice(start, end);
  const padCount = Math.max(0, viewport - (nodes.length === 0 ? 1 : visible.length));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingLeft={1}
      paddingRight={1}
    >
      <Text bold color="cyan">
        {title}
      </Text>
      <Box flexDirection="column">
        {nodes.length === 0 ? (
          <Text dimColor>(該当するノードがありません)</Text>
        ) : (
          visible.map((node, i) => {
            const globalIndex = start + i;
            return (
              <NodeRow
                key={`${node.backendNodeId}-${globalIndex}`}
                node={node}
                selected={globalIndex === cursor}
              />
            );
          })
        )}
        {padCount > 0 &&
          Array.from({ length: padCount }, (_, i) => <Text key={`pad-${i}`}> </Text>)}
      </Box>
      <Text dimColor>↑↓ 移動 ←→ 種別切替 Enter 決定 Esc 閉じる</Text>
    </Box>
  );
}
