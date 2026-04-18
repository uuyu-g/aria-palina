/**
 * リーダブルビュー中間表現の構築 (Phase 6.5)。
 *
 * `flattenAXTree` が返す素朴な平坦配列を、晴眼者にとって俯瞰しやすい
 * 「目次的なページ構造」へ再構成する純粋関数を提供する。
 *
 * アルゴリズム:
 *
 * 1. ランドマーク (banner / navigation / main / complementary /
 *    contentinfo / region / search / form) を境界として配列を
 *    {@link ReaderSection} に区切る。
 * 2. ランドマークがネストしている場合 (`<banner><nav>...</nav></banner>`)
 *    は、スタックで親子関係を追跡し、子セクションに
 *    `ReaderSection.depth` (ネスト段数) を付与する。外側のランドマークから
 *    抜けた時点で内側セクションは閉じられる。
 * 3. 各セクションは内部にアイテム列を持ち、先頭ランドマークの
 *    `depth` を基準にアイテムの `ReaderItem.depth` を相対化する。
 * 4. スクリーンリーダーが読み飛ばすだけの意味を持たないロール
 *    (`none` / `presentation`) はアイテムから除外する。
 *    `generic` (名前なし) は `flattenAXTree` が既に潰しているため
 *    重複して処理しない。
 * 5. 最初のランドマーク以前や、全ランドマークを抜けた後に現れたノードは、
 *    暗黙の前置き・後置きセクション (`landmark: null`) に積む。
 *
 * 返される `ReaderSection[]` は出力順のフラット配列。ランドマークの入れ子
 * 関係は `section.depth` (0 = トップレベル、1 = 親ランドマーク直下) と
 * 出現順から復元できる。レンダラー (CLI `formatReaderTextOutput` /
 * TUI `ReaderList`) はこの `depth` を罫線とアイテムのインデントに反映する。
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
   * セクション自身の {@link ReaderSection.depth} とは別系統である点に注意。
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
   * ランドマーク無 (暗黙セクション): 空文字列。
   */
  label: string;
  /**
   * セクションのネスト段数。
   * - `0` — トップレベル (どのランドマークにも包まれていない) / 暗黙セクション。
   * - `1` — 別のランドマーク直下に現れた入れ子ランドマーク。
   *   例: `<banner><nav>...</nav></banner>` の `nav` は depth=1。
   */
  depth: number;
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

/**
 * 作業中セクションの内部表現。`landmark !== null` のセクションは
 * `openStack` に積まれ、後からアイテムが追加される。
 */
interface WorkingSection {
  section: ReaderSection;
  /**
   * セクション内アイテムの depth 再採番の基準となる元 `A11yNode.depth`。
   * ランドマーク有のセクションでは `landmark.depth + 1` (直下の最小 depth)。
   * 暗黙セクションでは動的に最小 depth を追跡する。
   */
  baseDepth: number;
}

/**
 * `A11yNode[]` (DFS 平坦化済み) から {@link ReaderSection} の配列を構築する。
 *
 * ランドマークが入れ子になっている場合、セクションは外側→内側の順にフラット
 * 配列へ並び、`depth` フィールドが入れ子段数を表す。外側のランドマークから
 * 抜けた (= `node.depth <= outerLandmark.depth` が発生した) 時点で、より
 * 内側の開いていたセクションは全て閉じる。
 */
export function buildReaderView(nodes: readonly A11yNode[]): ReaderSection[] {
  const sections: ReaderSection[] = [];
  /** 開いているランドマークセクションのスタック (親 → 子の順)。 */
  const openStack: WorkingSection[] = [];
  /**
   * 現在受け付け中の暗黙セクション。ランドマークの開始や閉じで `null` に
   * リセットし、次にランドマーク外のノードが来たときに新規作成する。
   */
  let currentPreamble: WorkingSection | null = null;

  /** スタック最上位のランドマーク深さ以下にノードが降りたら、そのセクションを閉じる。 */
  const closeExitedSections = (nodeDepth: number): void => {
    while (openStack.length > 0) {
      const top = openStack[openStack.length - 1];
      if (!top || !top.section.landmark) break;
      if (top.section.landmark.depth < nodeDepth) break;
      openStack.pop();
    }
  };

  for (const node of nodes) {
    if (LANDMARK_ROLES.has(node.role)) {
      // 親ランドマークから抜けた子は閉じる。depth >= node.depth のものはすべて兄弟以上。
      closeExitedSections(node.depth);
      currentPreamble = null;

      const section: ReaderSection = {
        landmark: node,
        label: formatSectionLabel(node),
        depth: openStack.length, // スタックの残量 = ネスト段数
        items: [],
      };
      sections.push(section);
      openStack.push({ section, baseDepth: node.depth + 1 });
      continue;
    }
    if (SKIP_ROLES.has(node.role)) continue;

    // 外側ランドマークから抜けた場合 (nav の外に出て banner には戻らない等)
    closeExitedSections(node.depth);

    if (openStack.length === 0) {
      // 暗黙セクションに積む。直前に開いていたセクションを抜けた直後なら
      // 新しい暗黙セクションを作り、そうでなければ既存の preamble に追記する。
      if (currentPreamble === null) {
        currentPreamble = {
          section: { landmark: null, label: "", depth: 0, items: [] },
          baseDepth: node.depth, // 最初のアイテムの depth を 0 として採番
        };
        sections.push(currentPreamble.section);
      }
      // 暗黙セクション内では最小 depth を基準に再採番する
      if (node.depth < currentPreamble.baseDepth) {
        // 先に積んだアイテムの相対 depth をシフトし直す
        const shift = currentPreamble.baseDepth - node.depth;
        for (const item of currentPreamble.section.items) item.depth += shift;
        currentPreamble.baseDepth = node.depth;
      }
      currentPreamble.section.items.push({
        node,
        depth: node.depth - currentPreamble.baseDepth,
      });
      continue;
    }

    // ランドマーク配下のアイテム: 最上位 (= 最も内側) のセクションに積む
    const top = openStack[openStack.length - 1]!;
    currentPreamble = null;
    const rel = node.depth - top.baseDepth;
    top.section.items.push({ node, depth: rel < 0 ? 0 : rel });
  }

  return sections;
}
