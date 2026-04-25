import { vi } from "vite-plus/test";

import type { GetFullAXTreeResult, RawAXNode } from "../ax-protocol.js";
import type { ICDPClient } from "../cdp-client.js";

/** テスト用に RawAXNode を作る薄いヘルパー。 */
export function node(
  partial: Partial<RawAXNode> & Pick<RawAXNode, "nodeId" | "ignored">,
): RawAXNode {
  return { ...partial };
}

/**
 * `on` / `off` のイベント登録・解除を Map で管理するスタブを作る。
 * `ICDPClient` / `MinimalCDPSession` 共通のリスナ実装をテスト間で共有するため、
 * 呼び出し側は返り値 `{ on, off, emit, listeners }` を組み込んで任意のモック型を作る。
 */
export function makeListenerStub(): {
  on: (event: string, listener: (params: unknown) => void) => void;
  off: (event: string, listener: (params: unknown) => void) => void;
  emit: (event: string, params: unknown) => void;
  listeners: Map<string, Set<(params: unknown) => void>>;
} {
  const listeners = new Map<string, Set<(params: unknown) => void>>();
  return {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event, params) {
      const set = listeners.get(event);
      if (set) for (const fn of set) fn(params);
    },
    listeners,
  };
}

/**
 * 外部境界 (`ICDPClient`) の vi.fn() ベースの軽量モック。
 * 固定レスポンスを返すだけの用途向け。
 */
export function mockCDPClient(result: GetFullAXTreeResult): ICDPClient {
  return {
    send: vi.fn(async () => result) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
}

/**
 * イベントリスナーを管理できる ICDPClient モック。
 * `emit` で CDP イベントをシミュレートできる。
 */
export function createMockCDPClient() {
  const stub = makeListenerStub();
  const client: ICDPClient = {
    send: vi.fn(async () => ({})) as ICDPClient["send"],
    on: stub.on,
    off: stub.off,
  };
  return { client, emit: stub.emit, listeners: stub.listeners };
}
