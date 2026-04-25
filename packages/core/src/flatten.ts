/**
 * CDP `Accessibility.getFullAXTree` が返す階層型ツリーを、DFS で走査して
 * `A11yNode[]` へ平坦化する純粋関数を提供する。
 *
 * アルゴリズム (DD §2.2):
 *
 * 1. `nodes` を `nodeId → RawAXNode` の `Map` に投入。
 * 2. `parentId` が未設定 or 親が存在しないノードを root として列挙。
 * 3. 各 root から深さ優先で `childIds` を辿る。
 * 4. `ignored: true` のノードおよびその子孫はスキップする (読み上げ対象外)。
 * 5. 訪問した各ノードを `A11yNode` に射影し、`depth` を付与して push。
 *
 * @see ../../../docs/dd.md §2.2
 */

import type { RawAXNode, RawAXProperty, RawAXValue } from "./ax-protocol.js";
import {
  isCompoundWrapperRole,
  isDocumentRootRole,
  isNoiseRole,
  isTransparentRole,
} from "./role-classification.js";
import { buildSpeechText } from "./speech.js";
import { enrichTableContext } from "./table-context.js";
import type { A11yNode, InlineSegment } from "./types.js";

/**
 * `properties[]` のうち、`A11yNode.properties` (構造系) として保持したいキー。
 * スクリーンリーダー出力の生成や UI 表示に使う情報のみを対象にする。
 */
const STRUCTURAL_PROPERTY_KEYS = new Set([
  "level",
  "valuemin",
  "valuemax",
  "valuenow",
  "valuetext",
  "roledescription",
  "keyshortcuts",
  "haspopup",
  "multiselectable",
  "orientation",
  "autocomplete",
  // aria-live 系: diffLiveRegions が NVDA 風のライブ領域通知を生成するために
  // 参照する。明示的な aria-live="polite" を持つ role 未指定の要素を正しく
  // 検出するために必要。
  "live",
  "atomic",
  "relevant",
]);

/**
 * `properties[]` のうち、`A11yNode.state` (状態系) として保持したいキー。
 * `boolean | string` 値でアナウンス対象になる状態を列挙する。
 */
const STATE_PROPERTY_KEYS = new Set([
  "focused",
  "focusable",
  "expanded",
  "disabled",
  "checked",
  "pressed",
  "selected",
  "required",
  "invalid",
  "readonly",
  "hidden",
  "modal",
  "busy",
]);

/** `RawAXValue` の中身を文字列として取り出す。未定義なら `""`。 */
function readString(value: RawAXValue | undefined): string {
  if (!value) return "";
  if (typeof value.value === "string") return value.value;
  if (value.value === undefined || value.value === null) return "";
  return String(value.value);
}

/**
 * `RawAXValue` を `boolean | string` に正規化する。
 *
 * - `"boolean" | "booleanOrUndefined"` → `boolean`
 * - `"tristate"` 等の文字列値はそのまま string で返す (`"mixed"` など)
 * - 数値はあえて string 化して保持 (state 辞書の対象外だが型制約のため)。
 */
function readStateValue(value: RawAXValue): boolean | string {
  if (typeof value.value === "boolean") return value.value;
  if (typeof value.value === "string") {
    // CDP が token 型で "true"/"false" を返す場合がある (例: invalid)。
    if (value.value === "true") return true;
    if (value.value === "false") return false;
    return value.value;
  }
  if (value.value === undefined || value.value === null) return false;
  return String(value.value);
}

/** `RawAXValue` を構造系プロパティ向けに素の値として読む。 */
function readStructuralValue(value: RawAXValue): unknown {
  return value.value;
}

/**
 * `RawAXNode.properties[]` を構造系 / 状態系の 2 つの辞書に分解する。
 */
