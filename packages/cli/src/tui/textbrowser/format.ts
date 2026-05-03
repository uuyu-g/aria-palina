/**
 * テキストブラウザビュー用の文字列ヘルパー。
 *
 * Lynx / w3m 風の整形 (ランドマーク罫線、見出し記号、リンクラベル等) を
 * 1 箇所に集約して、行モデルから Ink `<Text>` への描画段で再利用する。
 */

const LANDMARK_BAR_WIDTH = 2;

export function formatLandmarkStartBar(role: string): string {
  const bar = "─".repeat(LANDMARK_BAR_WIDTH);
  return `${bar} ${role} ${bar}`;
}

export function formatLandmarkEndBar(role: string): string {
  const bar = "─".repeat(LANDMARK_BAR_WIDTH);
  return `${bar} /${role} ${bar}`;
}

/**
 * 見出しレベルを `#` 記号列に変換する。
 * level=1 → "#", level=2 → "##", level=6 → "######"。
 * 範囲外は 1 / 6 にクランプし、Markdown と同じ最大深度に揃える。
 */
export function formatHeadingPrefix(level: number): string {
  const clamped = Math.max(1, Math.min(6, Math.floor(level)));
  return "#".repeat(clamped);
}

export function formatLinkLabel(linkIndex: number, text: string): string {
  return `[${linkIndex}]${text}`;
}

export function formatButtonLabel(name: string): string {
  return name.length > 0 ? `[Button: ${name}]` : "[Button]";
}

export function formatFormControlLabel(
  controlType: string,
  name: string,
  stateText: string,
): string {
  const head = name.length > 0 ? `[${controlType}: ${name}]` : `[${controlType}]`;
  return stateText.length > 0 ? `${head} ${stateText}` : head;
}

/** リスト項目の行頭マーカー。Lynx と同じ `* ` ではなく Markdown 風 `- `。 */
export const LIST_MARKER = "- ";

/** 階層表現用のインデント単位 (半角スペース 2)。 */
export const INDENT_UNIT = "  ";

export function indentString(depth: number): string {
  return INDENT_UNIT.repeat(Math.max(0, depth));
}
