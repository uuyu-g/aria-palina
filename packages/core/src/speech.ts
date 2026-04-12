/**
 * NVDA テキスト変換エンジン (Speech Simulator)。
 *
 * `A11yNode` の role / name / properties / state から、NVDA 風の日本語
 * 読み上げ文字列を合成する。出力フォーマットは DD §2.3 に準拠:
 *
 *     [{Role・Properties}] {Name} ({States})
 *
 * 例:
 *   - `[ボタン] 送信 (利用不可)`
 *   - `[見出し2] 概要`
 *   - `[コンボボックス] 国 (展開)`
 *
 * 純粋関数として実装しており、環境 (Node.js / ブラウザ) を問わず同じ
 * 出力を返す。新しい role / state を追加する場合はこのファイルの
 * `ROLE_LABELS` / `STATE_LABELS` を更新するだけで良い。
 *
 * @see ../../../docs/dd.md §2.3
 */

/** ARIA role → 日本語ラベル辞書。 */
const ROLE_LABELS: Record<string, string> = {
  button: "ボタン",
  link: "リンク",
  heading: "見出し",
  textbox: "エディット",
  searchbox: "検索",
  combobox: "コンボボックス",
  listbox: "リストボックス",
  option: "オプション",
  checkbox: "チェックボックス",
  radio: "ラジオボタン",
  switch: "スイッチ",
  slider: "スライダー",
  spinbutton: "スピンボタン",
  progressbar: "プログレスバー",
  list: "リスト",
  listitem: "リスト項目",
  table: "テーブル",
  row: "行",
  cell: "セル",
  columnheader: "列見出し",
  rowheader: "行見出し",
  dialog: "ダイアログ",
  alertdialog: "警告ダイアログ",
  alert: "警告",
  status: "ステータス",
  navigation: "ナビゲーション",
  main: "メイン",
  banner: "バナー",
  contentinfo: "コンテンツ情報",
  complementary: "補足",
  region: "領域",
  article: "記事",
  form: "フォーム",
  search: "検索",
  img: "画像",
  image: "画像",
  figure: "図",
  separator: "区切り",
  tab: "タブ",
  tablist: "タブリスト",
  tabpanel: "タブパネル",
  menu: "メニュー",
  menubar: "メニューバー",
  menuitem: "メニュー項目",
  tooltip: "ツールチップ",
  StaticText: "テキスト",
  text: "テキスト",
  InlineTextBox: "テキスト断片",
  ListMarker: "リストマーカー",
  paragraph: "段落",
  generic: "グループ",
  group: "グループ",
  RootWebArea: "ページ",
  LabelText: "ラベル",
  DisclosureTriangle: "開閉ボタン",
  tree: "ツリー",
  treeitem: "ツリー項目",
  grid: "グリッド",
  gridcell: "グリッドセル",
  application: "アプリケーション",
  document: "ドキュメント",
  toolbar: "ツールバー",
  log: "ログ",
  timer: "タイマー",
  marquee: "マーキー",
  math: "数式",
  note: "ノート",
  definition: "定義",
  term: "用語",
  meter: "メーター",
  Abbr: "略語",
  blockquote: "引用",
  code: "コード",
  deletion: "削除",
  emphasis: "強調",
  insertion: "挿入",
  strong: "太字",
  subscript: "下付き",
  superscript: "上付き",
  time: "時刻",
};

/**
 * 状態プロパティ → 日本語ラベル辞書。
 * `on` は該当状態が真 (true) / 非デフォルト値のときの読み上げ、
 * `off` は偽 (false) のときに明示的にアナウンスしたい場合のみ定義する。
 * `off` が無い状態は false のときは沈黙する (冗長になるため)。
 */
const STATE_LABELS: Record<string, { on: string; off?: string }> = {
  disabled: { on: "利用不可" },
  expanded: { on: "展開", off: "折りたたみ" },
  checked: { on: "チェック", off: "未チェック" },
  pressed: { on: "押下", off: "未押下" },
  selected: { on: "選択" },
  required: { on: "必須" },
  invalid: { on: "エラー" },
  readonly: { on: "読み取り専用" },
  busy: { on: "処理中" },
  modal: { on: "モーダル" },
};

/** `buildSpeechText` への入力。`A11yNode` の一部フィールドと同型。 */
export interface SpeechInput {
  role: string;
  name: string;
  properties: Record<string, unknown>;
  state: Record<string, boolean | string>;
}

/**
 * role (＋ heading level のような構造系プロパティ) を日本語ラベルへ変換する。
 *
 * `heading` のみ特殊で `properties.level` を末尾に付けて "見出し2" のように
 * する。辞書にない role はそのまま表示する (デバッグ容易性のため)。
 */
function formatRoleLabel(role: string, properties: Record<string, unknown>): string {
  const base = ROLE_LABELS[role] ?? role;
  if (role === "heading") {
    const level = properties["level"];
    if (typeof level === "number" && Number.isFinite(level)) {
      return `${base}${level}`;
    }
  }
  return base;
}

/**
 * state 辞書から NVDA 風の状態文字列配列を作る。
 *
 * - `boolean` 値で `true` なら `on` ラベルを採用。
 * - `boolean` 値で `false` かつ `off` ラベルがあるときのみ `off` を採用。
 * - `string` 値 (例: tristate の `"mixed"`) はそのまま採用する。
 * - 辞書にないキーは無視する。
 */
function formatStateLabels(state: Record<string, boolean | string>): string[] {
  const labels: string[] = [];
  for (const [key, raw] of Object.entries(state)) {
    const dict = STATE_LABELS[key];
    if (!dict) continue;
    if (typeof raw === "boolean") {
      if (raw) {
        labels.push(dict.on);
      } else if (dict.off) {
        labels.push(dict.off);
      }
    } else if (typeof raw === "string" && raw.length > 0) {
      // tristate "mixed" 等。そのまま読み上げに混ぜる。
      labels.push(`${dict.on}:${raw}`);
    }
  }
  return labels;
}

/**
 * NVDA 風の読み上げテキストを構築する純粋関数。
 *
 * 出力フォーマット (DD §2.3): `[{Role・Properties}] {Name} ({States})`
 *
 * - `name` が空文字列のときは `{Name}` セクションを省略する。
 * - アナウンスすべき状態が 1 つも無いときは `({States})` セクションを省略する。
 * - 複数状態は `、` (全角カンマ) で連結する。
 */
export function buildSpeechText(input: SpeechInput): string {
  const roleLabel = formatRoleLabel(input.role, input.properties);
  const stateLabels = formatStateLabels(input.state);

  let result = `[${roleLabel}]`;
  if (input.name.length > 0) {
    result += ` ${input.name}`;
  }
  if (stateLabels.length > 0) {
    result += ` (${stateLabels.join("、")})`;
  }
  return result;
}