function partitionProperties(raw: readonly RawAXProperty[] | undefined): {
  properties: Record<string, unknown>;
  state: Record<string, boolean | string>;
} {
  const properties: Record<string, unknown> = {};
  const state: Record<string, boolean | string> = {};
  if (!raw) return { properties, state };

  for (const prop of raw) {
    if (STATE_PROPERTY_KEYS.has(prop.name)) {
      state[prop.name] = readStateValue(prop.value);
    } else if (STRUCTURAL_PROPERTY_KEYS.has(prop.name)) {
      properties[prop.name] = readStructuralValue(prop.value);
    }
    // それ以外は捨てる (名前衝突・将来対応予定)。
  }
  return { properties, state };
}

/**
 * 単一の `RawAXNode` を `A11yNode` に射影する。`depth` は呼び出し側で決める。
 * Speech text の合成もここで行う。
 */
function projectNode(raw: RawAXNode, depth: number): A11yNode {
  const role = readString(raw.role) || "unknown";
  const name = readString(raw.name);
  const { properties, state } = partitionProperties(raw.properties);
  const isFocusable = state["focusable"] === true;

  return {
    backendNodeId: raw.backendDOMNodeId ?? 0,
    role,
    name,
    depth,
    properties,
    state,
    speechText: buildSpeechText({ role, name, properties, state }),
    isFocusable,
    // ignored ノードは平坦化配列に含めない方針のため常に false。
    // (将来 ignored を含めて表示するモードを追加する場合にフィールドを流用可能)
    isIgnored: false,
  };
}

/**
 * StaticText ノードの「実効親」の name を返す。
 *
 * CDP ツリーでは `generic` (名前なし) や `rowgroup` などの透過的ノード、
 * および `ignored` ノードが StaticText と実際の親要素の間に挟まることがある。
 * この関数はそれらを飛ばして最初の「出力に現れる」祖先の name を返す。
 *
 * `RootWebArea` / `WebArea` は `<title>` 由来の name を持つが子孫テキストとは
 * 無関係なので、これらに到達した場合は空文字を返す。
 */
function findEffectiveParentName(node: RawAXNode, byId: ReadonlyMap<string, RawAXNode>): string {
  let parentId = node.parentId;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) break;

    // ignored ノードは透過的 → さらに上を辿る
    if (parent.ignored) {
      parentId = parent.parentId;
      continue;
    }

    const parentRole = readString(parent.role);
    const parentName = readString(parent.name);

    // ドキュメントルートの name は <title> 由来なので判定に使わない
    if (isDocumentRootRole(parentRole)) return "";

    // 透過ロールのうち出力されないもの (generic 名前なし / rowgroup) → さらに上を辿る
    if (isTransparentRole(parentRole)) {
      if (parentRole === "generic" && parentName.length > 0) {
        // 名前付き generic はグループとして出力されるのでここで止まる
        return parentName;
      }
      parentId = parent.parentId;
      continue;
    }

    return parentName;
  }
  return "";
}

/**
 * 名前を持たない親ノードの唯一の子が StaticText である場合、テキストを
 * 親に吸収して StaticText 行を除去する。また、親が compound-wrapper クラス
 * (listitem / menuitem / treeitem / cell / gridcell) に属する場合は、
 * StaticText 以外の子ロールも `[parent] [child]` 形式へ統合して 1 行に
 * 圧縮する。
 *
 * 典型ケースは `<li><a>Home</a></li>` や `<td><button>削除</button></td>` の
 * ような、ラッパーが 1 つのインタラクティブ要素だけを包む深いネスト。
 * スクリーンリーダーは「list item, link, Home」のように連続読み上げする
 * ため、表示上も `[listitem] [link] Home` の 1 行に集約する方が可読性が高い。
 *
 * フォーカス可能性 (`isFocusable`) と状態 (`state`) は親へ伝播するため、
 * Tab モードでの到達性・disabled 表示などは保持される。
 *
 * 例:
 *   `[paragraph]` + `[StaticText] JavaScript`
 *   → `[paragraph] JavaScript` (テキスト吸収)
 *
 *   `[listitem]` + `[link] Home`
 *   → `[listitem] [link] Home` (compound 吸収)
 *
 * 判定条件 (flat 配列上):
 * 1. ノード A: `name` が空
 * 2. 直後のノード B: `depth === A.depth + 1`
 * 3. B の次 (存在すれば): `depth <= A.depth` (= A の他の子がない)
 *
 * 配列をインプレースで変異させる (splice)。
 */
