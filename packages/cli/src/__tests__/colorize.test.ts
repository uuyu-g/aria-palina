import { describe, expect, test } from "vite-plus/test";
import { colorizeByRole } from "../colorize.js";

describe("colorizeByRole", () => {
  test("button ロールは ANSI エスケープで装飾される", () => {
    const text = "[ボタン] 送信";
    const result = colorizeByRole("button", text);
    expect(result).not.toBe(text);
    expect(result).toContain(text);
    expect(result).toContain("\u001b[");
  });

  test("heading ロールは bold + magenta で装飾される", () => {
    const text = "[見出し2] タイトル";
    const result = colorizeByRole("heading", text);
    expect(result).not.toBe(text);
    expect(result).toContain(text);
  });

  test("link ロールは装飾される", () => {
    const text = "[リンク] ホーム";
    const result = colorizeByRole("link", text);
    expect(result).not.toBe(text);
    expect(result).toContain(text);
  });

  test("未知のロールは装飾なしで返る", () => {
    const text = "[ウェブ] ページ";
    const result = colorizeByRole("unknown-role", text);
    expect(result).toBe(text);
  });
});
