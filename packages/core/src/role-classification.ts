/**
 * ロール分類レジストリ。`flatten.ts` / `speech.ts` で散在していたロール集合
 * (`NOISE_ROLES`, `TRANSPARENT_ROLES`, `COMPOUND_WRAPPER_ROLES`,
 * `DOCUMENT_ROOT_ROLES`, `TABLE_CELL_ROLES`) を 1 箇所に集約した内部
 * モジュール。新しい分類対象ロールを追加する際は本ファイルだけを編集する。
 *
 * `RoleClass` は実装上のフィルタリング・整形戦略を識別するためのタグであり、
 * ARIA 仕様上のロール分類とは必ずしも一致しない (例: `compound-wrapper` は
 * 「フラット配列上で唯一の子を吸収する対象」を意味する内部概念)。
 *
 * 公開 API (`src/index.ts`) からは export しない。
 */

/** 内部分類タグ。1 ロールが複数のクラスに属することがある (cell / gridcell)。 */
export type RoleClass =
  | "noise"
  | "transparent"
  | "compound-wrapper"
  | "document-root"
  | "table-cell";

/**
 * ロール → 所属クラス集合のレジストリ。
 *
 * - `noise`: NVDA が読み上げない Chrome 内部の描画用ノード (子ごと除外)。
 * - `transparent`: NVDA が読み上げない構造ロール (ノード自体は出力しないが
 *   子は親の depth を引き継いで走査)。
 * - `compound-wrapper`: フラット配列上で唯一の子を持つ場合に親行へ吸収する
 *   ラッパーロール。
 * - `document-root`: ページ全体のルート。`name` は `<title>` 由来であり
 *   StaticText 重複判定の対象外。
 * - `table-cell`: テーブル位置情報・列ヘッダー名の付与対象セル系ロール。
 */
const ROLE_CLASSES: ReadonlyMap<string, ReadonlySet<RoleClass>> = new Map<
  string,
  ReadonlySet<RoleClass>
>([
  ["InlineTextBox", new Set<RoleClass>(["noise"])],
  ["ListMarker", new Set<RoleClass>(["noise"])],
  ["generic", new Set<RoleClass>(["transparent"])],
  ["rowgroup", new Set<RoleClass>(["transparent"])],
  ["RootWebArea", new Set<RoleClass>(["document-root"])],
  ["WebArea", new Set<RoleClass>(["document-root"])],
  ["listitem", new Set<RoleClass>(["compound-wrapper"])],
  ["menuitem", new Set<RoleClass>(["compound-wrapper"])],
  ["treeitem", new Set<RoleClass>(["compound-wrapper"])],
  ["cell", new Set<RoleClass>(["compound-wrapper", "table-cell"])],
  ["gridcell", new Set<RoleClass>(["compound-wrapper", "table-cell"])],
  ["columnheader", new Set<RoleClass>(["table-cell"])],
  ["rowheader", new Set<RoleClass>(["table-cell"])],
]);

/** 任意のロールが指定クラスに属するかを判定する。 */
export function hasRoleClass(role: string, cls: RoleClass): boolean {
  return ROLE_CLASSES.get(role)?.has(cls) ?? false;
}

export const isNoiseRole = (role: string): boolean => hasRoleClass(role, "noise");
export const isTransparentRole = (role: string): boolean => hasRoleClass(role, "transparent");
export const isCompoundWrapperRole = (role: string): boolean =>
  hasRoleClass(role, "compound-wrapper");
export const isDocumentRootRole = (role: string): boolean => hasRoleClass(role, "document-root");
export const isTableCellRole = (role: string): boolean => hasRoleClass(role, "table-cell");
