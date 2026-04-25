import type { A11yNode } from "@aria-palina/core";
import { colorizeByRole } from "./colorize.js";

export interface TextFormatOptions {
  indent: boolean;
  color: boolean;
}

/**
 * `inlineSegments` を持つノードの `speechText` を、親ロール色 → セグメント
 * ロール色 → 親ロール色 … のように色分けした文字列に変換する。
 *
 * セグメント同士は `start` の昇順。`speechText` のセグメント外領域は親色で
 * まとめて装飾し、各セグメント範囲だけを対応するロール色で上書きする。
 */
function colorizeSpeechText(node: A11yNode): string {
  const segments = node.inlineSegments;
  if (!segments || segments.length === 0) {
    return colorizeByRole(node.role, node.speechText);
  }
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const chunks: string[] = [];
  let cursor = 0;
  for (const seg of sorted) {
    if (seg.start > cursor) {
      chunks.push(colorizeByRole(node.role, node.speechText.slice(cursor, seg.start)));
    }
    chunks.push(colorizeByRole(seg.role, node.speechText.slice(seg.start, seg.end)));
    cursor = seg.end;
  }
  if (cursor < node.speechText.length) {
    chunks.push(colorizeByRole(node.role, node.speechText.slice(cursor)));
  }
  return chunks.join("");
}

export function formatTextOutput(nodes: A11yNode[], opts: TextFormatOptions): string {
  return nodes
    .map((node) => {
      const prefix = opts.indent ? "  ".repeat(node.depth) : "";
      const text = opts.color ? colorizeSpeechText(node) : node.speechText;
      return `${prefix}${text}`;
    })
    .join("\n");
}

export function formatJsonOutput(nodes: A11yNode[]): string {
  return JSON.stringify(nodes, null, 2);
}
