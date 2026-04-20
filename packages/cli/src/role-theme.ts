/**
 * ロールごとの表示スタイルのマスター定義。
 *
 * CLI (`colorize.ts`, ANSI エスケープ) と TUI (`tui/role-style.ts`, Ink `<Text>` props)
 * の両方がここから参照する。色・太字の判断を一箇所に集約することで、
 * 片方だけ変更して齟齬が生じる事故を防ぐ。
 */

export interface RoleStyle {
  color?: string;
  bold?: boolean;
}

const ROLE_STYLES: Record<string, RoleStyle> = {
  // ウィジェット
  button: { color: "cyan" },
  link: { color: "blue" },
  heading: { color: "magenta", bold: true },
  textbox: { color: "yellow" },
  searchbox: { color: "yellow" },
  combobox: { color: "yellow" },
  listbox: { color: "yellow" },
  checkbox: { color: "green" },
  radio: { color: "green" },
  switch: { color: "green" },
  slider: { color: "green" },
  spinbutton: { color: "green" },
  progressbar: { color: "green" },
  meter: { color: "green" },
  // タブ
  tab: { color: "cyan" },
  tabpanel: { color: "cyan" },
  // メニュー
  menuitem: { color: "cyan" },
  option: { color: "cyan" },
  treeitem: { color: "cyan" },
  // ランドマーク
  navigation: { color: "blue", bold: true },
  main: { color: "blue", bold: true },
  banner: { color: "blue", bold: true },
  contentinfo: { color: "blue", bold: true },
  complementary: { color: "blue", bold: true },
  search: { color: "blue", bold: true },
  region: { color: "blue", bold: true },
  form: { color: "blue", bold: true },
  // テーブル
  table: { color: "cyan", bold: true },
  grid: { color: "cyan", bold: true },
  columnheader: { color: "gray", bold: true },
  rowheader: { color: "gray", bold: true },
  // メディア
  img: { color: "gray" },
  figure: { color: "gray" },
  // 通知系
  alert: { color: "red", bold: true },
  dialog: { bold: true },
  alertdialog: { color: "red", bold: true },
  status: { color: "gray" },
};

/** ロールに対応するスタイル定義を返す。未登録ロールは空オブジェクト。 */
export function getRoleStyle(role: string): RoleStyle {
  return ROLE_STYLES[role] ?? {};
}
