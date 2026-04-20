import type { A11yNode, InlineSegment } from "@aria-palina/core";
import { Text } from "ink";
import { memo, type ReactNode } from "react";
import { roleTextStyle } from "../role-style.js";

export interface NodeRowProps {
  node: A11yNode;
  selected: boolean;
  /**
   * 行が選択中かつこの値が数値のとき、該当セグメントだけ反転表示する。
   * `null` / `undefined` なら行全体を反転表示する (従来の挙動)。
   */
  activeSegment?: number | null;
}

interface RenderPiece {
  key: string;
  text: string;
  color?: string;
  bold?: boolean;
  inverse?: boolean;
}

/**
 * `speechText` を親ロール色のチャンクとセグメント色のチャンクに分割する。
 * `activeSegmentIndex` が一致するセグメントは `inverse: true` を付与して
 * 選択ハイライトを表現する。
 */
function splitIntoPieces(node: A11yNode, activeSegmentIndex: number | null): RenderPiece[] {
  const parentStyle = roleTextStyle(node.role);
  const segments = node.inlineSegments;
  if (!segments || segments.length === 0) {
    return [
      {
        key: "whole",
        text: node.speechText,
        ...parentStyle,
      },
    ];
  }
  const sorted = segments
    .map((seg, index) => ({ seg, index }))
    .sort((a, b) => a.seg.start - b.seg.start);
  const pieces: RenderPiece[] = [];
  let cursor = 0;
  for (const { seg, index } of sorted) {
    if (seg.start > cursor) {
      pieces.push({
        key: `pre-${index}`,
        text: node.speechText.slice(cursor, seg.start),
        ...parentStyle,
      });
    }
    const segStyle = roleTextStyle(seg.role);
    const isActive = activeSegmentIndex !== null && activeSegmentIndex === index;
    pieces.push({
      key: `seg-${index}`,
      text: node.speechText.slice(seg.start, seg.end),
      ...segStyle,
      ...(isActive ? { inverse: true } : {}),
    });
    cursor = seg.end;
  }
  if (cursor < node.speechText.length) {
    pieces.push({
      key: "tail",
      text: node.speechText.slice(cursor),
      ...parentStyle,
    });
  }
  return pieces;
}

function renderPiece(piece: RenderPiece): ReactNode {
  return (
    <Text key={piece.key} color={piece.color} bold={piece.bold} inverse={piece.inverse}>
      {piece.text}
    </Text>
  );
}

function NodeRowImpl({ node, selected, activeSegment = null }: NodeRowProps) {
  const indent = "  ".repeat(node.depth);
  const prefix = selected ? "> " : "  ";

  // 行全体を反転: 従来の「行選択」の挙動を維持する。
  // activeSegment が null のセグメント持ち行は、行全体を反転するが、
  // セグメント色分けを捨てたくないのでセグメントなし行と同じ扱いにしない。
  const segments = node.inlineSegments;
  const hasSegments = segments !== undefined && segments.length > 0;

  if (selected && !hasSegments) {
    return (
      <Text inverse wrap="truncate-end">
        {prefix}
        {indent}
        {node.speechText}
      </Text>
    );
  }

  if (selected && hasSegments && activeSegment === null) {
    // 行選択中だがセグメントにフォーカスしていないケース。
    // 視認性優先で行全体を反転し、セグメント色は捨てる。
    return (
      <Text inverse wrap="truncate-end">
        {prefix}
        {indent}
        {node.speechText}
      </Text>
    );
  }

  // セグメント単位で分割描画。選択中なら activeSegment だけ inverse。
  const pieces = splitIntoPieces(node, selected ? activeSegment : null);
  return (
    <Text wrap="truncate-end">
      <Text>{prefix}</Text>
      <Text>{indent}</Text>
      {pieces.map(renderPiece)}
    </Text>
  );
}

export const NodeRow = memo(NodeRowImpl);

export type { InlineSegment };
