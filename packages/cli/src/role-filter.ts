import type { A11yNode } from "@aria-palina/core";

/**
 * `--role` フィルタを適用したうえで、最小 depth を 0 に詰め直す。
 *
 * 絞り込みで親ノードが抜けると間が空いたインデントになるため、
 * 残ったノード群の最小 depth をゼロ基準にして見た目を揃える。
 * `roles` が未指定 (undefined / 空配列) ならフィルタしない。
 */
export function applyRoleFilter(
  nodes: readonly A11yNode[],
  roles: readonly string[] | undefined,
): A11yNode[] {
  if (!roles || roles.length === 0) return [...nodes];
  const filtered = nodes.filter((n) => roles.includes(n.role));
  if (filtered.length === 0) return filtered;
  const minDepth = Math.min(...filtered.map((n) => n.depth));
  if (minDepth === 0) return filtered;
  return filtered.map((n) => ({ ...n, depth: n.depth - minDepth }));
}
