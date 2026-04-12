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
 * CDP 形式の AX ツリーを平坦化して `A11yNode[]` を返す。
 *
 * ### ignored の扱い
 * `ignored: true` のノードは出力配列に含めないが、子ノードは引き続き辿る。
 * ignored ノードは「透過的」であり、depth を消費しない。子は親の depth を
 * 継承する。`aria-hidden="true"` の場合は Chrome が子孫にも個別に
 * `ignored: true` を付与するため、ノード単位のチェックだけで正しく
 * サブツリー全体がスキップされる。
 *
 * ### 孤児ノード
 * `parentId` が指す親が `nodes` 内に存在しない (= 孤児) ノードは、ルート
 * として独立に扱い、`depth: 0` から走査する。
 *
 * ### 訪問済み管理
 * CDP 応答は稀に循環 or 重複を含むことがあるため、`Set<nodeId>` で訪問済み
 * を管理し、同一ノードを二度訪問しないようにする。
 */
export function flattenAXTree(rawNodes: readonly RawAXNode[]): A11yNode[] {
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

  return result;
}
