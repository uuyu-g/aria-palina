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
 * 2. ランドマークがネストしている場合 (`<main>...<nav>...</nav>...</main>`)
 *    は、スタックで親子関係を追跡し、子セクションに
 *    `ReaderSection.depth` (ネスト段数) を付与する。外側のランドマークから
 *    抜けた時点で内側セクションは閉じられる。
 * 3. 内側のランドマークが終わって外側に items が再び現れた場合、
 *    元の出力位置順を保つために**継続セクション** (`continuation: true`)
 *    を新たに `sections` 配列へ挿入する。継続セクションはレンダラー側で
 *    見出し行を抑制して描画される (見出しの重複を避けつつ、入れ子内側の
 *    後ろに来る外側コンテンツを正しい位置に出す)。
 * 4. 各セクションは内部にアイテム列を持ち、先頭ランドマークの
 *    `depth` を基準にアイテムの `ReaderItem.depth` を相対化する。
 * 5. スクリーンリーダーが読み飛ばすだけの意味を持たないロール
 *    (`none` / `presentation`) はアイテムから除外する。
 *    `generic` (名前なし) は `flattenAXTree` が既に潰しているため
 *    重複して処理しない。
 * 6. 最初のランドマーク以前や、全ランドマークを抜けた後に現れたノードは、
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
   *   例: `<main>...<nav>...</nav></main>` の `nav` は depth=1。
   */
  depth: number;
  /** このセクションに属するアイテム列 (DFS 順)。 */
  items: ReaderItem[];
  /**
   * `true` のとき、このセクションは同じランドマークの「継続」を表す。
   * 内側に入れ子ランドマークが挟まったあとに外側のコンテンツが再出現した
   * 場合、元の DOM 順を保つために挿入される。レンダラーは見出し行を
   * 描画せず、items のインデントだけを継承する。
   */
  continuation: boolean;
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
 * 作業中セクションの内部表現。
 *
 * `section` は現在 items を受け付ける「末尾」の ReaderSection を指す。
 * 内側ランドマークが emit された後にこのセクションへ再びアイテムが
 * 追加されるとき、新しい継続セクションへ差し替えられる。
 */
interface WorkingSection {
  section: ReaderSection;
  /**
   * セクション内アイテムの depth 再採番の基準となる元 `A11yNode.depth`。
   * ランドマーク有のセクションでは `landmark.depth + 1` (直下の最小 depth)。
   * 暗黙セクションでは動的に最小 depth を追跡する。
   */
  baseDepth: number;
  /**
   * この working section が出力配列の「現在の末尾」として items を直接
   * 追加できる状態かどうか。`false` のときは内側ランドマークが間に挟まった
   * ことを意味し、次に items を追加するときは継続セクションを新規作成する。
   */
  isCurrent: boolean;
}

/**
 * `A11yNode[]` (DFS 平坦化済み) から {@link ReaderSection} の配列を構築する。
 *
 * ランドマークが入れ子になっている場合、セクションは外側→内側→外側の続き
 * の順にフラット配列へ並び、`depth` フィールドが入れ子段数を、
 * `continuation` フィールドが「外側の続き」かどうかを表す。
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

  /**
   * 外側ランドマークから抜けた子セクションを閉じる。
   * 閉じた後に残った top は、間に内側セクションが emit されたことを意味する
   * ので `isCurrent = false` にし、次回の addItem で継続セクションを生む。
   */
  const closeExitedSections = (nodeDepth: number): void => {
    while (openStack.length > 0) {
      const top = openStack[openStack.length - 1];
      if (!top || !top.section.landmark) break;
      if (top.section.landmark.depth < nodeDepth) break;
      openStack.pop();
      const newTop = openStack[openStack.length - 1];
      if (newTop) newTop.isCurrent = false;
    }
  };

  for (const node of nodes) {
    if (LANDMARK_ROLES.has(node.role)) {
      closeExitedSections(node.depth);
      currentPreamble = null;
      // 既存の開いているセクションは「途中で割り込まれた」状態になるので
      // 全て isCurrent=false に落とす。次に外側へ items が戻ってきたら
      // 継続セクションが作られる。
      for (const entry of openStack) entry.isCurrent = false;

      const section: ReaderSection = {
        landmark: node,
        label: formatSectionLabel(node),
        depth: openStack.length, // スタックの残量 = ネスト段数
        items: [],
        continuation: false,
      };
      sections.push(section);
      openStack.push({ section, baseDepth: node.depth + 1, isCurrent: true });
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
          section: { landmark: null, label: "", depth: 0, items: [], continuation: false },
          baseDepth: node.depth, // 最初のアイテムの depth を 0 として採番
          isCurrent: true,
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

    // ランドマーク配下のアイテム: 最上位 (= 最も内側) のセクションに積む。
    // 既に内側セクションが emit された後 (isCurrent=false) なら、見出し抑制の
    // 継続セクションを新規作成して出力配列の末尾に挿入する。
    const top = openStack[openStack.length - 1]!;
    currentPreamble = null;
    if (!top.isCurrent) {
      const continuation: ReaderSection = {
        landmark: top.section.landmark,
        label: top.section.label,
        depth: top.section.depth,
        items: [],
        continuation: true,
      };
      sections.push(continuation);
      top.section = continuation;
      top.isCurrent = true;
    }
    const rel = node.depth - top.baseDepth;
    top.section.items.push({ node, depth: rel < 0 ? 0 : rel });
  }

  return sections;
}
