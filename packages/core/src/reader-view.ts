/**
 * リーダブルビュー中間表現の構築 (Phase 6.5)。
 *
 * `flattenAXTree` が返す素朴な平坦配列を、晴眼者にとって俯瞰しやすい
 * 「目次的なページ構造」へ再構成する純粋関数を提供する。
 *
 * アルゴリズム (docs/plan.md Phase 6.5):
 *
 * 1. ランドマーク (banner / navigation / main / complementary /
 *    contentinfo / region / search / form) を境界として配列を
 *    {@link ReaderSection} に区切る。
 * 2. 各セクションは内部にアイテム列を持ち、先頭ランドマークの
 *    `depth` を基準にアイテムの `depth` を相対化する。
 * 3. スクリーンリーダーが読み飛ばすだけの意味を持たないロール
 *    (`none` / `presentation`) はアイテムから除外する。
 *    `generic` (名前なし) は `flattenAXTree` が既に潰しているため
 *    重複して処理しない。
 * 4. 最初のランドマーク以前に現れたノードは、暗黙の前置きセクション
 *    (`landmark: null`) に積む。
 *
 * ネストしたランドマーク (`<main><nav>...</nav></main>`) は「新しいランドマーク
 * が出現したら前のセクションを閉じる」というフラットなルールで扱う。ネスト
 * ランドマーク後に外側の `main` の内容が再出現した場合は新しい無名セクションに
 * 積む。実サイトでのネストは稀であり、単純化優先。
 *
 * CLI / TUI のどちらのレンダラーからも使われ、将来の Chrome Extension でも
 * 同じロジックを共有できるように Core に置く。
 */

import type { A11yNode } from "./types.js";

/** リーダブルビュー上の 1 アイテム (ノードとセクション内 depth)。 */
export interface ReaderItem {
  /** 元の A11yNode 参照 (backendNodeId / speechText などを再利用する)。 */
  node: A11yNode;
  /**
   * セクション内の相対 depth。
   * ランドマーク直下のアイテムは 0 から始まり、入れ子の深さを表す。
   */
  depth: number;
}

/** リーダブルビューの 1 セクション (ランドマーク境界で区切られた塊)。 */
export interface ReaderSection {
  /**
   * セクションを開いたランドマーク `A11yNode`。
   * ページ先頭でランドマークが未出現の場合は `null` (暗黙の前置き)。
   */
  landmark: A11yNode | null;
  /**
   * セクションヘッダに表示するラベル。
   * ランドマーク有: `main` / `navigation「サイドバー」` のように role (+ name) を返す。
   * ランドマーク無 (先頭前置き): 空文字列。
   */
  label: string;
  /** このセクションに属するアイテム列 (DFS 順)。 */
  items: ReaderItem[];
}

/**
 * ARIA ランドマーク roles。
 * `node-kind.ts` にも同一集合が存在するが、依存方向を逆転させないためローカル定義する。
 *
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

/**
 * スクリーンリーダーが読み飛ばす、意味を持たないロール。
 * リーダブルビューでは出力から除外する。
 *
 * `generic` は `flattenAXTree` が既に名前なしのものを透過処理しているため
 * ここには含めない (名前付き generic はグループとして表示価値がある)。
 */
const SKIP_ROLES: ReadonlySet<string> = new Set(["none", "presentation"]);

function formatSectionLabel(landmark: A11yNode): string {
  const name = landmark.name.trim();
  if (name.length === 0) return landmark.role;
  return `${landmark.role}「${name}」`;
}

interface WorkingSection {
  landmark: A11yNode | null;
  items: A11yNode[];
  minDepth: number;
}

function finalizeSection(work: WorkingSection): ReaderSection {
  const base = work.minDepth === Number.POSITIVE_INFINITY ? 0 : work.minDepth;
  const items: ReaderItem[] = work.items.map((node) => ({
    node,
    depth: Math.max(0, node.depth - base),
  }));
  return {
    landmark: work.landmark,
    label: work.landmark ? formatSectionLabel(work.landmark) : "",
    items,
  };
}

/**
 * `A11yNode[]` (DFS 平坦化済み) から {@link ReaderSection} の配列を構築する。
 *
 * 空の暗黙セクション (landmark: null, items: []) は出力に含めない。
 * ランドマークだけが存在しアイテムが 0 件のセクションは、見出しだけの
 * 空ランドマーク (ex: `<main></main>`) をそのまま反映するため残す。
 */
export function buildReaderView(nodes: readonly A11yNode[]): ReaderSection[] {
  const sections: ReaderSection[] = [];
  let current: WorkingSection = {
    landmark: null,
    items: [],
    minDepth: Number.POSITIVE_INFINITY,
  };

  const closeCurrent = (): void => {
    if (current.landmark !== null || current.items.length > 0) {
      sections.push(finalizeSection(current));
    }
  };

  for (const node of nodes) {
    if (LANDMARK_ROLES.has(node.role)) {
      closeCurrent();
      current = { landmark: node, items: [], minDepth: Number.POSITIVE_INFINITY };
      continue;
    }
    if (SKIP_ROLES.has(node.role)) continue;

    // ネストしたランドマークを抜けて外側の内容に戻った場合、現在の
    // ランドマークセクションを閉じ、暗黙の無名セクションへ積む。
    // 判定: 現在のランドマークの depth 以下に戻ったノードは、そのランドマークの
    //       子孫ではない (DFS 平坦化の不変条件より)。
    if (current.landmark !== null && node.depth <= current.landmark.depth) {
      closeCurrent();
      current = { landmark: null, items: [], minDepth: Number.POSITIVE_INFINITY };
    }

    current.items.push(node);
    if (node.depth < current.minDepth) current.minDepth = node.depth;
  }

  closeCurrent();
  return sections;
}
