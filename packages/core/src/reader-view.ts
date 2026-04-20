/**
 * リーダブルビューの最小ヘルパー (Phase 6.5)。
 *
 * リーダブルビューは「ランドマーク行を `── label ──` に置き換えて、
 * RootWebArea 由来の無駄なインデントを潰す」だけの軽量変換なので、
 * 中間表現 (`ReaderSection` / `ReaderItem`) は持たない。Core は共通の
 * 定数・ラベル整形・ベース depth 算出だけを公開し、実際のレンダリングは
 * CLI (`formatReaderTextOutput`) / TUI (`ReaderList`) 各レンダラーで行う。
 *
 * Phase 7 Chrome Extension で構造化された IR が必要になったら、そのとき
 * 改めて設計する (現時点では YAGNI)。
 */

import type { A11yNode } from "./types.js";

/**
 * ARIA ランドマーク roles。
 * リーダブルビューでセクション見出し行 (`── label ──`) に昇格する。
 *
 * @see https://www.w3.org/TR/wai-aria-1.2/#landmark_roles
 */
export const LANDMARK_ROLES: ReadonlySet<string> = new Set([
  "banner",
  "complementary",
  "contentinfo",
  "form",
  "main",
  "navigation",
  "region",
  "search",
]);

/**
 * ランドマークセクション見出しのラベル。
 * 例: `main` / `navigation「サイドバー」`
 *
 * `name` が空白のみならロール名だけを返す。
 */
export function readerSectionLabel(landmark: A11yNode): string {
  const name = landmark.name.trim();
  return name.length > 0 ? `${landmark.role}「${name}」` : landmark.role;
}

/**
 * `A11yNode[]` の depth を reader view 用に正規化するためのベース値。
 * 最も浅いノードの depth を 0 に合わせる意図で、レンダラーは
 * `Math.max(0, node.depth - base)` を実インデントに使う。
 * RootWebArea などの無意味な親ノードが消費するインデントを縮める効果がある。
 *
 * `nodes` が空の場合は `0` を返す。
 */
export function readerBaseDepth(nodes: readonly A11yNode[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const n of nodes) {
    if (n.depth < min) min = n.depth;
  }
  return min === Number.POSITIVE_INFINITY ? 0 : min;
}
