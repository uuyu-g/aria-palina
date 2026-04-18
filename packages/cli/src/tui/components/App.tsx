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
import { useHighlight, type HighlightController } from "../use-highlight.js";
import { FilterModal } from "./FilterModal.js";
import { VirtualList } from "./VirtualList.js";

export interface AppProps {
  url: string;
  nodes: A11yNode[];
  /** ビューポート行数の明示指定 (テスト用)。未指定時は `process.stdout.rows` を使う。 */
  viewportOverride?: number;
  /** 終了時に呼ばれるコールバック (ブラウザ close 用)。 */
  onExit?: () => void;
  /**
   * `--headed` モードでブラウザ画面と TUI カーソルを同期するためのコントローラ。
   * `null` (既定) のときはハイライト処理を行わない。
   */
  highlightController?: HighlightController | null;
  /** カーソル変更から CDP 発火までの debounce (ms)。テスト用。 */
  highlightDebounceMs?: number;
}

const HEADER_LINES = 1;
const FOOTER_LINES = 1;
const DEFAULT_ROWS = 24;
const MIN_VIEWPORT = 3;

/** モーダル内のボーダー・タイトル・ヘルプ行で消費される行数。 */
const MODAL_CHROME_LINES = 4; // border top + title + help + border bottom

const KIND_LABEL: Readonly<Record<NodeKind, string>> = {
  heading: "見出し",
  landmark: "ランドマーク",
  interactive: "インタラクティブ",
};

const FOOTER_NORMAL = "↑/↓ 移動 Tab フォーカス h 見出し d ランドマーク g/G 先頭末尾 q 終了";

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

export function App({
  url,
  nodes,
  viewportOverride,
  onExit,
  highlightController = null,
  highlightDebounceMs,
}: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cursor, setCursor] = useState(0);
  const [modalKind, setModalKind] = useState<NodeKind | null>(null);

  const cursorBackendNodeId = nodes[cursor]?.backendNodeId ?? 0;
  useHighlight(highlightController, cursorBackendNodeId, {
    ...(highlightDebounceMs !== undefined && { debounceMs: highlightDebounceMs }),
  });

  const viewport = useMemo(() => {
    if (viewportOverride !== undefined) return Math.max(MIN_VIEWPORT, viewportOverride);
    const rows = stdout?.rows ?? DEFAULT_ROWS;
    return Math.max(MIN_VIEWPORT, rows - HEADER_LINES - FOOTER_LINES);
  }, [stdout?.rows, viewportOverride]);

  // モーダル表示時の絞り込みノードとインデックスマッピング
  const { filteredNodes, filteredToFull } = useMemo(() => {
    if (modalKind === null) {
      return { filteredNodes: [] as A11yNode[], filteredToFull: [] as number[] };
    }
    const filtered = filterByKind(nodes, modalKind);
    const mapping: number[] = [];
    let searchFrom = 0;
    for (const node of filtered) {
      while (searchFrom < nodes.length && nodes[searchFrom] !== node) searchFrom++;
      mapping.push(searchFrom);
      searchFrom++;
    }
    return { filteredNodes: filtered, filteredToFull: mapping };
  }, [nodes, modalKind]);

  // モーダル内カーソル (filteredNodes 内のインデックス)
  const modalCursor = useMemo(() => {
    if (modalKind === null || filteredToFull.length === 0) return 0;
    const idx = filteredToFull.indexOf(cursor);
    return idx === -1 ? 0 : idx;
  }, [cursor, modalKind, filteredToFull]);

  // モーダルのアイテム表示用ビューポート
  const modalViewport = useMemo(
    () => Math.max(1, viewport + FOOTER_LINES - MODAL_CHROME_LINES),
    [viewport],
  );

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onExit?.();
      exit();
      return;
    }
    // Tab / Shift+Tab は両モード共通でフル配列上のインタラクティブ要素を巡回する。
    // モーダル中に押された場合はモーダルを閉じて通常モードに戻す。
    if (key.tab) {
      const next = findNext(nodes, cursor, "interactive", key.shift ? -1 : 1);
      if (next !== -1) {
        setCursor(next);
        if (modalKind !== null) setModalKind(null);
      }
      return;
    }

    if (modalKind !== null) {
      handleModalMode(input, key, modalKind);
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
      openModal("heading");
      return;
    }
    if (input === "d") {
      openModal("landmark");
      return;
    }
  }

  function handleModalMode(input: string, key: Key, kind: NodeKind) {
    if (key.escape) {
      setModalKind(null);
      return;
    }
    if (key.return) {
      // Enter: 現在位置で確定してモーダルを閉じる
      setModalKind(null);
      return;
    }

    if (filteredToFull.length === 0) return;
    const last = filteredToFull.length - 1;
    const clamp = (i: number) => Math.max(0, Math.min(last, i));

    if (key.downArrow || input === "j") {
      const next = clamp(modalCursor + 1);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.upArrow || input === "k") {
      const next = clamp(modalCursor - 1);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.pageDown) {
      const next = clamp(modalCursor + modalViewport);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.pageUp) {
      const next = clamp(modalCursor - modalViewport);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (input === "g") {
      const full = filteredToFull[0];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (input === "G") {
      const full = filteredToFull[last];
      if (full !== undefined) setCursor(full);
      return;
    }
    if (key.leftArrow) {
      switchModalKind(kind, -1);
      return;
    }
    if (key.rightArrow) {
      switchModalKind(kind, 1);
      return;
    }
  }

  function openModal(kind: NodeKind) {
    // 現在位置→前方→後方の順で最寄りのマッチを探す。
    // 該当要素が無ければモーダルは開かない (空リストで UI を壊さないため)。
    const target = findNearest(nodes, cursor, kind);
    if (target === -1) return;
    setCursor(target);
    setModalKind(kind);
  }

  function switchModalKind(current: NodeKind, direction: 1 | -1) {
    const nextKind = cycleKind(current, direction);
    const idx = findNearest(nodes, cursor, nextKind);
    if (idx === -1) return; // 新しい種別に該当するノードが全く無ければ no-op。
    setCursor(idx);
    setModalKind(nextKind);
  }

  const position =
    modalKind === null
      ? nodes.length === 0
        ? "0/0"
        : `${cursor + 1}/${nodes.length}`
      : `${KIND_LABEL[modalKind]} ${modalCursor + 1}/${filteredNodes.length}`;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>aria-palina</Text>
        <Text> </Text>
        <Text dimColor>{url}</Text>
        <Text> </Text>
        <Text color="gray">[{position}]</Text>
      </Box>
      {modalKind !== null ? (
        <FilterModal
          kind={modalKind}
          nodes={filteredNodes}
          cursor={modalCursor}
          viewport={modalViewport}
        />
      ) : (
        <>
          <VirtualList nodes={nodes} cursor={cursor} viewport={viewport} />
          <Box>
            <Text dimColor>{FOOTER_NORMAL}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
