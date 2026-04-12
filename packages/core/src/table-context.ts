/**
 * テーブルコンテキスト解決モジュール。
 *
 * `flattenAXTree` が生成した平坦な `A11yNode[]` を後処理し、
 * テーブル系ノード (table / grid / cell / columnheader 等) に
 * 列位置・列ヘッダー名・行列数などの構造情報を注入する。
 *
 * `buildSpeechText` が参照するプロパティキー:
 * - `tableRowCount` / `tableColCount` — テーブルノードの行列数
 * - `tableColIndex` / `tableColCount` — セルの列位置 (1-based)
 * - `tableColumnHeader` — セルが属する列のヘッダー名
 * - `tableRowIndex` / `tableRowCount` — セルの行位置 (TUI 詳細ペイン向け)
 *
 * アルゴリズム:
 * 1. 平坦配列を走査し `table` / `grid` ロールのノードを発見。
 * 2. `depth` ベースでテーブルの子孫範囲を特定。
 * 3. `row` (depth+1) → `cell` 系 (depth+2) を列挙し、ヘッダー行を識別。
 * 4. 各セルに位置情報・ヘッダー名を付与し `speechText` を再生成。
 *
 * 入れ子テーブルは depth の差で自然に分離されるため、再帰処理は不要。
 */

import { buildSpeechText } from "./speech.js";
import type { A11yNode } from "./types.js";

const TABLE_ROLES = new Set(["table", "grid"]);
const CELL_ROLES = new Set(["cell", "gridcell", "columnheader", "rowheader"]);

interface RowInfo {
  cells: number[];
}

/**
 * 平坦化済み `A11yNode[]` にテーブルコンテキスト情報を付与する (in-place)。
 *
 * `flattenAXTree` が生成した配列をそのまま受け取り、テーブル系ノードの
 * `properties` と `speechText` を更新する。配列の並び順や長さは変更しない。
 */
export function enrichTableContext(nodes: A11yNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    if (TABLE_ROLES.has(nodes[i]!.role)) {
      processTable(nodes, i);
    }
  }
}

function processTable(nodes: A11yNode[], tableIdx: number): void {
  const tableNode = nodes[tableIdx]!;
  const tableDepth = tableNode.depth;
  const rowDepth = tableDepth + 1;
  const cellDepth = tableDepth + 2;

  // テーブルの子孫範囲を特定 (depth が tableDepth 以下に戻るまで)
  let endIdx = tableIdx + 1;
  while (endIdx < nodes.length && nodes[endIdx]!.depth > tableDepth) {
    endIdx++;
  }

  // 行を収集し、各行内のセル系ノードのインデックスを記録
  const rows: RowInfo[] = [];
  for (let i = tableIdx + 1; i < endIdx; i++) {
    if (nodes[i]!.role === "row" && nodes[i]!.depth === rowDepth) {
      const row: RowInfo = { cells: [] };
      for (let j = i + 1; j < endIdx && nodes[j]!.depth > rowDepth; j++) {
        if (nodes[j]!.depth === cellDepth && CELL_ROLES.has(nodes[j]!.role)) {
          row.cells.push(j);
        }
      }
      rows.push(row);
    }
  }

  if (rows.length === 0) return;

  // ヘッダー行の特定: 全セルが columnheader の行を最初に見つける
  const columnHeaders: string[] = [];
  for (const row of rows) {
    if (row.cells.length === 0) continue;
    const allHeaders = row.cells.every((ci) => nodes[ci]!.role === "columnheader");
    if (allHeaders) {
      for (const ci of row.cells) {
        columnHeaders.push(nodes[ci]!.name);
      }
      break; // 最初のヘッダー行だけ採用
    }
  }

  // 列数の決定 (ヘッダー行 > 先頭行のセル数)
  const colCount = columnHeaders.length > 0 ? columnHeaders.length : (rows[0]?.cells.length ?? 0);
  const rowCount = rows.length;

  if (colCount === 0) return;

  // テーブルノードに行列数を付与
  tableNode.properties = {
    ...tableNode.properties,
    tableRowCount: rowCount,
    tableColCount: colCount,
  };
  rebuildSpeechText(tableNode);

  // 各行の各セルに位置情報・ヘッダー名を付与
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
      const cellNode = nodes[row.cells[colIdx]!]!;
      const newProps: Record<string, unknown> = {
        ...cellNode.properties,
        tableRowIndex: rowIdx + 1,
        tableRowCount: rowCount,
        tableColIndex: colIdx + 1,
        tableColCount: colCount,
      };
      // データセル (cell / gridcell) にのみ列ヘッダー名を付与
      if (
        (cellNode.role === "cell" || cellNode.role === "gridcell") &&
        colIdx < columnHeaders.length
      ) {
        newProps.tableColumnHeader = columnHeaders[colIdx]!;
      }
      cellNode.properties = newProps;
      rebuildSpeechText(cellNode);
    }
  }
}

function rebuildSpeechText(node: A11yNode): void {
  node.speechText = buildSpeechText({
    role: node.role,
    name: node.name,
    properties: node.properties,
    state: node.state,
  });
}
