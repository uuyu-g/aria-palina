import type { A11yNode } from "@aria-palina/core";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { computeWindow } from "../virtual-window.js";
import { NodeRow } from "./NodeRow.js";

export interface VirtualListProps {
  nodes: A11yNode[];
  cursor: number;
  viewport: number;
  /**
   * 選択行内でアクティブなセグメントのインデックス。行全体が選択対象の
   * ときは `null`。Tab キーが押されてインライン子にフォーカスしたとき
   * だけ数値になる。
   */
  activeSegment?: number | null;
}

export function VirtualList({ nodes, cursor, viewport, activeSegment = null }: VirtualListProps) {
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
        return (
          <NodeRow
            key={`${node.backendNodeId}-${globalIndex}`}
            node={node}
            selected={selected}
            activeSegment={selected ? activeSegment : null}
          />
        );
      })}
    </Box>
  );
}
