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
});
