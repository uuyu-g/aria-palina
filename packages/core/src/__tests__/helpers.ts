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
  const listeners = new Map<string, Set<(params: unknown) => void>>();

  const client: ICDPClient = {
    send: vi.fn(async () => ({})) as ICDPClient["send"],
    on(event: string, listener: (params: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event: string, listener: (params: unknown) => void) {
      listeners.get(event)?.delete(listener);
    },
  };

  function emit(event: string, params: unknown): void {
    const set = listeners.get(event);
    if (set) {
      for (const fn of set) fn(params);
    }
  }

  return { client, emit, listeners };
}
