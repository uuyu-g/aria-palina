import type { A11yNode } from "./types.js";

/**
 * TUI デュアルナビゲーションで利用するノード種別。
 *
 * - `interactive`: Tab キーで巡回するフォーカス可能要素
 * - `heading`: H キーで巡回する見出し (`role="heading"`)
 * - `landmark`: D キーで巡回するランドマーク (`main`, `navigation`, etc.)
 *
 * @see ../../../docs/dd.md §4 Phase 5 / ../../../docs/manual.md
 */
export type NodeKind = "interactive" | "heading" | "landmark";

/**
 * ARIA ランドマーク roles。
 * @see https://www.w3.org/TR/wai-aria-1.2/#landmark_roles
 */
const LANDMARK_ROLES: ReadonlySet<string> = new Set([
  "banner",
  "complementary",
  "contentinfo",
  "form",
  "main",
  "navigation",
  "region",
  "search",
]);

/** ノードが指定された種別に一致するかを判定する純粋関数。 */
export function matchesKind(node: A11yNode, kind: NodeKind): boolean {
  switch (kind) {
    case "interactive":
      // disabled 状態のフォーカス可能要素はスキップ (ブラウザ Tab 挙動と同じ)。
      return node.isFocusable && node.state["disabled"] !== true;
    case "heading":
      return node.role === "heading";
    case "landmark":
      return LANDMARK_ROLES.has(node.role);
  }
}

/**
 * `from` から `direction` 方向に走査し、最初に `kind` と一致するノードの
 * インデックスを返す。見つからない場合は `-1`。
 *
 * `from` 自身は含めない (常に 1 つ先から開始)。ラップアラウンドはしない。
 */
export function findNext(
  nodes: readonly A11yNode[],
  from: number,
  kind: NodeKind,
  direction: 1 | -1,
): number {
  for (let i = from + direction; i >= 0 && i < nodes.length; i += direction) {
    const node = nodes[i];
    if (node !== undefined && matchesKind(node, kind)) return i;
  }
  return -1;
}
