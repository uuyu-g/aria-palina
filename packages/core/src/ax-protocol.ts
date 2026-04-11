/**
 * CDP `Accessibility` ドメインが返すメッセージの内部向け型定義。
 *
 * `@aria-palina/core` は puppeteer / playwright / chrome.debugger などの
 * 外部 SDK に依存しないため、`Accessibility.getFullAXTree` のレスポンス形
 * を自前の `interface` で最小限だけ宣言する。フィールド名は CDP の
 * 公式プロトコル定義 (devtools-protocol) と同一。
 *
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/
 * @see ../../../docs/dd.md §2.1 「データモデル」
 */

/** AX プロパティ/値の汎用コンテナ。 */
export interface RawAXValue {
  /** `"string" | "boolean" | "integer" | "idref" | "tristate" | ...` など。 */
  type: string;
  /** 実際の値。`type` によって形が変わる。 */
  value?: unknown;
}

/** `RawAXNode.properties[]` の 1 要素。 */
export interface RawAXProperty {
  /**
   * プロパティ名。例: `"focused"`, `"focusable"`, `"expanded"`, `"level"`,
   * `"disabled"`, `"checked"`, `"pressed"`, `"selected"`, `"required"`,
   * `"invalid"`, `"readonly"`, `"busy"`, `"modal"`, `"hidden"` など。
   */
  name: string;
  value: RawAXValue;
}

/**
 * CDP `Accessibility.AXNode` の部分的な形。
 *
 * `@aria-palina/core` で利用するフィールドのみを列挙する。未使用のフィールド
 * (`chromeRole`, `description`, `value`, `frameId`, ...) は意図的に省略している。
 */
export interface RawAXNode {
  /** CDP 内での一意 ID (文字列)。 */
  nodeId: string;
  /** `true` の場合、そのノードは読み上げ対象外。 */
  ignored: boolean;
  /** ARIA role (存在しないケースあり)。 */
  role?: RawAXValue;
  /** 計算済みのアクセシブルネーム。 */
  name?: RawAXValue;
  /** 状態・構造を示すプロパティ一覧。 */
  properties?: RawAXProperty[];
  /** 子ノードの `nodeId` 配列。ツリー再構成に使う。 */
  childIds?: string[];
  /** 親ノードの `nodeId`。ルート判定に使う。 */
  parentId?: string;
  /** 対応する DOM ノードの backend ID (双方向同期用)。 */
  backendDOMNodeId?: number;
}

/** `Accessibility.getFullAXTree` のレスポンス形。 */
export interface GetFullAXTreeResult {
  nodes: RawAXNode[];
}
