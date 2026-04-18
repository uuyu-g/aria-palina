/**
 * 平坦化された Accessibility Object Model ノード。
 *
 * CDP (`Accessibility.getFullAXTree`) から取得した階層型ツリーを
 * DFS で走査し、以下のフラットな配列へ変換した結果の 1 要素。
 *
 * 変換ロジック本体（DFS 走査・Speech Simulator）は Phase 2 で
 * 実装されるが、データ形状は Phase 1 で確定させておく。
 *
 * @see ../../../docs/dd.md §2.1 「データモデル」
 */
export interface A11yNode {
  /** DOM のハイライト同期に使用する CDP 内部 ID。 */
  backendNodeId: number;

  /** ARIA ロール（例: `"button"`, `"heading"`）。 */
  role: string;

  /** 計算済みのアクセシブルネーム。 */
  name: string;

  /** ツリーの階層の深さ（インデント描画用）。 */
  depth: number;

  /** ロール固有のプロパティ（例: 見出しの `{ level: 2 }`）。 */
  properties: Record<string, unknown>;

  /** 可変状態（例: `{ expanded: true, disabled: false }`）。 */
  state: Record<string, boolean | string>;

  /**
   * NVDA が発話するテキスト表現。
   * フォーマット規約: `[{Role・Properties}] {Name} ({States})`
   */
  speechText: string;

  /** Tab キーでのジャンプ対象か。 */
  isFocusable: boolean;

  /** `role="presentation"` や `aria-hidden="true"` 等で読み上げから除外されているか。 */
  isIgnored: boolean;
}
