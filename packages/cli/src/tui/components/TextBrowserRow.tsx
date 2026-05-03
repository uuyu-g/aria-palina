import { Text } from "ink";
import { memo, type ReactNode } from "react";
import { roleTextStyle } from "../role-style.js";
import { formatBorder, formatRow } from "../textbrowser/table.js";
import {
  formatButtonLabel,
  formatFormControlLabel,
  formatHeadingPrefix,
  formatLandmarkEndBar,
  formatLandmarkStartBar,
  formatLinkLabel,
  indentString,
  LIST_MARKER,
} from "../textbrowser/format.js";
import type { RenderSegment, TextBrowserLine } from "../textbrowser/types.js";

export interface TextBrowserRowProps {
  line: TextBrowserLine;
  selected: boolean;
}

function renderSegments(segments: RenderSegment[]): ReactNode[] {
  return segments.map((seg, i) => {
    if (seg.kind === "text") {
      return <Text key={`t-${i}`}>{seg.text}</Text>;
    }
    const linkStyle = roleTextStyle("link");
    return (
      <Text key={`l-${i}`} color={linkStyle.color} bold={linkStyle.bold}>
        {formatLinkLabel(seg.linkIndex, seg.text)}
      </Text>
    );
  });
}

function renderContent(line: TextBrowserLine): ReactNode {
  switch (line.kind) {
    case "landmark-start": {
      const style = roleTextStyle(line.role);
      return (
        <Text color={style.color} bold>
          {formatLandmarkStartBar(line.role)}
        </Text>
      );
    }
    case "landmark-end": {
      const style = roleTextStyle(line.role);
      return (
        <Text color={style.color} dimColor>
          {formatLandmarkEndBar(line.role)}
        </Text>
      );
    }
    case "heading": {
      const style = roleTextStyle("heading");
      return (
        <Text color={style.color} bold>
          {`${formatHeadingPrefix(line.level)} ${line.text}`}
        </Text>
      );
    }
    case "paragraph": {
      return (
        <Text>
          <Text>{indentString(line.depth)}</Text>
          {renderSegments(line.segments)}
        </Text>
      );
    }
    case "list-item": {
      return (
        <Text>
          <Text>{indentString(line.depth)}</Text>
          <Text dimColor>{LIST_MARKER}</Text>
          {renderSegments(line.segments)}
        </Text>
      );
    }
    case "link": {
      const style = roleTextStyle("link");
      return (
        <Text>
          <Text>{indentString(line.depth)}</Text>
          <Text color={style.color} bold={style.bold}>
            {formatLinkLabel(line.linkIndex, line.text)}
          </Text>
        </Text>
      );
    }
    case "button": {
      const style = roleTextStyle("button");
      return (
        <Text>
          <Text>{indentString(line.depth)}</Text>
          <Text color={style.color} bold={style.bold}>
            {formatButtonLabel(line.label)}
          </Text>
        </Text>
      );
    }
    case "form-control": {
      const style = roleTextStyle(line.controlType);
      return (
        <Text>
          <Text>{indentString(line.depth)}</Text>
          <Text color={style.color}>
            {formatFormControlLabel(line.controlType, line.label, line.stateText)}
          </Text>
        </Text>
      );
    }
    case "table-border": {
      return <Text dimColor>{formatBorder(line.colWidths)}</Text>;
    }
    case "table-row": {
      const text = formatRow(line.cells, line.colWidths);
      return line.isHeader ? <Text bold>{text}</Text> : <Text>{text}</Text>;
    }
    case "blank":
      return <Text> </Text>;
  }
}

function TextBrowserRowImpl({ line, selected }: TextBrowserRowProps) {
  const prefix = selected ? "> " : "  ";
  return (
    <Text wrap="truncate-end" inverse={selected}>
      <Text>{prefix}</Text>
      {renderContent(line)}
    </Text>
  );
}

export const TextBrowserRow = memo(TextBrowserRowImpl);
