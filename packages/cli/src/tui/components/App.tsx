import {
  cycleKind,
  filterByKind,
  findNext,
  findNextTarget,
  matchesKind,
  type A11yNode,
  type InlineSegment,
  type NodeKind,
} from "@aria-palina/core";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  dispatchKey,
  MODAL_BINDINGS,
  NORMAL_BINDINGS,
  type ModalContext,
  type NormalContext,
} from "../keybindings.js";
import { KIND_LABEL } from "../kind-label.js";
import type { ActionBridge, LiveBridge, LiveUpdate } from "../run.js";
import { buildTextBrowserLines } from "../textbrowser/build.js";
import { useHighlight, type HighlightController } from "../use-highlight.js";
import { FilterModal } from "./FilterModal.js";
import { TextBrowserList } from "./TextBrowserList.js";
import { VirtualList } from "./VirtualList.js";

export type ViewMode = "raw" | "textbrowser";

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
  /**
   * ブラウザ側の DOM 変化を購読するためのブリッジ。未指定時は静的スナップショット
   * 表示のみとなり、`r` / `L` キーは無効になる。
   */
  liveBridge?: LiveBridge | null;
  /**
   * `Enter` / `Space` でカーソル下の要素をクリック・トグルするためのブリッジ。
   * 未指定時は両キー共に no-op となる。
   */
  actionBridge?: ActionBridge | null;
  /**
   * ブラウザがヘッドレス (`--headed` 未指定) で起動しているか。
   * `true` のとき、初回の操作で「操作結果は --headed で視認可能」という
   * 警告を 1 度だけフッターに表示する。
   */
  headless?: boolean;
  /**
   * 起動時のビューモード。`"raw"` は従来のアクセシビリティツリー、
   * `"textbrowser"` は Lynx/w3m 風のリーダブルビュー。`t` キーで切替可能。
   *
   * `App` 単体のデフォルトは `raw` (テスト互換性のため)。
   * CLI から `runTui` 経由で起動した場合は `--view` フラグの値 (既定
   * `textbrowser`) が渡される。
   * @default "raw"
   */
  initialViewMode?: ViewMode;
}

const HEADER_LINES = 1;
const FOOTER_LINES = 1;
const DEFAULT_ROWS = 24;
const MIN_VIEWPORT = 3;

/** モーダル内のボーダー・タイトル・ヘルプ行で消費される行数。 */
const MODAL_CHROME_LINES = 4; // border top + title + help + border bottom

const FOOTER_NORMAL =
  "↑/↓ 移動 Tab フォーカス h 見出し d ランドマーク Enter クリック Space トグル g/G 先頭末尾 r 再取得 L ライブ t ビュー q 終了";

/** live 通知の自動消滅までの ms。 */
const LIVE_STATUS_TTL = 4_000;

/** `Enter` でクリック扱いにするロール。NVDA のデフォルト挙動に揃える。 */
const ENTER_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "option",
]);

/** `Space` でトグル扱いにするロール。 */
const SPACE_ROLES: ReadonlySet<string> = new Set(["checkbox", "radio", "switch", "button"]);

/**
 * `InlineSegment` を一時的な `A11yNode` に変換する。ActionBridge が
 * `A11yNode` を受け取るインターフェースなので、圧縮行のセグメントに対する
 * クリック操作を実装するため最小限のフィールドを合成する。
 */
