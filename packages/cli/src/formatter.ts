import { buildReaderView, type A11yNode } from "@aria-palina/core";
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

/** 左レール文字 (1 段ぶん、末尾スペース付き)。 */
const RAIL = "│ ";
/** セクション見出し先頭の角。「開く」「続く」の 2 種のみで、閉じは出さない。 */
const CORNER_OPEN = "┌── ";
const CORNER_CONTINUE = "├── ";

/**
 * リーダブルビュー (`--view=reader` 相当) のテキスト出力。
 *
 * ランドマーク境界ごとに `┌── {role}「{name}」` (入れ子の最初) または
 * `├── ...` (兄弟 / 外側への戻り) の見出し行を挟む。各行の左端には祖先
 * ランドマーク数だけ `│ ` のレールを垂らし、章の所属を視覚化する。
 * 閉じ (`└──`) は出さない (ライブ更新・ストリーミングで破綻しないため)。
 *
 * `indent: false` のときはレール・インデント・角記号を一切付けず、
 * 見出しラベル・speechText だけを改行で並べる (パイプ grep 向け)。
 */
export function formatReaderTextOutput(nodes: A11yNode[], opts: TextFormatOptions): string {
  const sections = buildReaderView(nodes);
  const lines: string[] = [];
  let lastSeparatorRail = -1;

  for (const section of sections) {
    if (section.landmark !== null && section.label.length > 0) {
      const variant: "open" | "continue" = lastSeparatorRail < section.depth ? "open" : "continue";
      const rails = opts.indent ? RAIL.repeat(section.depth) : "";
      const corner = opts.indent ? (variant === "open" ? CORNER_OPEN : CORNER_CONTINUE) : "";
      const body = `${rails}${corner}${section.label}`;
      lines.push(opts.color ? colorizeByRole(section.landmark.role, body) : body);
      lastSeparatorRail = section.depth;
    }
    const itemRails = section.landmark !== null ? section.depth + 1 : 0;
    for (const item of section.items) {
      const railPrefix = opts.indent ? RAIL.repeat(itemRails) : "";
      const extraPrefix = opts.indent ? "  ".repeat(item.depth) : "";
      const text = opts.color
        ? colorizeByRole(item.node.role, item.node.speechText)
        : item.node.speechText;
      lines.push(`${railPrefix}${extraPrefix}${text}`);
    }
  }
  return lines.join("\n");
}

export function formatJsonOutput(nodes: A11yNode[]): string {
  return JSON.stringify(nodes, null, 2);
}
