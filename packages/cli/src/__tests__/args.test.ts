import { describe, expect, test } from "vite-plus/test";
import { isIanaReservedDomain, parseCliArgs } from "../args.js";

describe("parseCliArgs", () => {
  test("URL と format のデフォルト値が返る", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev"]);
    expect(result).toEqual({
      ok: true,
      args: {
        url: "https://a11y.dev",
        headed: false,
        format: "text",
        indent: undefined,
        color: undefined,
        tui: false,
        wait: "network-idle",
        idleTime: 500,
        timeout: 30000,
      },
    });
  });

  test("位置引数で URL を渡せる", () => {
    const result = parseCliArgs(["https://a11y.dev"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ url: "https://a11y.dev" }),
    });
  });

  test("--url と位置引数の両方がある場合は --url が優先される", () => {
    const result = parseCliArgs(["--url", "https://flag.com", "https://positional.com"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ url: "https://flag.com" }),
    });
  });

  test("-u エイリアスが --url として解釈される", () => {
    const result = parseCliArgs(["-u", "https://short.com"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ url: "https://short.com" }),
    });
  });

  test("-f json が format に反映される", () => {
    const result = parseCliArgs(["-u", "https://x.com", "-f", "json"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ format: "json" }),
    });
  });

  test("--indent 指定時は indent:true になる", () => {
    const result = parseCliArgs(["-u", "https://x.com", "--indent"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ indent: true }),
    });
  });

  test("--no-indent 指定時は indent:false になる", () => {
    const result = parseCliArgs(["-u", "https://x.com", "--no-indent"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ indent: false }),
    });
  });

  test("indent 未指定時は undefined になる", () => {
    const result = parseCliArgs(["-u", "https://x.com"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ indent: undefined }),
    });
  });

  test("--color 指定時は color:true になる", () => {
    const result = parseCliArgs(["-u", "https://x.com", "--color"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ color: true }),
    });
  });

  test("--no-color 指定時は color:false になる", () => {
    const result = parseCliArgs(["-u", "https://x.com", "--no-color"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ color: false }),
    });
  });

  test("URL 未指定はエラーを返す", () => {
    const result = parseCliArgs([]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("URL"),
    });
  });

  test("不正な --format 値はエラーを返す", () => {
    const result = parseCliArgs(["-u", "https://x.com", "-f", "xml"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("xml"),
    });
  });

  test("--tui フラグを受理する", () => {
    const result = parseCliArgs(["--tui", "-u", "https://x.com"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ tui: true }),
    });
  });

  test("--headed フラグを受理する", () => {
    const result = parseCliArgs(["-u", "https://x.com", "--headed"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ headed: true }),
    });
  });

  test("--help は exitCode 0 でヘルプ文を返す", () => {
    const result = parseCliArgs(["--help"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 0,
      message: expect.stringContaining("palina"),
    });
  });

  test("-h は --help のエイリアスとして動作する", () => {
    const result = parseCliArgs(["-h"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 0,
      message: expect.stringContaining("使い方"),
    });
  });

  test("--version は exitCode 0 でバージョン文字列を返す", () => {
    const result = parseCliArgs(["--version"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 0,
      message: expect.stringContaining("0.0.1"),
    });
  });

  test("--wait のデフォルト値は network-idle になる", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ wait: "network-idle" }),
    });
  });

  test("--wait none でネットワーク待機が無効になる", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "--wait", "none"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ wait: "none" }),
    });
  });

  test("-w エイリアスが --wait として解釈される", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "-w", "none"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ wait: "none" }),
    });
  });

  test("不正な --wait 値はエラーを返す", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "--wait", "invalid"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("invalid"),
    });
  });

  test("--idle-time で静穏時間を指定できる", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "--idle-time", "1000"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ idleTime: 1000 }),
    });
  });

  test("--idle-time に数値以外を指定するとエラーになる", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "--idle-time", "abc"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("--idle-time"),
    });
  });

  test("--timeout で最大待機時間を指定できる", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "--timeout", "60000"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ timeout: 60000 }),
    });
  });

  test("-t エイリアスが --timeout として解釈される", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "-t", "10000"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ timeout: 10000 }),
    });
  });

  test("--timeout に負の値を指定するとエラーになる", () => {
    const result = parseCliArgs(["-u", "https://a11y.dev", "--timeout", "-1"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("--timeout"),
    });
  });

  describe("IANA 予約済みドメイン検証", () => {
    test("example.com は IANA 予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://example.com"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("example.com"),
      });
    });

    test("example.net は IANA 予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://example.net"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("example.net"),
      });
    });

    test("example.org は IANA 予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["https://example.org/path"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("example.org"),
      });
    });

    test("サブドメイン付き example.com も拒否される", () => {
      const result = parseCliArgs(["-u", "https://www.example.com"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("example.com"),
      });
    });

    test(".test TLD は予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://myapp.test"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("IANA"),
      });
    });

    test(".invalid TLD は予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://bad.invalid"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("IANA"),
      });
    });

    test(".localhost TLD は予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://app.localhost"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("IANA"),
      });
    });

    test(".example TLD は予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://foo.example"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("IANA"),
      });
    });

    test("通常のドメインは受理される", () => {
      const result = parseCliArgs(["-u", "https://a11y.dev"]);
      expect(result).toEqual({
        ok: true,
        args: expect.objectContaining({ url: "https://a11y.dev" }),
      });
    });

    test("localhost (ベアホスト) は予約ドメインとして拒否される", () => {
      const result = parseCliArgs(["-u", "https://localhost:3000"]);
      expect(result).toEqual({
        ok: false,
        exitCode: 2,
        message: expect.stringContaining("IANA"),
      });
    });
  });
});

describe("isIanaReservedDomain", () => {
  test("RFC 2606 第二レベルドメインを検出する", () => {
    expect(isIanaReservedDomain("https://example.com")).toBe("example.com");
    expect(isIanaReservedDomain("https://example.net")).toBe("example.net");
    expect(isIanaReservedDomain("https://example.org")).toBe("example.org");
  });

  test("サブドメイン付きも検出する", () => {
    expect(isIanaReservedDomain("https://www.example.com")).toBe("example.com");
    expect(isIanaReservedDomain("https://sub.deep.example.net")).toBe("example.net");
  });

  test("RFC 2606 予約 TLD を検出する", () => {
    expect(isIanaReservedDomain("https://myapp.test")).toBe("test");
    expect(isIanaReservedDomain("https://foo.example")).toBe("example");
    expect(isIanaReservedDomain("https://bad.invalid")).toBe("invalid");
    expect(isIanaReservedDomain("https://app.localhost")).toBe("localhost");
  });

  test("ベア TLD を検出する", () => {
    expect(isIanaReservedDomain("https://localhost:3000")).toBe("localhost");
  });

  test("通常のドメインには undefined を返す", () => {
    expect(isIanaReservedDomain("https://google.com")).toBeUndefined();
    expect(isIanaReservedDomain("https://a11y.dev")).toBeUndefined();
    expect(isIanaReservedDomain("https://my-example.com")).toBeUndefined();
  });

  test("不正な URL には undefined を返す", () => {
    expect(isIanaReservedDomain("not-a-url")).toBeUndefined();
    expect(isIanaReservedDomain("")).toBeUndefined();
  });
});
