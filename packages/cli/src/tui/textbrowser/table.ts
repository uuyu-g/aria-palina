/**
 * テキストブラウザビュー用テーブル描画ヘルパー。
 *
 * `enrichTableContext` で付与された `tableRowIndex` / `tableColIndex` /
 * `tableColCount` を使って、ASCII 罫線で囲んだ表を組み立てる。
 *
 * Lynx / w3m が使う `+`/`-`/`|` の素朴な罫線を採用する。Unicode 罫線も
 * 候補だがフォント等の互換性を優先して ASCII にする。
 */

const MIN_COL_WIDTH = 3;

/**
 * 文字列の表示幅を概算する。
 *
 * 完全な East Asian Width 判定はせず、CJK 漢字・かな・全角記号を 2 と
 * みなす素朴な実装。罫線の左右が 1 文字ズレることはあるが、極端に
 * 崩れない最低限の見栄えを担保する。
 */
export function displayWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // ハングル ジャモ
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首・記号
    (code >= 0x3041 && code <= 0x33ff) || // ひらがな・カタカナ・互換
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 拡張 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 統合漢字
    (code >= 0xa000 && code <= 0xa4cf) || // ヤイ
    (code >= 0xac00 && code <= 0xd7a3) || // ハングル音節
    (code >= 0xf900 && code <= 0xfaff) || // CJK 互換漢字
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 互換記号
    (code >= 0xff00 && code <= 0xff60) || // 全角 ASCII
    (code >= 0xffe0 && code <= 0xffe6) // 全角通貨記号
  );
}

/** 列幅配列を入力に、`+---+---+` 形式の罫線文字列を組み立てる。 */
export function formatBorder(colWidths: readonly number[]): string {
  const segments = colWidths.map((w) => "-".repeat(Math.max(MIN_COL_WIDTH, w) + 2));
  return `+${segments.join("+")}+`;
}

/** セル内容と列幅から `| a | b |` 形式の行文字列を組み立てる。 */
export function formatRow(cells: readonly string[], colWidths: readonly number[]): string {
  const padded = cells.map((cell, i) => {
    const width = Math.max(MIN_COL_WIDTH, colWidths[i] ?? MIN_COL_WIDTH);
    const padding = Math.max(0, width - displayWidth(cell));
    return ` ${cell}${" ".repeat(padding)} `;
  });
  return `|${padded.join("|")}|`;
}

/** 各列の最大表示幅を算出する。空セルや欠落セルも MIN_COL_WIDTH を保証。 */
export function computeColWidths(rows: readonly string[][], colCount: number): number[] {
  const widths = Array.from({ length: colCount }, () => MIN_COL_WIDTH);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? "";
      const w = displayWidth(cell);
      if (w > widths[c]!) widths[c] = w;
    }
  }
  return widths;
}
