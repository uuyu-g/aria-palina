import { buildReaderView, type A11yNode, type ReaderSection } from "@aria-palina/core";
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

function renderSeparator(section: ReaderSection, indent: boolean, color: boolean): string {
  const prefix = indent ? "  ".repeat(section.depth) : "";
  const line =
    section.label.length > 0 ? `${SEPARATOR_DASHES} ${section.label} ${SEPARATOR_DASHES}` : "";
  if (line.length === 0) return "";
  const body = color ? colorizeByRole(section.landmark?.role ?? "", line) : line;
  return `${prefix}${body}`;
}

/**
 * リーダブルビュー (`--view=reader` 相当) のテキスト出力。
 *
 * ランドマーク境界に `── {role}「{name}」 ──` の罫線を挟み、各セクション内では
 * `ReaderItem.depth` (ランドマーク基準で再採番済み) と `ReaderSection.depth`
 * (ランドマーク入れ子段数) の合算値をインデントに使う。ランドマークが付かない
 * 暗黙セクションでは罫線を省略する。
 *
 * インデント規約 (`indent: true` のとき):
 * - 罫線行 = `section.depth * 2` スペース。
 * - アイテム行 = `(section.depth + 1 + item.depth) * 2` スペース。
 *   罫線行の直下 (item.depth=0) は罫線より 2 つ深いインデントになる。
 */
export function formatReaderTextOutput(nodes: A11yNode[], opts: TextFormatOptions): string {
  const sections = buildReaderView(nodes);
  const lines: string[] = [];
  for (const section of sections) {
    const separator = renderSeparator(section, opts.indent, opts.color);
    if (separator.length > 0) lines.push(separator);
    const itemBaseIndent = section.landmark !== null ? section.depth + 1 : section.depth;
    for (const item of section.items) {
      const prefix = opts.indent ? "  ".repeat(itemBaseIndent + item.depth) : "";
      const text = opts.color
        ? colorizeByRole(item.node.role, item.node.speechText)
        : item.node.speechText;
      lines.push(`${prefix}${text}`);
    }
  }
  return lines.join("\n");
}

export function formatJsonOutput(nodes: A11yNode[]): string {
  return JSON.stringify(nodes, null, 2);
}
