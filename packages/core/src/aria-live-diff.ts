import type { A11yNode } from "./types.js";

export type LivePoliteness = "polite" | "assertive" | "off";
export type LiveChangeKind = "added" | "removed" | "text";

export interface LiveChange {
  kind: LiveChangeKind;
  node: A11yNode;
  politeness: LivePoliteness;
  /** `text` 変更時の変更前 speechText (added/removed 時は未定義)。 */
  before?: string;
  /** `text`/`added` 時の変更後 speechText (removed 時は未定義)。 */
  after?: string;
}

/**
 * ロールから暗黙の politeness を解決する。ARIA 仕様に基づく:
 * - `status`: polite (暗黙の aria-live=polite)
 * - `alert`: assertive
 * - `log`: polite
 * - `marquee` / `timer`: off (読み上げ対象外だが live 扱い)
 */
const IMPLICIT_LIVE_BY_ROLE: Readonly<Record<string, LivePoliteness>> = {
  status: "polite",
  alert: "assertive",
  log: "polite",
  marquee: "off",
  timer: "off",
};

function resolvePoliteness(node: A11yNode): LivePoliteness | null {
  const live = node.properties["live"];
  if (typeof live === "string") {
    if (live === "polite" || live === "assertive" || live === "off") return live;
  }
  return IMPLICIT_LIVE_BY_ROLE[node.role] ?? null;
}

function indexByBackendNodeId(nodes: readonly A11yNode[]): Map<number, A11yNode> {
  const out = new Map<number, A11yNode>();
  for (const n of nodes) {
    if (n.backendNodeId > 0) out.set(n.backendNodeId, n);
  }
  return out;
}

/**
 * 2 つの AX ツリースナップショット間で、aria-live リージョンに相当する
 * ノードの差分を検出する。NVDA 相当のアナウンスを TUI ステータスバーで
 * 再現するために利用する。
 *
 * 検出対象:
 * - 明示的な `aria-live` が付与されたノード (`properties.live`)
 * - role による暗黙の live 領域 (`status`, `alert`, `log`, `marquee`, `timer`)
 *
 * ノードの同一性は `backendNodeId` で判定する。`politeness: "off"` のノードも
 * 返すが、UI 側で抑制するかは呼び出し側判断。
 *
 * @param before 変更前のフラット AX ノード列
 * @param after  変更後のフラット AX ノード列
 * @returns      変化のあった live リージョンの差分リスト
 */
export function diffLiveRegions(
  before: readonly A11yNode[],
  after: readonly A11yNode[],
): LiveChange[] {
  const changes: LiveChange[] = [];
  const beforeLive = new Map<number, { node: A11yNode; politeness: LivePoliteness }>();
  for (const n of before) {
    const p = resolvePoliteness(n);
    if (p !== null && n.backendNodeId > 0) {
      beforeLive.set(n.backendNodeId, { node: n, politeness: p });
    }
  }

  const afterById = indexByBackendNodeId(after);
  const seen = new Set<number>();

  for (const n of after) {
    const p = resolvePoliteness(n);
    if (p === null) continue;
    if (n.backendNodeId <= 0) continue;
    seen.add(n.backendNodeId);

    const prev = beforeLive.get(n.backendNodeId);
    if (!prev) {
      changes.push({ kind: "added", node: n, politeness: p, after: n.speechText });
      continue;
    }
    if (prev.node.speechText !== n.speechText) {
      changes.push({
        kind: "text",
        node: n,
        politeness: p,
        before: prev.node.speechText,
        after: n.speechText,
      });
    }
  }

  for (const [id, prev] of beforeLive) {
    if (seen.has(id)) continue;
    // after に存在しない = 削除
    if (!afterById.has(id)) {
      changes.push({
        kind: "removed",
        node: prev.node,
        politeness: prev.politeness,
        before: prev.node.speechText,
      });
    }
  }

  return changes;
}
