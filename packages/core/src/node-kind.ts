import type { A11yNode, InlineSegment } from "./types.js";

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

/**
 * `nodes` のうち `kind` に一致するものだけを抽出した新しい配列を返す。
 * 順序は保存される。TUI のフィルタモードで「絞り込まれた一覧」を作るために使う。
 */
export function filterByKind(nodes: readonly A11yNode[], kind: NodeKind): A11yNode[] {
  return nodes.filter((node) => matchesKind(node, kind));
}

/**
 * インラインセグメントがインタラクティブ (Tab ナビ対象) か判定する。
 * `A11yNode.isFocusable` と同じ基準 (focusable かつ disabled でない) に加え、
 * 操作可能な `backendNodeId` を持っていることを要求する。
 */
function isInteractiveSegment(segment: InlineSegment): boolean {
  return segment.isFocusable && segment.state["disabled"] !== true && segment.backendNodeId > 0;
}

/**
 * インライン圧縮後の「Tab 巡回対象」を示す座標。
 *
 * `segmentIndex` が `null` のときは行 (`nodes[rowIndex]`) そのものを指す。
 * 数値のときは `nodes[rowIndex].inlineSegments![segmentIndex]` を指す。
 */
export interface InteractiveTarget {
  rowIndex: number;
  segmentIndex: number | null;
  backendNodeId: number;
  role: string;
  name: string;
}

/**
 * 配列全体を走査して Tab 巡回対象となるターゲットを、表示順 (行→その行の
 * セグメント→次の行) で列挙する。行自体が interactive な場合は行を先に、
 * その行にインタラクティブなセグメントがあればそれらを続けて出力する。
 */
export function listInteractiveTargets(nodes: readonly A11yNode[]): InteractiveTarget[] {
  const targets: InteractiveTarget[] = [];
  for (let r = 0; r < nodes.length; r++) {
    const node = nodes[r]!;
    if (matchesKind(node, "interactive")) {
      targets.push({
        rowIndex: r,
        segmentIndex: null,
        backendNodeId: node.backendNodeId,
        role: node.role,
        name: node.name,
      });
    }
    if (!node.inlineSegments) continue;
    for (let s = 0; s < node.inlineSegments.length; s++) {
      const seg = node.inlineSegments[s]!;
      if (!isInteractiveSegment(seg)) continue;
      targets.push({
        rowIndex: r,
        segmentIndex: s,
        backendNodeId: seg.backendNodeId,
        role: seg.role,
        name: seg.name,
      });
    }
  }
  return targets;
}

/** `(rowIndex, segmentIndex)` 座標を位置比較可能な単一の数値に変換する。 */
function positionKey(rowIndex: number, segmentIndex: number | null): number {
  // segmentIndex === null (= 行自身) はセグメントよりも前に並べる。
  const seg = segmentIndex === null ? -1 : segmentIndex;
  // 行内セグメントは最大でも数十個に収まる想定。衝突しないよう余裕を持たせる。
  return rowIndex * 10_000 + seg + 1;
}

/**
 * 現在位置 `from` から `direction` 方向に走査し、最初にマッチする
 * インタラクティブターゲットを返す。見つからなければ `null`。
 * `from` 自身はターゲットリスト上に存在しなくてもよい。
 */
export function findNextTarget(
  nodes: readonly A11yNode[],
  from: { rowIndex: number; segmentIndex: number | null },
  direction: 1 | -1,
): InteractiveTarget | null {
  const targets = listInteractiveTargets(nodes);
  if (targets.length === 0) return null;
  const fromKey = positionKey(from.rowIndex, from.segmentIndex);
  if (direction === 1) {
    for (const t of targets) {
      if (positionKey(t.rowIndex, t.segmentIndex) > fromKey) return t;
    }
    return null;
  }
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]!;
    if (positionKey(t.rowIndex, t.segmentIndex) < fromKey) return t;
  }
  return null;
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
