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

/**
 * イベントリスナーを管理できる MinimalCDPSession のフェイク。
 * `listeners` を使って外部からイベントを発火できる。
 */
export function createFakeSession() {
  const listeners = new Map<string, Set<(params: unknown) => void>>();
  const session: MinimalCDPSession = {
    async send(_method: string, _params?: Record<string, unknown>) {
      return { nodes: [{ nodeId: "1", role: { value: "button" } }] };
    },
    on(event: string, listener: (params: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event: string, listener: (params: unknown) => void) {
      listeners.get(event)?.delete(listener);
    },
  };
  return { session, listeners };
}
