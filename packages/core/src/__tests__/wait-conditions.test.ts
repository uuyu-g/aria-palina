import { describe, expect, test, vi } from "vite-plus/test";
import type { ICDPClient } from "../cdp-client.js";
import { delay, waitForFunction, waitForSelector } from "../wait-conditions.js";

function cdpEvalReturning(values: boolean[]): {
  client: ICDPClient;
  expressions: string[];
} {
  const expressions: string[] = [];
  let call = 0;
  const client: ICDPClient = {
    send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "Runtime.evaluate") {
        expressions.push(String(params?.["expression"] ?? ""));
        const v = values[Math.min(call, values.length - 1)] ?? false;
        call++;
        return { result: { type: "boolean", value: v } } as unknown;
      }
      return {} as unknown;
    }) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
  return { client, expressions };
}

describe("waitForSelector", () => {
  test("Runtime.evaluate が truthy を返した時点で true で解決する", async () => {
    vi.useFakeTimers();
    try {
      const { client, expressions } = cdpEvalReturning([false, false, true]);
      const p = waitForSelector(client, "#app", { interval: 50, timeout: 1000 });
      await vi.advanceTimersByTimeAsync(200);
      expect(await p).toBe(true);
      expect(expressions[0]).toBe('!!document.querySelector("#app")');
    } finally {
      vi.useRealTimers();
    }
  });

  test("timeout 前に真にならなければ false", async () => {
    vi.useFakeTimers();
    try {
      const { client } = cdpEvalReturning([false]);
      const p = waitForSelector(client, "#missing", { interval: 50, timeout: 200 });
      await vi.advanceTimersByTimeAsync(500);
      expect(await p).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("セレクタはクォート安全にエスケープされる", async () => {
    const { client, expressions } = cdpEvalReturning([true]);
    await waitForSelector(client, `[data-x="a'b"]`, { interval: 10, timeout: 100 });
    // JSON.stringify を通るのでダブルクォート内のシングルクォート混在でも安全
    expect(expressions[0]).toContain(`document.querySelector(`);
    expect(expressions[0]).toContain(JSON.stringify(`[data-x="a'b"]`));
  });
});

describe("waitForFunction", () => {
  test("ユーザー式が truthy になるまでポーリングする", async () => {
    vi.useFakeTimers();
    try {
      const { client } = cdpEvalReturning([false, true]);
      const p = waitForFunction(client, "window.__ready", { interval: 30, timeout: 500 });
      await vi.advanceTimersByTimeAsync(100);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("delay", () => {
  test("0 以下の値では即座に解決する", async () => {
    await delay(0);
    await delay(-100);
  });

  test("ms 経過後に解決する", async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const p = delay(200).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
