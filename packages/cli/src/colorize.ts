const ANSI_RESET = "\u001b[0m";

const ANSI_CODES: Record<string, string> = {
  cyan: "\u001b[36m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  gray: "\u001b[90m",
  bold: "\u001b[1m",
};

const ROLE_STYLES: Record<string, string[]> = {
  // ウィジェット
  button: ["cyan"],
  link: ["blue"],
  heading: ["bold", "magenta"],
  textbox: ["yellow"],
  searchbox: ["yellow"],
  combobox: ["yellow"],
  listbox: ["yellow"],
  checkbox: ["green"],
  radio: ["green"],
  switch: ["green"],
  slider: ["green"],
  spinbutton: ["green"],
  progressbar: ["green"],
  meter: ["green"],
  // タブ
  tab: ["cyan"],
  tabpanel: ["cyan"],
  // メニュー
  menuitem: ["cyan"],
  option: ["cyan"],
  treeitem: ["cyan"],
  // ランドマーク
  navigation: ["bold", "blue"],
  main: ["bold", "blue"],
  banner: ["bold", "blue"],
  contentinfo: ["bold", "blue"],
  complementary: ["bold", "blue"],
  search: ["bold", "blue"],
  region: ["bold", "blue"],
  form: ["bold", "blue"],
  // テーブル
  table: ["bold", "cyan"],
  grid: ["bold", "cyan"],
  columnheader: ["bold", "gray"],
  rowheader: ["bold", "gray"],
  // メディア
  img: ["gray"],
  figure: ["gray"],
  // 通知系
  alert: ["bold", "red"],
  dialog: ["bold"],
  alertdialog: ["bold", "red"],
  status: ["gray"],
};

export function colorizeByRole(role: string, text: string): string {
  const styles = ROLE_STYLES[role];
  if (!styles) return text;
  const prefix = styles.map((s) => ANSI_CODES[s]).join("");
  return `${prefix}${text}${ANSI_RESET}`;
}
