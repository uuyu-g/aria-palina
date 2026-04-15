/**
 * ロールごとの Ink `<Text>` props マッピング。
 *
 * CLI の `colorizeByRole` と概念的に対応するが、Ink はカラー指定を
 * props (`color`, `bold`) で行うため、ANSI エスケープ文字列ではなく
 * 構造化されたオブジェクトを返す。
 */
export interface RoleTextStyle {
  color?: string;
  bold?: boolean;
}

const ROLE_STYLES: Record<string, RoleTextStyle> = {
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
  tab: { color: "cyan" },
  tabpanel: { color: "cyan" },
  menuitem: { color: "cyan" },
  option: { color: "cyan" },
  treeitem: { color: "cyan" },
  navigation: { color: "blue", bold: true },
  main: { color: "blue", bold: true },
  banner: { color: "blue", bold: true },
  contentinfo: { color: "blue", bold: true },
  complementary: { color: "blue", bold: true },
  search: { color: "blue", bold: true },
  region: { color: "blue", bold: true },
  form: { color: "blue", bold: true },
  table: { color: "cyan", bold: true },
  grid: { color: "cyan", bold: true },
  columnheader: { color: "gray", bold: true },
  rowheader: { color: "gray", bold: true },
  img: { color: "gray" },
  figure: { color: "gray" },
  alert: { color: "red", bold: true },
  dialog: { bold: true },
  alertdialog: { color: "red", bold: true },
  status: { color: "gray" },
};

export function roleTextStyle(role: string): RoleTextStyle {
  return ROLE_STYLES[role] ?? {};
}