function absorbLoneChild(nodes: A11yNode[]): void {
  let i = 0;
  while (i < nodes.length - 1) {
    const parent = nodes[i]!;
    const child = nodes[i + 1]!;

    if (parent.name !== "" || child.depth !== parent.depth + 1) {
      i++;
      continue;
    }

    // 次のノード (child の後) が存在しないか、depth が parent 以下なら唯一の子
    const next = nodes[i + 2];
    if (next && next.depth > parent.depth) {
      i++;
      continue;
    }

    if (child.role === "StaticText") {
      // テキスト吸収: 親の name と speechText を更新し、StaticText を除去
      parent.name = child.name;
      parent.speechText = buildSpeechText({
        role: parent.role,
        name: parent.name,
        properties: parent.properties,
        state: parent.state,
      });
      nodes.splice(i + 1, 1);
      continue;
    }

    if (isCompoundWrapperRole(parent.role)) {
      // Compound 吸収: [parentRole] [childRole] name (states) を 1 行に生成する
      const parentLabel = buildSpeechText({
        role: parent.role,
        name: "",
        properties: parent.properties,
        state: {},
      });
      const mergedState: Record<string, boolean | string> = { ...parent.state, ...child.state };
      const childLine = buildSpeechText({
        role: child.role,
        name: child.name,
        properties: child.properties,
        state: mergedState,
      });
      parent.name = child.name;
      parent.state = mergedState;
      parent.isFocusable = parent.isFocusable || child.isFocusable;
      parent.speechText = `${parentLabel} ${childLine}`;
      nodes.splice(i + 1, 1);
      continue;
    }

    i++;
  }
}

/**
 * 親行へ吸収したい「インライン」ロール。
 *
 * HTML のインライン要素 (`<a>`, `<span>`, `<strong>`, `<em>`, `<code>`,
 * `<img>` 等) に対応する ARIA / Chrome AX Tree のロール。ブロック親の
 * `speechText` に連結されて現れることを前提とする。
 *
 * `generic` は透過的に子を辿る (TRANSPARENT_ROLES) が、名前付きで残った
 * `generic` も `<span>` として扱うためここに含める。
 */
const INLINE_ROLES = new Set([
  "link",
  "StaticText",
  "generic",
  "code",
  "emphasis",
  "strong",
  "mark",
  "time",
  "abbreviation",
  "superscript",
  "subscript",
  "deletion",
  "insertion",
  "img",
  "ruby",
]);

/**
 * インライン子を吸収して 1 行にまとめる対象となるブロック系ロール。
 *
 * 「自身の `name` が子孫テキストを連結したもの」として振る舞うロールに
 * 限定する。テーブル・ランドマーク等の構造ロールは含めない (構造が消える
 * と閲覧性を損なうため)。
 */
const BLOCK_ABSORB_ROLES = new Set([
  "paragraph",
  "heading",
  "listitem",
  "cell",
  "gridcell",
  "caption",
  "blockquote",
  "definition",
  "DescriptionListTerm",
  "DescriptionListDetail",
  "figcaption",
  "label",
  "legend",
  "button",
  "link",
  "tab",
  "menuitem",
  "option",
  "treeitem",
  "generic",
]);

