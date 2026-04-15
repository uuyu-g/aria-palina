import type { A11yNode } from "@aria-palina/core";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useMemo, useState } from "react";
import { VirtualList } from "./VirtualList.js";

export interface AppProps {
  url: string;
  nodes: A11yNode[];
  /** ビューポート行数の明示指定 (テスト用)。未指定時は `process.stdout.rows` を使う。 */
  viewportOverride?: number;
  /** 終了時に呼ばれるコールバック (ブラウザ close 用)。 */
  onExit?: () => void;
}

const HEADER_LINES = 1;
const FOOTER_LINES = 1;
const DEFAULT_ROWS = 24;
const MIN_VIEWPORT = 3;

export function App({ url, nodes, viewportOverride, onExit }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cursor, setCursor] = useState(0);

  const viewport = useMemo(() => {
    if (viewportOverride !== undefined) return Math.max(MIN_VIEWPORT, viewportOverride);
    const rows = stdout?.rows ?? DEFAULT_ROWS;
    return Math.max(MIN_VIEWPORT, rows - HEADER_LINES - FOOTER_LINES);
  }, [stdout?.rows, viewportOverride]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onExit?.();
      exit();
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(nodes.length - 1, c + 1));
      return;
    }
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.pageDown) {
      setCursor((c) => Math.min(nodes.length - 1, c + viewport));
      return;
    }
    if (key.pageUp) {
      setCursor((c) => Math.max(0, c - viewport));
      return;
    }
    if (input === "g") {
      setCursor(0);
      return;
    }
    if (input === "G") {
      setCursor(Math.max(0, nodes.length - 1));
      return;
    }
  });

  const position = nodes.length === 0 ? "0/0" : `${cursor + 1}/${nodes.length}`;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>aria-palina</Text>
        <Text> </Text>
        <Text dimColor>{url}</Text>
        <Text> </Text>
        <Text color="gray">[{position}]</Text>
      </Box>
      <VirtualList nodes={nodes} cursor={cursor} viewport={viewport} />
      <Box>
        <Text dimColor>↑/↓ 移動 PgUp/PgDn ページ g/G 先頭/末尾 q 終了</Text>
      </Box>
    </Box>
  );
}
