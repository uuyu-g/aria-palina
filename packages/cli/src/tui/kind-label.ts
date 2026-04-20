import type { NodeKind } from "@aria-palina/core";

/** NodeKind → 日本語表示ラベル。ヘッダー・モーダルタブ等で共用。 */
export const KIND_LABEL: Readonly<Record<NodeKind, string>> = {
  heading: "見出し",
  landmark: "ランドマーク",
  interactive: "インタラクティブ",
};
