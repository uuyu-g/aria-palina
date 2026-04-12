import { describe, expect, test, vi } from "vite-plus/test";
import type { ICDPClient } from "../cdp-client.js";
import { waitForNetworkIdle } from "../wait-for-network-idle.js";

function createMockCDPClient() {
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

describe("waitForNetworkIdle", () => {
  test("リクエストが無い静的ページでは idleTime 経過後に true で解決する", async () => {
    vi.useFakeTimers();
    try {
      const { client } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 200, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(200);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("リクエスト完了後に idleTime 待機して true で解決する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 200, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(0); // microtask flush: リスナー登録完了

      // リクエスト開始 → idle タイマーをキャンセル
      emit("Network.requestWillBeSent", {
        requestId: "r1",
        request: { url: "https://api.example.com/data" },
      });
      await vi.advanceTimersByTimeAsync(100);

      // リクエスト完了
      emit("Network.loadingFinished", { requestId: "r1" });
      await vi.advanceTimersByTimeAsync(200);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("複数の並行リクエストが全て完了するまで待機する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 200, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(0);

      emit("Network.requestWillBeSent", {
        requestId: "r1",
        request: { url: "https://api.example.com/a" },
      });
      emit("Network.requestWillBeSent", {
        requestId: "r2",
        request: { url: "https://api.example.com/b" },
      });
      emit("Network.requestWillBeSent", {
        requestId: "r3",
        request: { url: "https://api.example.com/c" },
      });

      // r1 完了 → まだ 2 つ残っている
      emit("Network.loadingFinished", { requestId: "r1" });
      await vi.advanceTimersByTimeAsync(200);

      // r2 完了 → まだ 1 つ残っている
      emit("Network.loadingFinished", { requestId: "r2" });
      await vi.advanceTimersByTimeAsync(200);

      // r3 完了 → 全て完了、idle タイマー開始
      emit("Network.loadingFinished", { requestId: "r3" });
      await vi.advanceTimersByTimeAsync(200);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("timeout に達するとリクエスト未完了でも false で解決する", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 200, timeout: 1000 });
      await vi.advanceTimersByTimeAsync(0);

      // 完了しないリクエスト
      emit("Network.requestWillBeSent", {
        requestId: "r1",
        request: { url: "https://api.example.com/slow" },
      });

      await vi.advanceTimersByTimeAsync(1000);

      expect(await promise).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("loadingFailed もリクエスト完了として扱われる", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 200, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(0);

      emit("Network.requestWillBeSent", {
        requestId: "r1",
        request: { url: "https://api.example.com/fail" },
      });

      emit("Network.loadingFailed", { requestId: "r1" });
      await vi.advanceTimersByTimeAsync(200);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("ignorePatterns に一致するリクエストはカウントされない", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 200, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(0);

      // フォントリクエスト → デフォルト ignorePatterns で除外
      emit("Network.requestWillBeSent", {
        requestId: "font1",
        request: { url: "https://fonts.example.com/roboto.woff2" },
      });

      await vi.advanceTimersByTimeAsync(200);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("アイドル期間中の新規リクエストでタイマーがリセットされる", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 300, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(0);

      // 最初のリクエスト完了
      emit("Network.requestWillBeSent", {
        requestId: "r1",
        request: { url: "https://api.example.com/first" },
      });
      emit("Network.loadingFinished", { requestId: "r1" });

      // idle タイマー中 (150ms 経過) に新しいリクエスト
      await vi.advanceTimersByTimeAsync(150);
      emit("Network.requestWillBeSent", {
        requestId: "r2",
        request: { url: "https://api.example.com/second" },
      });

      // 150ms ではまだ解決しないはず
      await vi.advanceTimersByTimeAsync(150);
      emit("Network.loadingFinished", { requestId: "r2" });

      // 改めて 300ms 待機
      await vi.advanceTimersByTimeAsync(300);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cleanup 後にイベントリスナが解除されている", async () => {
    vi.useFakeTimers();
    try {
      const { client, listeners } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, { idleTime: 100, timeout: 5000 });
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      const networkListeners = [
        ...(listeners.get("Network.requestWillBeSent") ?? []),
        ...(listeners.get("Network.loadingFinished") ?? []),
        ...(listeners.get("Network.loadingFailed") ?? []),
      ];
      expect(networkListeners).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("カスタム ignorePatterns で特定 URL を除外できる", async () => {
    vi.useFakeTimers();
    try {
      const { client, emit } = createMockCDPClient();

      const promise = waitForNetworkIdle(client, {
        idleTime: 200,
        timeout: 5000,
        ignorePatterns: [/analytics\.example\.com/],
      });
      await vi.advanceTimersByTimeAsync(0);

      // analytics リクエスト → カスタムパターンで除外
      emit("Network.requestWillBeSent", {
        requestId: "a1",
        request: { url: "https://analytics.example.com/track" },
      });

      await vi.advanceTimersByTimeAsync(200);

      expect(await promise).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
