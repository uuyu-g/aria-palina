import type { A11yNode } from "@aria-palina/core";
import { Text } from "ink";
import { memo } from "react";
import { roleTextStyle } from "../role-style.js";

export interface NodeRowProps {
  node: A11yNode;
  selected: boolean;
  /**
   * `node.depth` ベースのインデント文字列を上書きする。
   * ReaderList が左レール (`│ `) を含んだプレフィクスを渡すために使う。
   * 未指定のときは従来どおり `"  ".repeat(node.depth)` になる。
   */
  indentPrefix?: string;
}

function NodeRowImpl({ node, selected, indentPrefix }: NodeRowProps) {
  const indent = indentPrefix ?? "  ".repeat(node.depth);
  const prefix = selected ? "> " : "  ";
  const style = roleTextStyle(node.role);

  if (selected) {
    // 選択行はロールスタイルより視認性優先で反転表示する。
    return (
      <Text inverse wrap="truncate-end">
        {prefix}
        {indent}
        {node.speechText}
      </Text>
    );
  }

  return (
    <Text color={style.color} bold={style.bold} wrap="truncate-end">
      {prefix}
      {indent}
      {node.speechText}
    </Text>
  );
}

export const NodeRow = memo(NodeRowImpl);
