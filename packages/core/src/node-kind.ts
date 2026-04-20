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

/**
 * `nodes` のうち `kind` に一致するものだけを抽出した新しい配列を返す。
 * 順序は保存される。TUI のフィルタモードで「絞り込まれた一覧」を作るために使う。
 */
export function filterByKind(nodes: readonly A11yNode[], kind: NodeKind): A11yNode[] {
  return nodes.filter((node) => matchesKind(node, kind));
}

/** フィルタ切替の巡回順。`cycleKind` の基礎となる固定配列。 */
const KIND_CYCLE: readonly NodeKind[] = ["heading", "landmark", "interactive"];

/**
 * TUI のフィルタモードで ←/→ による種別切替を行うときの巡回ロジック。
 * 順方向 (`direction=1`) は heading → landmark → interactive → heading と循環する。
 */
export function cycleKind(current: NodeKind, direction: 1 | -1): NodeKind {
  const index = KIND_CYCLE.indexOf(current);
  const length = KIND_CYCLE.length;
  // indexOf が -1 を返すことは型的にあり得ないが、防御的に 0 扱いにする。
  const base = index < 0 ? 0 : index;
  const nextIndex = (base + direction + length) % length;
  return KIND_CYCLE[nextIndex] as NodeKind;
}
