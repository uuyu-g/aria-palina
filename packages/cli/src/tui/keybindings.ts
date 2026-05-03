/**
 * TUI のキーバインド定義をデータ化したテーブル。
 *
 * `App.tsx` の `useInput` ハンドラ内で長大な if-else 連鎖になっていた
 * キー判定を、`(KeyMatcher → Action)` の組として宣言的に列挙する。新しい
 * キーを足すときは `NORMAL_BINDINGS` / `MODAL_BINDINGS` にエントリを 1 つ
 * 追加するだけで済み、コンポーネント本体を変更する必要はない (OCP)。
 *
 * 各 Action は `Context` を受け取る純粋な命令で、状態更新はすべて
 * `App.tsx` が組み立てた callback を経由する。これによりロジック単体の
 * テストが可能になり、`App` レンダーから切り離して単独で検証できる。
 */

import type { NodeKind } from "@aria-palina/core";
import type { Key } from "ink";
import type { Dispatch, SetStateAction } from "react";

/**
 * キーマッチャ。`input` (文字) と `key` フラグ (`downArrow` など) のいずれか、
 * または両方を指定する。配列で与えれば「いずれかにマッチ」(OR) として扱う。
 */
export interface KeyMatcher {
  /** `input` 引数 (1 文字 or 文字列) と完全一致する場合にマッチ。 */
  input?: string;
  /** `Key` の論理値フラグのうち、`true` であるべきキー。 */
  key?: keyof Key;
}

function matchOne(input: string, key: Key, matcher: KeyMatcher): boolean {
  if (matcher.input !== undefined && input !== matcher.input) return false;
  if (matcher.key !== undefined && !key[matcher.key]) return false;
  // 何も条件が無いマッチャは常に偽 (誤って全件マッチを防ぐ)
  return matcher.input !== undefined || matcher.key !== undefined;
}

function matches(input: string, key: Key, matcher: KeyMatcher | readonly KeyMatcher[]): boolean {
  const list = Array.isArray(matcher) ? matcher : [matcher];
  return list.some((sub) => matchOne(input, key, sub));
}

/** ノーマルモード (フラット一覧) のキーバインドコンテキスト。 */
export interface NormalContext {
  nodeCount: number;
  viewport: number;
  setCursor: Dispatch<SetStateAction<number>>;
  openModal: (kind: NodeKind) => void;
  refreshNodes: () => void;
  toggleLive: () => void;
  toggleViewMode: () => void;
  triggerEnter: () => void;
  triggerSpace: () => void;
}

/** モーダル (絞り込みリスト) のキーバインドコンテキスト。 */
export interface ModalContext {
  modalKind: NodeKind;
  filteredToFull: readonly number[];
  modalCursor: number;
  modalViewport: number;
  setCursor: (n: number) => void;
  closeModal: () => void;
  switchModalKind: (current: NodeKind, direction: 1 | -1) => void;
}

interface Binding<TCtx> {
  match: KeyMatcher | readonly KeyMatcher[];
  action: (ctx: TCtx) => void;
}

/**
 * `bindings` を順に走査し、最初にマッチした Action を実行する。
 * マッチしなければ `false` を返し、呼び出し側でフォールバック処理が可能。
 */
export function dispatchKey<TCtx>(
  input: string,
  key: Key,
  bindings: readonly Binding<TCtx>[],
  ctx: TCtx,
): boolean {
  for (const binding of bindings) {
    if (matches(input, key, binding.match)) {
      binding.action(ctx);
      return true;
    }
  }
  return false;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** ノーマルモードのバインディング定義。 */
export const NORMAL_BINDINGS: readonly Binding<NormalContext>[] = [
  {
    match: [{ input: "j" }, { key: "downArrow" }],
    action: ({ nodeCount, setCursor }) => setCursor((c) => Math.min(nodeCount - 1, c + 1)),
  },
  {
    match: [{ input: "k" }, { key: "upArrow" }],
    action: ({ setCursor }) => setCursor((c) => Math.max(0, c - 1)),
  },
  {
    match: { key: "pageDown" },
    action: ({ nodeCount, viewport, setCursor }) =>
      setCursor((c) => Math.min(nodeCount - 1, c + viewport)),
  },
  {
    match: { key: "pageUp" },
    action: ({ viewport, setCursor }) => setCursor((c) => Math.max(0, c - viewport)),
  },
  { match: { input: "g" }, action: ({ setCursor }) => setCursor(0) },
  {
    match: { input: "G" },
    action: ({ nodeCount, setCursor }) => setCursor(Math.max(0, nodeCount - 1)),
  },
  { match: { input: "h" }, action: ({ openModal }) => openModal("heading") },
  { match: { input: "d" }, action: ({ openModal }) => openModal("landmark") },
  {
    match: [{ input: "r" }, { input: "R" }],
    action: ({ refreshNodes }) => refreshNodes(),
  },
  { match: { input: "L" }, action: ({ toggleLive }) => toggleLive() },
  { match: { input: "t" }, action: ({ toggleViewMode }) => toggleViewMode() },
  { match: { key: "return" }, action: ({ triggerEnter }) => triggerEnter() },
  { match: { input: " " }, action: ({ triggerSpace }) => triggerSpace() },
];

/** モーダルモードのバインディング定義。 */
export const MODAL_BINDINGS: readonly Binding<ModalContext>[] = [
  { match: { key: "escape" }, action: ({ closeModal }) => closeModal() },
  { match: { key: "return" }, action: ({ closeModal }) => closeModal() },
  {
    match: [{ input: "j" }, { key: "downArrow" }],
    action: ({ filteredToFull, modalCursor, setCursor }) => {
      if (filteredToFull.length === 0) return;
      const next = clamp(modalCursor + 1, 0, filteredToFull.length - 1);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
    },
  },
  {
    match: [{ input: "k" }, { key: "upArrow" }],
    action: ({ filteredToFull, modalCursor, setCursor }) => {
      if (filteredToFull.length === 0) return;
      const next = clamp(modalCursor - 1, 0, filteredToFull.length - 1);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
    },
  },
  {
    match: { key: "pageDown" },
    action: ({ filteredToFull, modalCursor, modalViewport, setCursor }) => {
      if (filteredToFull.length === 0) return;
      const next = clamp(modalCursor + modalViewport, 0, filteredToFull.length - 1);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
    },
  },
  {
    match: { key: "pageUp" },
    action: ({ filteredToFull, modalCursor, modalViewport, setCursor }) => {
      if (filteredToFull.length === 0) return;
      const next = clamp(modalCursor - modalViewport, 0, filteredToFull.length - 1);
      const full = filteredToFull[next];
      if (full !== undefined) setCursor(full);
    },
  },
  {
    match: { input: "g" },
    action: ({ filteredToFull, setCursor }) => {
      const full = filteredToFull[0];
      if (full !== undefined) setCursor(full);
    },
  },
  {
    match: { input: "G" },
    action: ({ filteredToFull, setCursor }) => {
      if (filteredToFull.length === 0) return;
      const full = filteredToFull[filteredToFull.length - 1];
      if (full !== undefined) setCursor(full);
    },
  },
  {
    match: { key: "leftArrow" },
    action: ({ modalKind, switchModalKind }) => switchModalKind(modalKind, -1),
  },
  {
    match: { key: "rightArrow" },
    action: ({ modalKind, switchModalKind }) => switchModalKind(modalKind, 1),
  },
];
