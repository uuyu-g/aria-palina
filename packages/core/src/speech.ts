/**
 * NVDA テキスト変換エンジン (Speech Simulator)。
 *
 * `A11yNode` の role / name / properties / state から、NVDA 風の
 * 読み上げ文字列を合成する。出力フォーマットは DD §2.3 に準拠:
 *
 *     [{Role・Properties}] {Name} ({States})
 *
 * ロール名は ARIA / Chrome AX Tree のまま（英語）で出力する。
 * 状態ラベル (STATE_LABELS) は日本語で出力する。
 *
 * 例:
 *   - `[button] 送信 (利用不可)`
 *   - `[heading2] 概要`
 *   - `[combobox] 国 (展開)`
 *
 * 純粋関数として実装しており、環境 (Node.js / ブラウザ) を問わず同じ
 * 出力を返す。新しい state を追加する場合はこのファイルの
 * `STATE_LABELS` を更新するだけで良い。
 *
 * @see ../../../docs/dd.md §2.3
 */

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

/** テーブルのセル系ロール。位置情報・列ヘッダー名の付与対象。 */
const TABLE_CELL_ROLES = new Set(["cell", "gridcell", "columnheader", "rowheader"]);

/**
 * role (＋ heading level のような構造系プロパティ) をラベル文字列へ変換する。
 *
 * ロール名はそのまま使用し、構造系プロパティを付与する:
 * - `heading`: `properties.level` を末尾に連結 → "heading2"
 * - `table` / `grid`: 行列数を付与 → "table 3行×4列"
 * - `cell` / `gridcell`: 列位置＋ヘッダー名 → "cell 3/4, 権限"
 * - `columnheader` / `rowheader`: 列位置 → "columnheader 1/4"
 */
function formatRoleLabel(role: string, properties: Record<string, unknown>): string {
  const base = role;

  if (role === "heading") {
    const level = properties["level"];
    if (typeof level === "number" && Number.isFinite(level)) {
      return `${base}${level}`;
    }
    return base;
  }

  // Table / Grid: テーブル 3行×4列
  if (role === "table" || role === "grid") {
    const rowCount = properties["tableRowCount"];
    const colCount = properties["tableColCount"];
    if (typeof rowCount === "number" && typeof colCount === "number") {
      return `${base} ${rowCount}行×${colCount}列`;
    }
    return base;
  }

  // Cell-like roles: セル 3/4, 権限 | 列見出し 1/4
  if (TABLE_CELL_ROLES.has(role)) {
    const colIndex = properties["tableColIndex"];
    const colCount = properties["tableColCount"];
    const header = properties["tableColumnHeader"];

    const hasPosition = typeof colIndex === "number" && typeof colCount === "number";
    const hasHeader =
      typeof header === "string" && header.length > 0 && (role === "cell" || role === "gridcell");

    if (!hasPosition && !hasHeader) return base;

    let label = base;
    if (hasPosition) {
      label += ` ${colIndex}/${colCount}`;
    }
    if (hasHeader) {
      label += `, ${header}`;
    }
    return label;
  }

  // Slider / Progressbar / Meter: 値表示
  if (role === "slider" || role === "progressbar" || role === "meter") {
    const valuetext = properties["valuetext"];
    if (typeof valuetext === "string" && valuetext.length > 0) {
      return `${base} ${valuetext}`;
    }
    const valuenow = properties["valuenow"];
    if (typeof valuenow === "number" && Number.isFinite(valuenow)) {
      const valuemax = properties["valuemax"];
      if (typeof valuemax === "number" && Number.isFinite(valuemax)) {
        return `${base} ${valuenow}/${valuemax}`;
      }
      return `${base} ${valuenow}`;
    }
    return base;
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
