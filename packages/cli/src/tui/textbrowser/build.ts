/**
 * `A11yNode[]` をテキストブラウザビュー用の行モデル列に変換する純粋関数。
 *
 * - ランドマーク (`LANDMARK_ROLES`) を境界に `landmark-start` / `landmark-end`
 *   行を挿入する
 * - heading は `properties.level` を取り出して `#` 記号に変換する
 * - link はページ全体の出現順に通し番号 (1-origin) を採番し、
 *   `inlineSegments` 内のリンクも対象にする
 * - table は `enrichTableContext` が付与した `tableRowIndex` /
 *   `tableColIndex` を使って ASCII 罫線で囲んだ表に展開する
 *
 * 純粋関数で副作用なし。出力は `lines` / `nodeToLine` / `lineToNode` /
 * `links` の整合した `TextBrowserModel` を返す。
 */

import { LANDMARK_ROLES, type A11yNode, type InlineSegment } from "@aria-palina/core";
import { computeColWidths } from "./table.js";
import type { RenderSegment, TextBrowserLine, TextBrowserLink, TextBrowserModel } from "./types.js";

/**
 * テーブルセル系ロール。`@aria-palina/core` の `isTableCellRole` は内部関数
 * のため、cli 側で同じ集合を再定義している。core 側に変更があれば追従する。
 */
const TABLE_CELL_ROLES: ReadonlySet<string> = new Set([
  "cell",
  "gridcell",
  "columnheader",
  "rowheader",
]);

const TABLE_ROLES: ReadonlySet<string> = new Set(["table", "grid"]);

const HEADING_ROLE = "heading";
const PARAGRAPH_ROLES: ReadonlySet<string> = new Set(["paragraph"]);
const TEXT_ROLES: ReadonlySet<string> = new Set(["text", "StaticText"]);
const LIST_ITEM_ROLE = "listitem";
const LINK_ROLE = "link";
const BUTTON_ROLE = "button";

const FORM_CONTROL_ROLES: ReadonlySet<string> = new Set([
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "searchbox",
  "slider",
  "switch",
  "spinbutton",
]);

interface BuildContext {
  lines: TextBrowserLine[];
  nodeToLine: number[];
  lineToNode: number[];
  links: TextBrowserLink[];
  /** 開いているランドマークのスタック (LIFO で閉じる)。 */
  openLandmarks: { role: string; nodeIndex: number; depth: number }[];
}

export function buildTextBrowserLines(nodes: readonly A11yNode[]): TextBrowserModel {
  const ctx: BuildContext = {
    lines: [],
    nodeToLine: Array.from({ length: nodes.length }, () => -1),
    lineToNode: [],
    links: [],
    openLandmarks: [],
  };

  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;

    // ランドマーク開閉: depth が「現在開いているランドマークの depth 以下」に
    // 戻ったら閉じる罫線を出す。LIFO で順番に閉じる。
    closeFinishedLandmarks(ctx, node.depth);

    if (LANDMARK_ROLES.has(node.role)) {
      pushLine(ctx, { kind: "landmark-start", role: node.role, nodeIndex: i }, i);
      ctx.openLandmarks.push({ role: node.role, nodeIndex: i, depth: node.depth });
      i++;
      continue;
    }

    if (TABLE_ROLES.has(node.role)) {
      i = emitTable(ctx, nodes, i);
      continue;
    }

    if (node.role === HEADING_ROLE) {
      emitHeading(ctx, node, i);
      i++;
      continue;
    }

    if (node.role === LIST_ITEM_ROLE) {
      emitListItem(ctx, node, i);
      i++;
      continue;
    }

    if (node.role === LINK_ROLE) {
      emitStandaloneLink(ctx, node, i);
      i++;
      continue;
    }

    if (node.role === BUTTON_ROLE) {
      pushLine(
        ctx,
        {
          kind: "button",
          label: node.name,
          nodeIndex: i,
          depth: node.depth,
        },
        i,
      );
      i++;
      continue;
    }

    if (FORM_CONTROL_ROLES.has(node.role)) {
      pushLine(
        ctx,
        {
          kind: "form-control",
          controlType: node.role,
          label: node.name,
          stateText: formatStateText(node),
          nodeIndex: i,
          depth: node.depth,
        },
        i,
      );
      i++;
      continue;
    }

    if (PARAGRAPH_ROLES.has(node.role) || TEXT_ROLES.has(node.role)) {
      emitParagraph(ctx, node, i, "paragraph");
      i++;
      continue;
    }

    // フォールバック: 不明ロールは speechText を素のままパラグラフとして出す。
    // 取りこぼしを防ぐための保険であり、明示的な行種別を増やす必要がある場合は
    // 上の分岐を拡張する。
    emitParagraph(ctx, node, i, "paragraph");
    i++;
  }

  // 走査終了時にまだ開いているランドマークを全部閉じる。
  closeFinishedLandmarks(ctx, -1);

  return {
    lines: ctx.lines,
    nodeToLine: ctx.nodeToLine,
    lineToNode: ctx.lineToNode,
    links: ctx.links,
  };
}

