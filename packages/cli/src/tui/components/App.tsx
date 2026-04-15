import {
  cycleKind,
  filterByKind,
  findNext,
  matchesKind,
  type A11yNode,
  type NodeKind,
} from "@aria-palina/core";
import { Box, Text, useApp, useInput, useStdout, type Key } from "ink";
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

const KIND_LABEL: Readonly<Record<NodeKind, string>> = {
  heading: "見出し",
  landmark: "ランドマーク",
  interactive: "インタラクティブ",
};

const FOOTER_NORMAL = "↑/↓ 移動 Tab フォーカス h 見出し d ランドマーク g/G 先頭末尾 q 終了";
const FOOTER_FILTER = "↑/↓ 移動 ←/→ 種別切替 g/G 先頭末尾 Esc 解除 q 終了";

/**
 * `from` の位置から最寄りの `kind` 一致ノードを探す。
 * 先に順方向で走査し、見つからなければ逆方向で走査する。両方失敗すれば `-1`。
 * `from` 自身がマッチする場合も `from` を返す (フィルタ切替時に現在位置を優先するため)。
 */
function findNearest(nodes: readonly A11yNode[], from: number, kind: NodeKind): number {
  if (from >= 0 && from < nodes.length) {
    const current = nodes[from];
    if (current !== undefined && matchesKind(current, kind)) return from;
  }
  const forward = findNext(nodes, from, kind, 1);
  if (forward !== -1) return forward;
  return findNext(nodes, from, kind, -1);
}

export function App({ url, nodes, viewportOverride, onExit }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cursor, setCursor] = useState(0);
  const [filterKind, setFilterKind] = useState<NodeKind | null>(null);

  const viewport = useMemo(() => {
    if (viewportOverride !== undefined) return Math.max(MIN_VIEWPORT, viewportOverride);
    const rows = stdout?.rows ?? DEFAULT_ROWS;
    return Math.max(MIN_VIEWPORT, rows - HEADER_LINES - FOOTER_LINES);
  }, [stdout?.rows, viewportOverride]);

  // フィルタモード時の派生値: 絞り込み後のノード列と、その各要素がフル配列で
  // 何番目かを示すインデックス列。`visibleToFull[i]` は絞り込みリスト i 番目の
  // フル配列上のインデックス。
  const { visibleNodes, visibleToFull } = useMemo(() => {
    if (filterKind === null) {
      return { visibleNodes: nodes, visibleToFull: null as number[] | null };
    }
    const filtered = filterByKind(nodes, filterKind);
    const mapping: number[] = [];
    let searchFrom = 0;
    for (const node of filtered) {
      // nodes は DFS 順で重複が無いので indexOf で十分。ただし `filterByKind` が
      // 保存する順序を活かし、searchFrom を進めることで全体を O(N) に抑える。
      while (searchFrom < nodes.length && nodes[searchFrom] !== node) searchFrom++;
      mapping.push(searchFrom);
      searchFrom++;
    }
    return { visibleNodes: filtered, visibleToFull: mapping };
  }, [nodes, filterKind]);

  const visibleCursor = useMemo(() => {
    if (filterKind === null || visibleToFull === null) return cursor;
    const idx = visibleToFull.indexOf(cursor);
    return idx === -1 ? 0 : idx;
  }, [cursor, filterKind, visibleToFull]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onExit?.();
      exit();
      return;
    }
    // Tab / Shift+Tab は両モード共通でフル配列上のインタラクティブ要素を巡回する。
    // フィルタモード中に押された場合はフィルタを解除して通常モードに戻す (カーソルが
    // 絞り込みリスト外に飛ぶと表示が壊れるため)。
    if (key.tab) {
      const next = findNext(nodes, cursor, "interactive", key.shift ? -1 : 1);
      if (next !== -1) {
        setCursor(next);
        if (filterKind !== null) setFilterKind(null);
      }
      return;
    }

    if (filterKind !== null && visibleToFull !== null) {
      handleFilterMode(input, key, filterKind, visibleToFull);
      return;
    }
    handleNormalMode(input, key);
  });

  function handleNormalMode(input: string, key: Key) {
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
    if (input === "h") {
      enterFilterMode("heading");
      return;
    }
    if (input === "d") {
      enterFilterMode("landmark");
      return;
    }
  }

  function handleFilterMode(input: string, key: Key, kind: NodeKind, mapping: number[]) {
    if (key.escape) {
      setFilterKind(null);
      return;
    }
    if (mapping.length === 0) return;
    const last = mapping.length - 1;
    const clamp = (i: number) => Math.max(0, Math.min(last, i));

    if (key.downArrow || input === "j") {
      const next = clamp(visibleCursor + 1);
      const full = mapping[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.upArrow || input === "k") {
      const next = clamp(visibleCursor - 1);
      const full = mapping[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.pageDown) {
      const next = clamp(visibleCursor + viewport);
      const full = mapping[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.pageUp) {
      const next = clamp(visibleCursor - viewport);
      const full = mapping[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (input === "g") {
      const full = mapping[0];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (input === "G") {
      const full = mapping[last];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.leftArrow) {
      switchFilterKind(kind, -1);
      return;
    }
    if (key.rightArrow) {
      switchFilterKind(kind, 1);
      return;
    }
  }

  function enterFilterMode(kind: NodeKind) {
    // 通常モードからの進入時は「今の位置から次のマッチへジャンプ」。
    // 該当要素が無ければフィルタモードには入らない (空リストで UI を壊さないため)。
    const next = findNext(nodes, cursor, kind, 1);
    if (next === -1) return;
    setCursor(next);
    setFilterKind(kind);
  }

  function switchFilterKind(current: NodeKind, direction: 1 | -1) {
    const nextKind = cycleKind(current, direction);
    const idx = findNearest(nodes, cursor, nextKind);
    if (idx === -1) return; // 新しい種別に該当するノードが全く無ければ no-op。
    setCursor(idx);
    setFilterKind(nextKind);
  }

  const position =
    filterKind === null
      ? nodes.length === 0
        ? "0/0"
        : `${cursor + 1}/${nodes.length}`
      : KIND_LABEL[filterKind];

  const footer = filterKind === null ? FOOTER_NORMAL : FOOTER_FILTER;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>aria-palina</Text>
        <Text> </Text>
        <Text dimColor>{url}</Text>
        <Text> </Text>
        <Text color="gray">[{position}]</Text>
      </Box>
      <VirtualList nodes={visibleNodes} cursor={visibleCursor} viewport={viewport} />
      <Box>
        <Text dimColor>{footer}</Text>
      </Box>
    </Box>
  );
}
