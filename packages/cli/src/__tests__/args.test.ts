import { describe, expect, test } from "vite-plus/test";
import { parseCliArgs } from "../args.js";

describe("parseCliArgs", () => {
  test("URL と format のデフォルト値が返る", () => {
    const result = parseCliArgs(["-u", "https://example.com"]);
    expect(result).toEqual({
      ok: true,
      args: {
        url: "https://example.com",
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
    const result = parseCliArgs(["https://example.com"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ url: "https://example.com" }),
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
    const result = parseCliArgs(["-u", "https://example.com"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ wait: "network-idle" }),
    });
  });

  test("--wait none でネットワーク待機が無効になる", () => {
    const result = parseCliArgs(["-u", "https://example.com", "--wait", "none"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ wait: "none" }),
    });
  });

  test("-w エイリアスが --wait として解釈される", () => {
    const result = parseCliArgs(["-u", "https://example.com", "-w", "none"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ wait: "none" }),
    });
  });

  test("不正な --wait 値はエラーを返す", () => {
    const result = parseCliArgs(["-u", "https://example.com", "--wait", "invalid"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("invalid"),
    });
  });

  test("--idle-time で静穏時間を指定できる", () => {
    const result = parseCliArgs(["-u", "https://example.com", "--idle-time", "1000"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ idleTime: 1000 }),
    });
  });

  test("--idle-time に数値以外を指定するとエラーになる", () => {
    const result = parseCliArgs(["-u", "https://example.com", "--idle-time", "abc"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("--idle-time"),
    });
  });

  test("--timeout で最大待機時間を指定できる", () => {
    const result = parseCliArgs(["-u", "https://example.com", "--timeout", "60000"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ timeout: 60000 }),
    });
  });

  test("-t エイリアスが --timeout として解釈される", () => {
    const result = parseCliArgs(["-u", "https://example.com", "-t", "10000"]);
    expect(result).toEqual({
      ok: true,
      args: expect.objectContaining({ timeout: 10000 }),
    });
  });

  test("--timeout に負の値を指定するとエラーになる", () => {
    const result = parseCliArgs(["-u", "https://example.com", "--timeout", "-1"]);
    expect(result).toEqual({
      ok: false,
      exitCode: 2,
      message: expect.stringContaining("--timeout"),
    });
  });
});