function segmentAsNode(segment: InlineSegment, parent: A11yNode): A11yNode {
  return {
    backendNodeId: segment.backendNodeId,
    role: segment.role,
    name: segment.name,
    depth: parent.depth,
    properties: segment.properties,
    state: segment.state,
    speechText: segment.name,
    isFocusable: segment.isFocusable,
    isIgnored: false,
  };
}

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
  nodes: initialNodes,
  viewportOverride,
  onExit,
  highlightController = null,
  highlightDebounceMs,
  liveBridge = null,
  actionBridge = null,
  headless = false,
  initialViewMode = "raw",
}: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [nodes, setNodes] = useState<A11yNode[]>(initialNodes);
  const [cursor, setCursor] = useState(0);
  /**
   * 圧縮行の中でアクティブなセグメントインデックス。`null` は行全体を
   * 指している状態で、従来の 1 行 1 カーソル挙動と同等。`Tab` がインライン
   * 子を指したときだけ数値になり、方向キーで行が変わるときに null に戻す。
   */
  const [activeSegment, setActiveSegment] = useState<number | null>(null);
  const [modalKind, setModalKind] = useState<NodeKind | null>(null);
  const [liveEnabled, setLiveEnabled] = useState<boolean>(
    liveBridge ? liveBridge.isLiveEnabled() : false,
  );
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const headlessWarnedRef = useRef(false);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // 購読: ライブブリッジから更新を受け取って nodes を差し替える。カーソル位置は
  // backendNodeId 一致で保存復元し、見失った場合のみ 0 にフォールバック。
  useEffect(() => {
    if (!liveBridge) return;
    const unsubscribe = liveBridge.subscribe((update: LiveUpdate) => {
      setNodes((prev) => {
        const prevId = prev[cursorRef.current]?.backendNodeId;
        if (prevId && prevId > 0) {
          const nextCursor = update.nodes.findIndex((n) => n.backendNodeId === prevId);
          if (nextCursor !== -1 && nextCursor !== cursorRef.current) {
            setCursor(nextCursor);
          } else if (nextCursor === -1) {
            setCursor(0);
          }
        }
        // ライブ更新では inlineSegments の再計算が入るため、セグメント焦点は
        // 保存せず行カーソルへ戻す。ユーザーは Tab で再度セグメントへ移れる。
        setActiveSegment(null);
        return update.nodes;
      });
      // aria-live 相当の変化があれば status にメッセージを流す (NVDA 風通知)。
      const effective = update.liveChanges.filter((c) => c.politeness !== "off");
      if (effective.length > 0) {
        const head = effective[0];
        if (head) {
          const label = head.kind === "removed" ? head.before : head.after;
          const prefix = head.politeness === "assertive" ? "!" : "♪";
          setLiveStatus(`${prefix} ${label ?? ""}`);
        }
      } else if (update.cause !== "manual" && update.nodes.length !== nodes.length) {
        setLiveStatus(`⟳ ${update.nodes.length}件に更新`);
      }
    });
    return unsubscribe;
    // liveBridge は実質 runTui のライフタイムで安定。依存に含めない意図あり。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBridge]);

  // 初期 props の変化にも追従 (テスト用)。
  useEffect(() => {
    if (liveBridge) return;
    setNodes(initialNodes);
  }, [initialNodes, liveBridge]);

  // liveStatus の自動消滅。
  useEffect(() => {
    if (liveStatus === null) return;
    const id = setTimeout(() => setLiveStatus(null), LIVE_STATUS_TTL);
    return () => clearTimeout(id);
  }, [liveStatus]);

  // アクティブセグメントがあればその backendNodeId を優先。無ければ行の
  // backendNodeId をそのまま使う。ブラウザ側のハイライト枠が「今カーソルで
  // 指している要素」と常に一致する。
  const cursorBackendNodeId =
    activeSegment !== null
      ? (nodes[cursor]?.inlineSegments?.[activeSegment]?.backendNodeId ??
        nodes[cursor]?.backendNodeId ??
        0)
      : (nodes[cursor]?.backendNodeId ?? 0);
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

  // テキストブラウザモード用の行モデル。raw モードでも JSX 評価コストは発生する
  // が、`buildTextBrowserLines` は純粋関数で nodes 参照が同一なら useMemo が
  // 再計算を抑える。`r`/`L` で nodes が差し替わったタイミングで自動再計算される。
  const textBrowserModel = useMemo(() => buildTextBrowserLines(nodes), [nodes]);
  const textBrowserCursor = useMemo(() => {
    const lineIdx = textBrowserModel.nodeToLine[cursor];
    if (lineIdx === undefined || lineIdx < 0) return 0;
    return lineIdx;
  }, [textBrowserModel, cursor]);

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

  const triggerAction = useCallback(
    (allowedRoles: ReadonlySet<string>): void => {
      if (!actionBridge) return;
      const node = nodes[cursor];
      if (!node) return;

      // アクティブセグメントがあればそれを優先。セグメントは親行とは別の
      // role / backendNodeId / state を持つため、独立した A11yNode として
      // アクションブリッジに渡す。
      const segment = activeSegment !== null ? node.inlineSegments?.[activeSegment] : undefined;
      const target: A11yNode = segment ? segmentAsNode(segment, node) : node;

      if (!allowedRoles.has(target.role)) return;
      if (target.backendNodeId === 0) return;
      // 初回のヘッドレス操作だけは「視認できない」旨の警告を出し、通常の
      // クリックフィードバックを上書きする。後続の操作では普通に
      // `✱ クリック: <label>` を表示する。
      if (headless && !headlessWarnedRef.current) {
        headlessWarnedRef.current = true;
        setLiveStatus("[headless] 操作結果は --headed で視認可能");
      } else {
        const label = target.name && target.name.length > 0 ? target.name : target.role;
        setLiveStatus(`✱ クリック: ${label}`);
      }
      // CDP への送信はバックグラウンドで fire-and-forget。失敗しても TUI を
      // 壊さないよう握りつぶし、後続の live 更新に任せてカーソルを復元する。
      void actionBridge.click(target).catch(() => {});
    },
    [actionBridge, activeSegment, cursor, headless, nodes],
  );

  const openModal = useCallback(
    (kind: NodeKind) => {
      // 現在位置→前方→後方の順で最寄りのマッチを探す。
      // 該当要素が無ければモーダルは開かない (空リストで UI を壊さないため)。
      const target = findNearest(nodes, cursor, kind);
      if (target === -1) return;
      setCursor(target);
      setActiveSegment(null);
      setModalKind(kind);
    },
    [nodes, cursor],
  );

  const switchModalKind = useCallback(
    (current: NodeKind, direction: 1 | -1) => {
      const nextKind = cycleKind(current, direction);
      const idx = findNearest(nodes, cursor, nextKind);
      if (idx === -1) return; // 新しい種別に該当するノードが全く無ければ no-op。
      setCursor(idx);
      setActiveSegment(null);
      setModalKind(nextKind);
    },
    [nodes, cursor],
  );

  /**
   * Tab 以外の経路でカーソルを動かすときに使う wrap。`setActiveSegment(null)` を
   * 同時に発火し、行カーソル中心の挙動 (1 行 = 1 カーソル) に戻す。
   * NormalContext / ModalContext の `setCursor` フィールドへ注入する。
   */
  const setCursorClearSegment = useCallback<Dispatch<SetStateAction<number>>>((action) => {
    setCursor(action);
    setActiveSegment(null);
  }, []);

  useInput((input, key) => {
    // 全モード共通: q / Ctrl-C で終了。
    if (input === "q" || (key.ctrl && input === "c")) {
      onExit?.();
      exit();
      return;
    }
    // Tab / Shift+Tab は両モード共通でインタラクティブ要素を巡回する。
    // インライン圧縮行のセグメントも巡回対象に含めるため、行+セグメント
    // 座標で走査する `findNextTarget` を使う。モーダル中に押された場合は
    // モーダルを閉じて通常モードに戻す。
    if (key.tab) {
      const target = findNextTarget(
        nodes,
        { rowIndex: cursor, segmentIndex: activeSegment },
        key.shift ? -1 : 1,
      );
      if (target !== null) {
        setCursor(target.rowIndex);
        setActiveSegment(target.segmentIndex);
        if (modalKind !== null) setModalKind(null);
      }
      return;
    }

    if (modalKind !== null) {
      const ctx: ModalContext = {
        modalKind,
        filteredToFull,
        modalCursor,
        modalViewport,
        setCursor: setCursorClearSegment,
        closeModal: () => setModalKind(null),
        switchModalKind,
      };
      dispatchKey(input, key, MODAL_BINDINGS, ctx);
      return;
    }

    const ctx: NormalContext = {
      nodeCount: nodes.length,
      viewport,
      setCursor: setCursorClearSegment,
      openModal,
      refreshNodes: () => {
        if (!liveBridge) return;
        setLiveStatus("⟳ 再取得中...");
        void liveBridge.refresh();
      },
      toggleLive: () => {
        if (!liveBridge) return;
        void liveBridge.toggleLive().then((enabled) => {
          setLiveEnabled(enabled);
          setLiveStatus(enabled ? "⟳ ライブ更新 ON" : "⏸ ライブ更新 OFF");
        });
      },
      toggleViewMode: () => {
        setViewMode((prev) => {
          const next = prev === "raw" ? "textbrowser" : "raw";
          setLiveStatus(next === "textbrowser" ? "👁 ビュー: textbrowser" : "👁 ビュー: raw");
          return next;
        });
      },
      triggerEnter: () => triggerAction(ENTER_ROLES),
      triggerSpace: () => triggerAction(SPACE_ROLES),
    };
    dispatchKey(input, key, NORMAL_BINDINGS, ctx);
  });

  const position =
    modalKind === null
      ? nodes.length === 0
        ? "0/0"
        : `${cursor + 1}/${nodes.length}`
      : `${KIND_LABEL[modalKind]} ${modalCursor + 1}/${filteredNodes.length}`;

  const liveIndicator = liveBridge ? (liveEnabled ? "[live]" : "[live:off]") : "";

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>aria-palina</Text>
        <Text> </Text>
        <Text dimColor>{url}</Text>
        <Text> </Text>
        <Text color="gray">[{position}]</Text>
        {liveIndicator ? (
          <>
            <Text> </Text>
            <Text color={liveEnabled ? "green" : "gray"}>{liveIndicator}</Text>
          </>
        ) : null}
        {liveStatus ? (
          <>
            <Text> </Text>
            <Text color="yellow">{liveStatus}</Text>
          </>
        ) : null}
      </Box>
      {modalKind !== null ? (
        <FilterModal
          kind={modalKind}
          nodes={filteredNodes}
          cursor={modalCursor}
          viewport={modalViewport}
        />
      ) : viewMode === "textbrowser" ? (
        <>
          <TextBrowserList
            model={textBrowserModel}
            cursor={textBrowserCursor}
            viewport={viewport}
          />
          <Box>
            <Text dimColor>{FOOTER_NORMAL}</Text>
          </Box>
        </>
      ) : (
        <>
          <VirtualList
            nodes={nodes}
            cursor={cursor}
            viewport={viewport}
            activeSegment={activeSegment}
          />
          <Box>
            <Text dimColor>{FOOTER_NORMAL}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