function pushLine(ctx: BuildContext, line: TextBrowserLine, nodeIndex: number): void {
  const lineIndex = ctx.lines.length;
  ctx.lines.push(line);
  ctx.lineToNode.push(nodeIndex);
  // 同一 nodeIndex から複数行が出る (table-border / table-row) ときは、
  // 最初の出力行を代表として nodeToLine に登録する。
  if (nodeIndex >= 0 && nodeIndex < ctx.nodeToLine.length && ctx.nodeToLine[nodeIndex] === -1) {
    ctx.nodeToLine[nodeIndex] = lineIndex;
  }
}

function closeFinishedLandmarks(ctx: BuildContext, currentDepth: number): void {
  // currentDepth が「直近のランドマーク depth 以下」のあいだ閉じる。
  // 走査終了時は currentDepth=-1 を渡すことで全件閉じられる。
  while (ctx.openLandmarks.length > 0) {
    const top = ctx.openLandmarks[ctx.openLandmarks.length - 1]!;
    if (currentDepth > top.depth) break;
    ctx.openLandmarks.pop();
    pushLine(
      ctx,
      { kind: "landmark-end", role: top.role, nodeIndex: top.nodeIndex },
      top.nodeIndex,
    );
  }
}

function emitHeading(ctx: BuildContext, node: A11yNode, index: number): void {
  const rawLevel = node.properties["level"];
  const level = typeof rawLevel === "number" && Number.isFinite(rawLevel) ? rawLevel : 1;
  pushLine(
    ctx,
    {
      kind: "heading",
      level,
      text: node.name,
      nodeIndex: index,
    },
    index,
  );
}

function emitListItem(ctx: BuildContext, node: A11yNode, index: number): void {
  const segments = buildSegments(ctx, node, index);
  pushLine(
    ctx,
    {
      kind: "list-item",
      segments,
      nodeIndex: index,
      depth: node.depth,
    },
    index,
  );
}

function emitStandaloneLink(ctx: BuildContext, node: A11yNode, index: number): void {
  const linkIndex = registerLink(ctx, {
    nodeIndex: index,
    segmentIndex: null,
    backendNodeId: node.backendNodeId,
    text: node.name,
  });
  pushLine(
    ctx,
    {
      kind: "link",
      linkIndex,
      text: node.name,
      nodeIndex: index,
      depth: node.depth,
    },
    index,
  );
}

function emitParagraph(ctx: BuildContext, node: A11yNode, index: number, kind: "paragraph"): void {
  const segments = buildSegments(ctx, node, index);
  pushLine(
    ctx,
    {
      kind,
      segments,
      nodeIndex: index,
      depth: node.depth,
    },
    index,
  );
}

