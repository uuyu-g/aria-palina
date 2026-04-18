import { describe, expect, test } from "vite-plus/test";
import type { BrowserFactory, BrowserFactoryOptions, BrowserHandle } from "../run.js";
import { runCli } from "../run.js";
import type { MinimalCDPSession } from "../playwright-cdp-adapter.js";
import { createWritableBuffer } from "./helpers.js";

function fakeBrowserFactory(opts?: { throwOnExtract?: boolean }): {
  factory: BrowserFactory;
  closed: { value: boolean };
  receivedOpts: { value: BrowserFactoryOptions | null };
} {
  const closed = { value: false };
  const receivedOpts: { value: BrowserFactoryOptions | null } = { value: null };
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

  const factory: BrowserFactory = async (factoryOpts) => {
    receivedOpts.value = factoryOpts;
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

  return { factory, closed, receivedOpts };
}

describe("runCli", () => {
  test("text 出力で speechText が改行連結される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(
      ["https://example.com", "--no-indent", "--no-color", "--wait", "none"],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        isTTY: false,
        browserFactory: factory,
      },
    );

    expect(code).toBe(0);
    expect(stderr.value).toBe("");
    const lines = stdout.value.trimEnd().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("heading");
    expect(lines[0]).toContain("タイトル");
    expect(lines[1]).toContain("button");
    expect(lines[1]).toContain("送信");
  });

  test("format:json で parse 可能な配列が出力される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(["https://example.com", "-f", "json", "--wait", "none"], {
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

  test("--tui 指定時は tuiRunner に dispatch され、その結果コードが返る", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();
    let receivedUrl = "";
    const tuiRunner = async (args: { url: string }) => {
      receivedUrl = args.url;
      return 0;
    };

    const code = await runCli(["--tui", "-u", "https://example.com"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
      tuiRunner,
    });

    expect(code).toBe(0);
    expect(receivedUrl).toBe("https://example.com");
    expect(stdout.value).toBe("");
    expect(stderr.value).toBe("");
  });

  test("extract 失敗時も browser.close が呼ばれる", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory, closed } = fakeBrowserFactory({ throwOnExtract: true });

    const code = await runCli(["https://example.com", "--wait", "none"], {
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
    expect(stdout.value).toContain("palina");
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

  test("--role 指定時に該当ロールのノードのみ出力される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(
      ["https://example.com", "--role", "heading", "--no-indent", "--no-color", "--wait", "none"],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        isTTY: false,
        browserFactory: factory,
      },
    );

    expect(code).toBe(0);
    const lines = stdout.value.trimEnd().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("heading");
    expect(lines[0]).toContain("タイトル");
  });

  test("--role で複数ロール指定時に該当する全ノードが出力される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(
      [
        "https://example.com",
        "--role",
        "heading,button",
        "--no-indent",
        "--no-color",
        "--wait",
        "none",
      ],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        isTTY: false,
        browserFactory: factory,
      },
    );

    expect(code).toBe(0);
    const lines = stdout.value.trimEnd().split("\n");
    expect(lines.length).toBe(2);
  });

  test("--role 指定時に json 出力でもフィルタが適用される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(
      ["https://example.com", "-r", "button", "-f", "json", "--wait", "none"],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        isTTY: false,
        browserFactory: factory,
      },
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.value) as { role: string }[];
    expect(parsed.length).toBe(1);
    expect(parsed[0].role).toBe("button");
  });

  test("--role に該当ノードがない場合は空の出力になる", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(
      ["https://example.com", "--role", "alert", "--no-indent", "--no-color", "--wait", "none"],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        isTTY: false,
        browserFactory: factory,
      },
    );

    expect(code).toBe(0);
    expect(stdout.value.trimEnd()).toBe("");
  });

  test("デフォルトでは persist:true かつ userDataDir:undefined で factory が呼ばれる", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory, receivedOpts } = fakeBrowserFactory();

    await runCli(["https://example.com", "--wait", "none"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(receivedOpts.value).toEqual({
      headed: false,
      persist: true,
      userDataDir: undefined,
    });
  });

  test("--no-persist 指定時は persist:false が factory に渡る", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory, receivedOpts } = fakeBrowserFactory();

    await runCli(["https://example.com", "--no-persist", "--wait", "none"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(receivedOpts.value?.persist).toBe(false);
  });

  test("--user-data-dir 指定時はそのパスが factory に渡る", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory, receivedOpts } = fakeBrowserFactory();

    await runCli(["https://example.com", "--user-data-dir", "/tmp/palina-test", "--wait", "none"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(receivedOpts.value).toEqual({
      headed: false,
      persist: true,
      userDataDir: "/tmp/palina-test",
    });
  });

  test("text 出力の既定は reader ビューでランドマーク罫線が挿入される", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const landmarkNodes = [
      {
        nodeId: "1",
        ignored: false,
        role: { type: "role", value: "main" },
        name: { type: "computedString", value: "記事" },
        childIds: ["2"],
      },
      {
        nodeId: "2",
        ignored: false,
        parentId: "1",
        role: { type: "role", value: "heading" },
        name: { type: "computedString", value: "タイトル" },
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
      },
    ];
    const factory: BrowserFactory = async () => ({
      async newCDPSessionForUrl(): Promise<MinimalCDPSession> {
        return {
          async send() {
            return { nodes: landmarkNodes };
          },
          on() {},
          off() {},
        };
      },
      async close() {},
    });

    const code = await runCli(["https://example.com", "--indent", "--no-color", "--wait", "none"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(0);
    expect(stdout.value).toContain("┌── main「記事」");
    expect(stdout.value).toContain("│ [heading1] タイトル");
  });

  test("--view raw では罫線を挟まず生ツリーの順で出力する", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(
      ["https://example.com", "--view", "raw", "--no-indent", "--no-color", "--wait", "none"],
      {
        stdout: stdout.stream,
        stderr: stderr.stream,
        isTTY: false,
        browserFactory: factory,
      },
    );

    expect(code).toBe(0);
    expect(stdout.value).not.toContain("┌──");
    expect(stdout.value).not.toContain("├──");
    expect(stdout.value).not.toContain("│ ");
    expect(stdout.value).toContain("タイトル");
    expect(stdout.value).toContain("送信");
  });

  test("不正な --view 値は exitCode:2 とエラーメッセージを返す", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const { factory } = fakeBrowserFactory();

    const code = await runCli(["https://example.com", "--view", "invalid", "--wait", "none"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      isTTY: false,
      browserFactory: factory,
    });

    expect(code).toBe(2);
    expect(stderr.value).toContain("invalid");
  });
});
