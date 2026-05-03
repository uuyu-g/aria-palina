import { Box, Text } from "ink";
import { useMemo } from "react";
import { computeWindow } from "../virtual-window.js";
import type { TextBrowserModel } from "../textbrowser/types.js";
import { TextBrowserRow } from "./TextBrowserRow.js";

export interface TextBrowserListProps {
  model: TextBrowserModel;
  /** カーソル位置 (lines インデックス基準)。 */
  cursor: number;
  viewport: number;
}

export function TextBrowserList({ model, cursor, viewport }: TextBrowserListProps) {
  const { start, end } = useMemo(
    () => computeWindow({ total: model.lines.length, cursor, viewport }),
    [model.lines.length, cursor, viewport],
  );

  if (model.lines.length === 0) {
    return (
      <Box>
        <Text dimColor>(表示する行がありません)</Text>
      </Box>
    );
  }

  const visible = model.lines.slice(start, end);

  return (
    <Box flexDirection="column">
      {visible.map((line, i) => {
        const globalIndex = start + i;
        const selected = globalIndex === cursor;
        return (
          <TextBrowserRow key={`${globalIndex}-${line.kind}`} line={line} selected={selected} />
        );
      })}
    </Box>
  );
}