/**
 * `inlineSegments` を `RenderSegment[]` に変換する。リンクには通し番号を採番し、
 * リンク以外のセグメント (img 等) は素のテキストとして親本文に連結する。
 *
 * `inlineSegments[].start` / `.end` は親 `speechText` 上の UTF-16 オフセット。
 * 描画では `node.name` を本文として使うため、`speechText` に対するオフセットを
 * `node.name` 上のオフセットへシフトする。
 */
function buildSegments(ctx: BuildContext, node: A11yNode, nodeIndex: number): RenderSegment[] {
  const body = displayBody(node);
  const segments = node.inlineSegments;
  if (!segments || segments.length === 0) {
    return body.length > 0 ? [{ kind: "text", text: body }] : [];
  }

  const nameOffset = computeNameOffset(node);
  const sorted = segments
    .map((seg, segmentIndex) => ({ seg, segmentIndex }))
    .sort((a, b) => a.seg.start - b.seg.start);

  const result: RenderSegment[] = [];
  let cursor = 0;
  for (const { seg, segmentIndex } of sorted) {
    const segStart = seg.start - nameOffset;
    const segEnd = seg.end - nameOffset;
    // 範囲外 (本文と speechText の対応が崩れているケース) はスキップして
    // 取りこぼした文字を末尾でまとめて流し込む。
    if (segStart < 0 || segEnd > body.length || segStart >= segEnd) continue;
    if (segStart > cursor) {
      result.push({ kind: "text", text: body.slice(cursor, segStart) });
    }
    const segText = body.slice(segStart, segEnd);
    if (seg.role === LINK_ROLE) {
      const linkIndex = registerLink(ctx, {
        nodeIndex,
        segmentIndex,
        backendNodeId: seg.backendNodeId,
        text: segText,
      });
      result.push({ kind: "link", linkIndex, text: segText, nodeIndex, segmentIndex });
    } else {
      result.push({ kind: "text", text: segText });
    }
    cursor = segEnd;
  }
  if (cursor < body.length) {
    result.push({ kind: "text", text: body.slice(cursor) });
  }
  return result;
}

function displayBody(node: A11yNode): string {
  if (node.name.length > 0) return node.name;
  // name が無いケース (例: StaticText で speechText だけがある) は speechText から
  // ロールラベルを除去した本文を使う。`[text] foo` → `foo`。
  return stripRoleLabel(node.speechText, node.role);
}

function computeNameOffset(node: A11yNode): number {
  if (node.name.length === 0) return 0;
  const idx = node.speechText.indexOf(node.name);
  return idx >= 0 ? idx : 0;
}

function stripRoleLabel(speechText: string, role: string): string {
  const prefix = `[${role}]`;
  if (speechText.startsWith(prefix)) {
    return speechText.slice(prefix.length).trimStart();
  }
  return speechText;
}

function registerLink(ctx: BuildContext, link: Omit<TextBrowserLink, "index">): number {
  const index = ctx.links.length + 1;
  ctx.links.push({ index, ...link });
  return index;
}

function formatStateText(node: A11yNode): string {
  // 簡易: state が空なら空文字。あれば speechText の `(...)` 部分を流用する。
  // `buildSpeechText` の出力が `[role] name (state1、state2)` 形式なので、
  // 末尾の括弧を抽出する。
  const match = node.speechText.match(/\(([^)]*)\)\s*$/);
  return match ? `(${match[1]})` : "";
}

interface TableCellInfo {
  cellNodeIdx: number;
  rowIdx: number;
  colIdx: number;
  isHeader: boolean;
  text: string;
}

/**
 * `table` / `grid` ノードを起点に、子孫範囲のセルを集めて表として展開する。
 * 戻り値はテーブル範囲の終端 (次に走査すべきインデックス)。
 *
 * `enrichTableContext` が `tableRowIndex` / `tableColIndex` / `tableColCount`
 * を埋めている前提。プロパティが欠けている場合はテーブルとして扱わず、
 * フォールバックとして table ノード自体を 1 行のパラグラフで出力する。
 */
