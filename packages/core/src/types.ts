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

  /**
   * 親行に吸収されたインライン子要素の範囲情報。
   *
   * `<p>これは <a>リンク</a> と <img alt="画像"/> の行</p>` のようなインライン
   * 要素を親 (paragraph) の 1 行に圧縮する際、各子要素が `speechText` のどの
   * 位置にあるかを記録する。TUI は `start`/`end` で色分け・セグメントカーソル
   * を行い、CLI は ANSI エスケープを挿入して範囲を可視化する。
   *
   * 配列の順序は `speechText` 内での出現順。`undefined` のときは吸収が行われ
   * ていないことを意味する (インライン子が無い / 条件不一致)。
   */
  inlineSegments?: InlineSegment[];
}

/**
 * 親行に吸収されたインライン子要素 1 つ分の情報。
 *
 * `start`/`end` は親の `speechText` 内の文字オフセット (UTF-16 code unit) で、
 * `speechText.slice(start, end)` が子の `name` と等しくなるよう調整済み。
 */
export interface InlineSegment {
  /** 子要素の ARIA ロール。TUI/CLI の色付けキーとして使う。 */
  role: string;

  /** 子要素のアクセシブルネーム (= `speechText.slice(start, end)`)。 */
  name: string;

  /** 詳細パネルや操作発火 (click / focus) に使う DOM backendNodeId。 */
  backendNodeId: number;

  /** `Tab` でのフォーカス対象か。親行がフォーカス不能でもセグメントは可能。 */
  isFocusable: boolean;

  /** 子要素固有の状態 (disabled / checked ...)。 */
  state: Record<string, boolean | string>;

  /** 子要素の構造系プロパティ (heading level 等、現状ほぼ未使用)。 */
  properties: Record<string, unknown>;

  /** 親 `speechText` 内の開始オフセット (inclusive)。 */
  start: number;

  /** 親 `speechText` 内の終了オフセット (exclusive)。 */
  end: number;
}
