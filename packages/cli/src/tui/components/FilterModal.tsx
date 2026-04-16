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

/** タブバーの表示順。`cycleKind` と同じ巡回順序。 */
const TAB_ORDER: readonly NodeKind[] = ["heading", "landmark", "interactive"];

/**
 * フィルタ済みノードの depth を正規化する。
 * 元ツリーの絶対 depth をそのまま使うとフィルタで間が抜けた分だけ
 * 不自然に深いインデントになるため、親子関係を保ったまま詰め直す。
 */
function normalizeDepths(nodes: readonly A11yNode[]): A11yNode[] {
  if (nodes.length === 0) return [];
  const stack: number[] = [];
  return nodes.map((node) => {
    while (stack.length > 0 && stack[stack.length - 1]! >= node.depth) {
      stack.pop();
    }
    const normalized = stack.length;
    stack.push(node.depth);
    return normalized === node.depth ? node : { ...node, depth: normalized };
  });
}

export interface FilterModalProps {
  kind: NodeKind;
  nodes: A11yNode[];
  cursor: number;
  /** アイテム表示領域の行数。 */
  viewport: number;
}

export function FilterModal({ kind, nodes, cursor, viewport }: FilterModalProps) {
  const normalized = useMemo(() => normalizeDepths(nodes), [nodes]);

  const { start, end } = useMemo(
    () => computeWindow({ total: normalized.length, cursor, viewport }),
    [normalized.length, cursor, viewport],
  );

  const visible = normalized.slice(start, end);
  const padCount = Math.max(0, viewport - (normalized.length === 0 ? 1 : visible.length));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingLeft={1}
      paddingRight={1}
    >
      <Box gap={1}>
        {TAB_ORDER.map((k) => {
          const isActive = k === kind;
          const tabLabel = KIND_LABEL[k];
          return (
            <Text
              key={k}
              bold={isActive}
              color={isActive ? "cyan" : undefined}
              dimColor={!isActive}
            >
              {isActive ? `${tabLabel} (${normalized.length})` : tabLabel}
            </Text>
          );
        })}
      </Box>
      <Box flexDirection="column">
        {normalized.length === 0 ? (
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
