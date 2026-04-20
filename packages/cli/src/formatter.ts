import {
  LANDMARK_ROLES,
  readerBaseDepth,
  readerSectionLabel,
  type A11yNode,
} from "@aria-palina/core";
import { colorizeByRole } from "./colorize.js";

export interface TextFormatOptions {
  indent: boolean;
  color: boolean;
}

/**
 * 素朴な深いインデント表示 (`--view=raw` 相当)。
 * `A11yNode[]` を DFS 順のまま改行区切りで並べ、`depth` をインデントに反映する。
 */
export function formatTextOutput(nodes: A11yNode[], opts: TextFormatOptions): string {
  return nodes
    .map((node) => {
      const prefix = opts.indent ? "  ".repeat(node.depth) : "";
      const text = opts.color ? colorizeByRole(node.role, node.speechText) : node.speechText;
      return `${prefix}${text}`;
    })
    .join("\n");
}

/** ランドマーク境界に描画する罫線幅。幅狭ターミナルでも見切れない値を選ぶ。 */
const SEPARATOR_DASHES = "──";

/**
 * リーダブルビュー (`--view=reader` 相当) のテキスト出力。
 *
 * ランドマーク行を `── {role}「{name}」 ──` の罫線に置換し、それ以外のノードは
 * そのまま speechText として出す。インデントは `readerBaseDepth` を引いて
 * RootWebArea などの無意味な親ノードのインデントを詰める。ドキュメント順は
 * そのままなので、`<main>` の途中に `<nav>` が挟まるケースでも元の位置関係が
 * 保たれる。
 */
export function formatReaderTextOutput(nodes: A11yNode[], opts: TextFormatOptions): string {
  const base = readerBaseDepth(nodes);
  return nodes
    .map((node) => {
      const depth = Math.max(0, node.depth - base);
      const prefix = opts.indent ? "  ".repeat(depth) : "";
      if (LANDMARK_ROLES.has(node.role)) {
        const line = `${SEPARATOR_DASHES} ${readerSectionLabel(node)} ${SEPARATOR_DASHES}`;
        const body = opts.color ? colorizeByRole(node.role, line) : line;
        return `${prefix}${body}`;
      }
      const text = opts.color ? colorizeByRole(node.role, node.speechText) : node.speechText;
      return `${prefix}${text}`;
    })
    .join("\n");
}

export function formatJsonOutput(nodes: A11yNode[]): string {
  return JSON.stringify(nodes, null, 2);
}
