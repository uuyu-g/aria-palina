import type { ICDPClient } from "@aria-palina/core";

/**
 * Playwright の `CDPSession` を構造的に満たす最小インターフェース。
 * テストで fake を注入するときに `CDPSession` 型そのものへの依存を
 * 避けるために使う。CLI の同名インターフェースと構造的に一致する。
 */
export interface MinimalCDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (params: unknown) => void): void;
  off(event: string, listener: (params: unknown) => void): void;
}

export function adaptCDPSession(session: MinimalCDPSession): ICDPClient {
  return {
    send<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult> {
      return session.send(method, params) as Promise<TResult>;
    },
    on(event: string, listener: (params: unknown) => void): void {
      session.on(event, listener);
    },
    off(event: string, listener: (params: unknown) => void): void {
      session.off(event, listener);
    },
  };
}