/**
 * ブロック親にインライン子がぶら下がっているケースを検出し、子の `name` 範囲を
 * 親 `speechText` 内のオフセットで記録して `inlineSegments` に格納する。
 * 対象となった子ノードはフラット配列から取り除く。
 *
 * 吸収条件 (`absorbLoneChild` 実行後のフラット配列に対して):
 *
 * 1. 親の role が {@link BLOCK_ABSORB_ROLES} のいずれかで `name` が非空。
 * 2. 親の直接子 (`depth === parent.depth + 1`) が 1 つ以上あり、かつ
 *    **すべての子孫** が直接子に限る (孫以降は持たない)。
 * 3. すべての直接子が {@link INLINE_ROLES} のいずれかで、`name` が非空。
 * 4. 親 `speechText` 内を順方向で走査したとき、各子の `name` が親テキスト中に
 *    出現順に見つかる (Chrome AX が通常そう計算するため大半のケースで成立)。
 *
 * 4 が満たせないケース (子 name が親 name に含まれない画像 alt 等) では吸収を
 * 行わず、元のツリーをそのまま残す。
 *
 * 注: 子に状態や focusable があっても親には伝播しない。代わりに
 * `inlineSegments[i]` にそのまま保持されるため、TUI 側で Tab ナビゲーション時に
 * セグメント単位で参照する。
 */
function absorbInlineChildren(nodes: A11yNode[]): void {
  let i = 0;
  while (i < nodes.length) {
    const parent = nodes[i]!;
    if (!BLOCK_ABSORB_ROLES.has(parent.role) || parent.name === "") {
      i++;
      continue;
    }

    // 子孫を全列挙し、直接子だけ取り出す。孫以降がある場合は安全のため吸収を
    // 諦める (入れ子インラインを扱うには position の再計算が必要で、v1 では
    // スコープ外とする)。
    const parentDepth = parent.depth;
    let descendantEnd = i + 1;
    const directChildIndices: number[] = [];
    while (descendantEnd < nodes.length && nodes[descendantEnd]!.depth > parentDepth) {
      if (nodes[descendantEnd]!.depth === parentDepth + 1) {
        directChildIndices.push(descendantEnd);
      }
      descendantEnd++;
    }
    const descendantCount = descendantEnd - (i + 1);
    if (directChildIndices.length === 0 || descendantCount !== directChildIndices.length) {
      i++;
      continue;
    }

    const allInline = directChildIndices.every((idx) => {
      const child = nodes[idx]!;
      return INLINE_ROLES.has(child.role) && child.name.length > 0;
    });
    if (!allInline) {
      i++;
      continue;
    }

    // 親 speechText 内で子 name を順方向に検索する。
    // `speechText` は `[role] name (states)` 形式なので、最低でも role prefix
    // の長さだけ飛ばした先から探索を始める。
    const searchStart = parent.speechText.indexOf(parent.name);
    if (searchStart === -1) {
      i++;
      continue;
    }
    let cursor = searchStart;
    const segments: InlineSegment[] = [];
    let ok = true;
    for (const idx of directChildIndices) {
      const child = nodes[idx]!;
      const pos = parent.speechText.indexOf(child.name, cursor);
      if (pos === -1) {
        ok = false;
        break;
      }
      segments.push({
        role: child.role,
        name: child.name,
        backendNodeId: child.backendNodeId,
        isFocusable: child.isFocusable,
        state: child.state,
        properties: child.properties,
        start: pos,
        end: pos + child.name.length,
      });
      cursor = pos + child.name.length;
    }
    if (!ok || segments.length === 0) {
      i++;
      continue;
    }

    parent.inlineSegments = segments;
    nodes.splice(i + 1, directChildIndices.length);
    i++;
  }
}

/** `flattenAXTree` の動作を制御するオプション。 */
export interface FlattenOptions {
  /**
   * `true` (デフォルト) の場合、NVDA が読み上げない内部ロールのノードを
   * 出力から除外する。
   *
   * 除外対象:
   * - `InlineTextBox` — Chrome 内部の描画用ノード
   * - `ListMarker` — リストマーカー (•, 1. 等)
   * - `StaticText` — 実効親 (透過ノードを飛ばした祖先) に `name` がある冗長ノード
   */
  filter?: boolean;
}

