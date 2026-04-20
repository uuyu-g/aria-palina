import type { A11yNode } from "@aria-palina/core";
import type { MinimalCDPSession } from "../playwright-cdp-adapter.js";

/** stdout / stderr をバッファリングするモック。 */
export function createWritableBuffer() {
  let buf = "";
  return {
    stream: {
      write(chunk: string) {
        buf += chunk;
        return true;
      },
    },
    get value() {
      return buf;
    },
  };
}

/** 連番でテスト用 A11yNode を生成する (TUI テスト用)。 */
export function makeNode(overrides: Partial<A11yNode> & { backendNodeId: number }): A11yNode {
  return {
    role: "text",
    name: "",
    depth: 0,
    properties: {},
    state: {},
    speechText: `[text] node-${overrides.backendNodeId}`,
    isFocusable: false,
    isIgnored: false,
    ...overrides,
  };
}

/** N 件のダミーノードを生成するファクトリ (TUI テスト用)。 */
export function makeNodes(count: number): A11yNode[] {
  return Array.from({ length: count }, (_, i) =>
    makeNode({
      backendNodeId: i + 1,
      role: "button",
      name: `ボタン${i + 1}`,
      speechText: `[button] ボタン${i + 1}`,
    }),
  );
}

/**
 * `on` / `off` のイベント登録・解除を Map で管理するスタブ。
 * `ICDPClient` / `MinimalCDPSession` 共通のリスナ実装をテスト間で共有する。
 * core 側 (`packages/core/src/__tests__/helpers.ts`) にも同名のヘルパがあるが、
 * core の test helpers は公開 API 外のためパッケージ越境 import を避ける目的で
 * 各パッケージにコピーを置いている。
 */
export function makeListenerStub() {
  const listeners = new Map<string, Set<(params: unknown) => void>>();
  return {
    on(event: string, listener: (params: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event: string, listener: (params: unknown) => void) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string, params: unknown) {
      const set = listeners.get(event);
      if (set) for (const fn of set) fn(params);
    },
    listeners,
  };
}

/**
 * イベントリスナーを管理できる MinimalCDPSession のフェイク。
 * `listeners` を使って外部からイベントを発火できる。
 */
export function createFakeSession() {
  const stub = makeListenerStub();
  const session: MinimalCDPSession = {
    async send(_method: string, _params?: Record<string, unknown>) {
      return { nodes: [{ nodeId: "1", role: { value: "button" } }] };
    },
    on: stub.on,
    off: stub.off,
  };
  return { session, listeners: stub.listeners };
}