function emitTable(ctx: BuildContext, nodes: readonly A11yNode[], startIdx: number): number {
  const tableNode = nodes[startIdx]!;
  const tableDepth = tableNode.depth;
  const colCount = readNumberProperty(tableNode, "tableColCount");

  // テーブル範囲を depth で確定。
  let endIdx = startIdx + 1;
  while (endIdx < nodes.length && nodes[endIdx]!.depth > tableDepth) endIdx++;

  if (colCount === null || colCount <= 0) {
    // フォールバック: 構造が掴めないので table ノードを単純な行として出す。
    pushLine(
      ctx,
      {
        kind: "paragraph",
        segments: [{ kind: "text", text: tableNode.speechText }],
        nodeIndex: startIdx,
        depth: tableNode.depth,
      },
      startIdx,
    );
    return endIdx;
  }

  // セルを集めて行ごとにグルーピング。
  const cells: TableCellInfo[] = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const n = nodes[i]!;
    if (!TABLE_CELL_ROLES.has(n.role)) continue;
    const rowIdx = readNumberProperty(n, "tableRowIndex");
    const colIdx = readNumberProperty(n, "tableColIndex");
    if (rowIdx === null || colIdx === null) continue;
    cells.push({
      cellNodeIdx: i,
      rowIdx,
      colIdx,
      isHeader: n.role === "columnheader" || n.role === "rowheader",
      text: n.name,
    });
  }

  if (cells.length === 0) {
    // セルが取れない: フォールバック
    pushLine(
      ctx,
      {
        kind: "paragraph",
        segments: [{ kind: "text", text: tableNode.speechText }],
        nodeIndex: startIdx,
        depth: tableNode.depth,
      },
      startIdx,
    );
    return endIdx;
  }

  const rowGroups = new Map<number, TableCellInfo[]>();
  for (const c of cells) {
    if (!rowGroups.has(c.rowIdx)) rowGroups.set(c.rowIdx, []);
    rowGroups.get(c.rowIdx)!.push(c);
  }
  const sortedRows = [...rowGroups.entries()].sort((a, b) => a[0] - b[0]);

  // 列幅算出のため、各行の cells を colCount に揃える。
  const cellMatrix: string[][] = sortedRows.map(([, rowCells]) => {
    const out = Array.from({ length: colCount }, () => "");
    for (const c of rowCells) {
      const ci = c.colIdx - 1;
      if (ci >= 0 && ci < colCount) out[ci] = c.text;
    }
    return out;
  });
  const colWidths = computeColWidths(cellMatrix, colCount);

  // top border
  pushLine(
    ctx,
    {
      kind: "table-border",
      border: "top",
      colWidths,
      nodeIndex: startIdx,
      depth: tableDepth,
    },
    startIdx,
  );

  let midBorderEmitted = false;
  for (let r = 0; r < sortedRows.length; r++) {
    const [, rowCells] = sortedRows[r]!;
    const cellsArr = cellMatrix[r]!;
    const isHeader = rowCells.every((c) => c.isHeader);
    const repCellIdx = rowCells[0]?.cellNodeIdx ?? startIdx;
    pushLine(
      ctx,
      {
        kind: "table-row",
        cells: cellsArr,
        colWidths,
        isHeader,
        nodeIndex: repCellIdx,
        depth: tableDepth,
      },
      repCellIdx,
    );
    if (isHeader && !midBorderEmitted) {
      pushLine(
        ctx,
        {
          kind: "table-border",
          border: "mid",
          colWidths,
          nodeIndex: repCellIdx,
          depth: tableDepth,
        },
        repCellIdx,
      );
      midBorderEmitted = true;
    }
  }

  // bottom border
  pushLine(
    ctx,
    {
      kind: "table-border",
      border: "bottom",
      colWidths,
      nodeIndex: startIdx,
      depth: tableDepth,
    },
    startIdx,
  );

  return endIdx;
}

function readNumberProperty(node: A11yNode, key: string): number | null {
  const v = node.properties[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// 型エクスポート (テスト用に内部 helper を見せる必要が出た場合に備える)
export type { InlineSegment };