/**
 * CDP 形式の AX ツリーを平坦化して `A11yNode[]` を返す。
 *
 * ### ignored の扱い
 * `ignored: true` のノードは出力配列に含めないが、子ノードは引き続き辿る。
 * ignored ノードは「透過的」であり、depth を消費しない。子は親の depth を
 * 継承する。`aria-hidden="true"` の場合は Chrome が子孫にも個別に
 * `ignored: true` を付与するため、ノード単位のチェックだけで正しく
 * サブツリー全体がスキップされる。
 *
 * ### ノイズフィルタリング (filter オプション)
 * `filter: true` (デフォルト) の場合、NVDA が読み上げない Chrome 内部ロールの
 * ノードを出力から除外する。`filter: false` で生ツリーをそのまま取得可能。
 *
 * ### 孤児ノード
 * `parentId` が指す親が `nodes` 内に存在しない (= 孤児) ノードは、ルート
 * として独立に扱い、`depth: 0` から走査する。
 *
 * ### 訪問済み管理
 * CDP 応答は稀に循環 or 重複を含むことがあるため、`Set<nodeId>` で訪問済み
 * を管理し、同一ノードを二度訪問しないようにする。
 */
export function flattenAXTree(
  rawNodes: readonly RawAXNode[],
  options?: FlattenOptions,
): A11yNode[] {
  const byId = new Map<string, RawAXNode>();
  for (const node of rawNodes) {
    byId.set(node.nodeId, node);
  }

  // ルート判定: parentId が未定義、または parentId に対応するノードが無いもの。
  const roots: RawAXNode[] = [];
  for (const node of rawNodes) {
    if (node.parentId === undefined || !byId.has(node.parentId)) {
      roots.push(node);
    }
  }

  const shouldFilter = options?.filter !== false;
  const result: A11yNode[] = [];
  const visited = new Set<string>();

  const visit = (node: RawAXNode, depth: number): void => {
    if (visited.has(node.nodeId)) return;
    visited.add(node.nodeId);

    if (node.ignored) {
      // ignored ノードは出力配列に含めないが、子ノードは辿る。
      // ignored ノードは透過的 (depth を消費しない) なので、同じ depth を
      // 子に渡す。aria-hidden="true" の場合は Chrome が子孫にも個別に
      // ignored: true を付けるため、ノード単位のチェックだけで正しく動作する。
      if (!node.childIds) return;
      for (const childId of node.childIds) {
        const child = byId.get(childId);
        if (!child) continue;
        visit(child, depth);
      }
      return;
    }

    const role = readString(node.role);

    // --- ノイズフィルタリング ---
    if (shouldFilter) {
      // InlineTextBox / ListMarker は無条件で除外 (子も不要)
      if (isNoiseRole(role)) return;

      // 空白のみの StaticText は除外 (リンク間のホワイトスペース等)
      if (role === "StaticText") {
        const nodeName = readString(node.name);
        if (nodeName.trim() === "") return;
      }

      // StaticText は実効親に name があれば冗長として除外。
      // Chrome AX Tree では親の accessible name は子孫テキストから計算されるため、
      // 親に name がある場合 StaticText 子は常にその断片であり情報が重複する。
      if (role === "StaticText" && node.parentId) {
        const effectiveName = findEffectiveParentName(node, byId);
        if (effectiveName.length > 0) return;
      }

      // generic (名前なし) / rowgroup は透過的に子を辿る (depth を消費しない)
      if (isTransparentRole(role)) {
        const nodeName = readString(node.name);
        // 名前が付いている generic はグループとして表示する
        if (role === "generic" && nodeName.length > 0) {
          // fall through to normal projection
        } else {
          // 透過: ノード自体を出力せず、子を同じ depth で辿る
          if (node.childIds) {
            for (const childId of node.childIds) {
              const child = byId.get(childId);
              if (!child) continue;
              visit(child, depth);
            }
          }
          return;
        }
      }
    }

    result.push(projectNode(node, depth));

    if (!node.childIds) return;
    for (const childId of node.childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      visit(child, depth + 1);
    }
  };

  for (const root of roots) {
    visit(root, 0);
  }

  // テーブル系ノードに列位置・ヘッダー名・行列数を付与
  enrichTableContext(result);

  // 名前なし親の唯一の子を親行へ吸収して深いネストを圧縮する
  if (shouldFilter) {
    absorbLoneChild(result);
    absorbInlineChildren(result);
  }

  return result;
}
