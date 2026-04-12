import { describe, expect, test } from "vite-plus/test";
import type { BrowserFactory, BrowserHandle } from "../run.js";
import { runCli } from "../run.js";
import type { MinimalCDPSession } from "../playwright-cdp-adapter.js";

function createWritableBuffer() {
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

function fakeBrowserFactory(opts?: { throwOnExtract?: boolean }): {
  factory: BrowserFactory;
  closed: { value: boolean };
} {
  const closed = { value: false };
  const fakeRawNodes = [
    {
      nodeId: "1",
      ignored: false,
      role: { type: "role", value: "heading" },
      name: { type: "computedString", value: "タイトル" },
      properties: [{ name: "level", value: { type: "integer", value: 1 } }],
      childIds: ["2"],
    },
    {
      nodeId: "2",
      ignored: false,
      parentId: "1",
      role: { type: "role", value: "button" },
      name: { type: "computedString", value: "送信" },
      properties: [],
    },
  ];

  const factory: BrowserFactory = async () => {
    const handle: BrowserHandle = {
      async newCDPSessionForUrl(): Promise<MinimalCDPSession> {
        return {
          async send() {
            if (opts?.throwOnExtract) {
              throw new Error("CDP connection failed");
            }
            return { nodes: fakeRawNodes };
          },
          on() {},
          off() {},
        };
      },
      async close() {
        closed.value = true;
      },
    };
    return handle;
  };

  return { factory, closed };
}

describe("runCli", () => {
  test("text 出力で speechText が改行連結される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(["https://example.com", "--no-indent", "--no-color"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(0);
    expect(stderr.value).toBe("");
    const lines = stdout.value.trimEnd().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("見出し");
    expect(lines[0]).toContain("タイトル");
    expect(lines[1]).toContain("ボタン");
    expect(lines[1]).toContain("送信");
  });

  test("format:json で parse 可能な配列が出力される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(["https://example.com", "-f", "json"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.value) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });

  test("--tui 指定時は exitCode:2 を返し stderr に案内を出す", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(["--tui", "-u", "https://example.com"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(2);
    expect(stderr.value).toContain("Phase 4");
    expect(stdout.value).toBe("");
  });

  test("extract 失敗時も browser.close が呼ばれる", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory, closed } = fakeBrowserFactory({ throwOnExtract: true });

    const code = await runCli(["https://example.com"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(1);
    expect(closed.value).toBe(true);
    expect(stderr.value).toContain("CDP connection failed");
  });

  test("--help は exitCode:0 で stdout にヘルプを出力する", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(["--help"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(0);
    expect(stdout.value).toContain("aria-palina-cli");
    expect(stderr.value).toBe("");
  });

  test("URL 未指定は exitCode:2 を返す", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli([], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(2);
    expect(stderr.value).toContain("URL");
  });
});
