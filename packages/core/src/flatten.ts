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
import { buildSpeechText } from "./speech.js";
import { enrichTableContext } from "./table-context.js";
import type { A11yNode } from "./types.js";

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
 * Chrome 内部ロールのうち、スクリーンリーダーが読み上げない描画用ノード。
 * これらは `filter: true` 時にサブツリーごと除外する (子も不要)。
 */
const NOISE_ROLES = new Set(["InlineTextBox", "ListMarker"]);

/**
 * NVDA が読み上げない構造ロール。ノード自体は出力しないが、子ノードは
 * 親の depth を引き継いで走査する (透過的)。
 *
 * - `generic` — `<div>` / `<span>` 等の意味を持たないコンテナ。
 *   ただし `name` が付与されている場合は表示する。
 * - `rowgroup` — `<thead>` / `<tbody>` / `<tfoot>` のラッパー。
 */
const TRANSPARENT_ROLES = new Set(["generic", "rowgroup"]);

/**
 * ドキュメントルート系ロール。`name` はページタイトル (`<title>`) 由来であり、
 * 子孫テキストから計算されたものではないため、StaticText 重複判定の対象外とする。
 */
const DOCUMENT_ROOT_ROLES = new Set(["RootWebArea", "WebArea"]);

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
    if (DOCUMENT_ROOT_ROLES.has(parentRole)) return "";

    // 透過ロールのうち出力されないもの (generic 名前なし / rowgroup) → さらに上を辿る
    if (TRANSPARENT_ROLES.has(parentRole)) {
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
 * 親に吸収して StaticText 行を除去する。
 *
 * 例:
 *   `[paragraph]` + `[StaticText] JavaScript`
 *   → `[paragraph] JavaScript` (1 行に統合)
 *
 * 判定条件 (flat 配列上):
 * 1. ノード A: `name` が空
 * 2. 直後のノード B: `role === "StaticText"` かつ `depth === A.depth + 1`
 * 3. B の次 (存在すれば): `depth <= A.depth` (= A の他の子がない)
 *
 * 配列をインプレースで変異させる (splice)。
 */
function absorbLoneStaticText(nodes: A11yNode[]): void {
  let i = 0;
  while (i < nodes.length - 1) {
    const parent = nodes[i]!;
    const child = nodes[i + 1]!;

    if (parent.name === "" && child.role === "StaticText" && child.depth === parent.depth + 1) {
      // 次のノード (child の後) が存在しないか、depth が parent 以下なら唯一の子
      const next = nodes[i + 2];
      if (!next || next.depth <= parent.depth) {
        // 吸収: 親の name と speechText を更新し、StaticText を除去
        parent.name = child.name;
        parent.speechText = buildSpeechText({
          role: parent.role,
          name: parent.name,
          properties: parent.properties,
          state: parent.state as Record<string, boolean | string>,
        });
        nodes.splice(i + 1, 1);
        // i は進めない (統合後の parent を再評価する必要はないが、次を見るため)
        continue;
      }
    }
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
      if (NOISE_ROLES.has(role)) return;

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
      if (TRANSPARENT_ROLES.has(role)) {
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

  // 名前なし親の唯一の StaticText 子を親に吸収して行数を削減する
  if (shouldFilter) {
    absorbLoneStaticText(result);
  }

  return result;
}
