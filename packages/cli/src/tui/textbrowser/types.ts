/**
 * テキストブラウザ (Lynx / w3m 風) ビューの行モデル。
 *
 * `A11yNode[]` を入力に受け取り、晴眼者がページ構造を俯瞰しやすい
 * リーダブルな表示用列に変換するための中間表現。
 *
 * - ランドマーク境界は `── main ──` のような罫線で囲む
 * - 見出しは `#` / `##` / `###` で強調
 * - リンクは `[1]リンクテキスト` のように通し番号付き
 *
 * `nodeIndex` は元の `A11yNode[]` 内のインデックスを表す。これにより
 * カーソル位置の往復変換 (行モデル <-> 元配列) が可能になる。
 *
 * 描画専用の中間表現であり、`@aria-palina/core` の出力 (`buildSpeechText` /
 * `A11yNode`) とは独立して進化させる。
 */

export interface RenderTextSegment {
  kind: "text";
  text: string;
}

export interface RenderLinkSegment {
  kind: "link";
  /** ページ内通し番号 (1-origin)。 */
  linkIndex: number;
  text: string;
  /** 元 `A11yNode[]` のインデックス (リンクが乗っている行)。 */
  nodeIndex: number;
  /** 親行内の `inlineSegments` インデックス。単独 `link` 行なら null。 */
  segmentIndex: number | null;
}

export type RenderSegment = RenderTextSegment | RenderLinkSegment;

export type TextBrowserLine =
  | { kind: "landmark-start"; role: string; nodeIndex: number }
  | { kind: "landmark-end"; role: string; nodeIndex: number }
  | { kind: "heading"; level: number; text: string; nodeIndex: number }
  | { kind: "paragraph"; segments: RenderSegment[]; nodeIndex: number; depth: number }
  | { kind: "list-item"; segments: RenderSegment[]; nodeIndex: number; depth: number }
  | { kind: "link"; linkIndex: number; text: string; nodeIndex: number; depth: number }
  | { kind: "button"; label: string; nodeIndex: number; depth: number }
  | {
      kind: "form-control";
      controlType: string;
      label: string;
      stateText: string;
      nodeIndex: number;
      depth: number;
    }
  | {
      kind: "table-row";
      cells: string[];
      colWidths: number[];
      isHeader: boolean;
      nodeIndex: number;
      depth: number;
    }
  | {
      kind: "table-border";
      border: "top" | "mid" | "bottom";
      colWidths: number[];
      nodeIndex: number;
      depth: number;
    }
  | { kind: "blank"; nodeIndex: number };

/** ページ全体のリンク索引 (Tab 巡回 / 将来のジャンプ拡張用)。 */
export interface TextBrowserLink {
  /** 1-origin の通し番号 (表示と一致)。 */
  index: number;
  /** リンクが属する元 `A11yNode[]` インデックス。 */
  nodeIndex: number;
  /** 親行内 `inlineSegments` のインデックス。単独 link 行なら null。 */
  segmentIndex: number | null;
  backendNodeId: number;
  text: string;
}

export interface TextBrowserModel {
  lines: TextBrowserLine[];
  /** 元 `A11yNode[]` インデックス → `lines` の代表行インデックス。 */
  nodeToLine: number[];
  /** `lines` インデックス → 元 `A11yNode[]` インデックス。 */
  lineToNode: number[];
  links: TextBrowserLink[];
}
