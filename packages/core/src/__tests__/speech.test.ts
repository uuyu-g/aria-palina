import { describe, expect, test } from "vite-plus/test";

import { buildSpeechText } from "../speech.js";

describe("buildSpeechText", () => {
  test("boolean state 'disabled' renders as 利用不可", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: true },
    });
    expect(text).toBe("[ボタン] 送信 (利用不可)");
  });

  test("heading appends the level number to the role label", () => {
    const text = buildSpeechText({
      role: "heading",
      name: "概要",
      properties: { level: 2 },
      state: {},
    });
    expect(text).toBe("[見出し2] 概要");
  });

  test("expanded combobox announces 展開", () => {
    const text = buildSpeechText({
      role: "combobox",
      name: "国",
      properties: {},
      state: { expanded: true },
    });
    expect(text).toBe("[コンボボックス] 国 (展開)");
  });

  test("empty name omits the name section entirely", () => {
    const text = buildSpeechText({
      role: "button",
      name: "",
      properties: {},
      state: {},
    });
    expect(text).toBe("[ボタン]");
  });

  test("multiple states are joined with 、", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: true, pressed: true },
    });
    // 辞書定義順で disabled → pressed になる (Object.entries の挿入順)。
    expect(text).toBe("[ボタン] 送信 (利用不可、押下)");
  });

  test("expanded=false falls back to 折りたたみ label", () => {
    const text = buildSpeechText({
      role: "combobox",
      name: "国",
      properties: {},
      state: { expanded: false },
    });
    expect(text).toBe("[コンボボックス] 国 (折りたたみ)");
  });

  test("disabled=false is silent (no off label defined)", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: false },
    });
    expect(text).toBe("[ボタン] 送信");
  });

  test("unknown role falls through as raw string", () => {
    const text = buildSpeechText({
      role: "customwidget",
      name: "X",
      properties: {},
      state: {},
    });
    expect(text).toBe("[customwidget] X");
  });

  test("heading without level stays as '見出し'", () => {
    const text = buildSpeechText({
      role: "heading",
      name: "概要",
      properties: {},
      state: {},
    });
    expect(text).toBe("[見出し] 概要");
  });
});
