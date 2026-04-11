import { describe, expect, test } from "vite-plus/test";

import { buildSpeechText } from "../speech.js";

describe("buildSpeechText", () => {
  test("disabled=true の真偽値状態が『利用不可』として出力される", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: true },
    });
    expect(text).toBe("[ボタン] 送信 (利用不可)");
  });

  test("heading は properties.level をロールラベル末尾に連結する", () => {
    const text = buildSpeechText({
      role: "heading",
      name: "概要",
      properties: { level: 2 },
      state: {},
    });
    expect(text).toBe("[見出し2] 概要");
  });

  test("combobox で expanded=true のとき『展開』が発話される", () => {
    const text = buildSpeechText({
      role: "combobox",
      name: "国",
      properties: {},
      state: { expanded: true },
    });
    expect(text).toBe("[コンボボックス] 国 (展開)");
  });

  test("name が空文字列のときはネームセクションを省略する", () => {
    const text = buildSpeechText({
      role: "button",
      name: "",
      properties: {},
      state: {},
    });
    expect(text).toBe("[ボタン]");
  });

  test("複数状態は全角カンマ『、』で連結される", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: true, pressed: true },
    });
    // 辞書定義順で disabled → pressed になる (Object.entries の挿入順)。
    expect(text).toBe("[ボタン] 送信 (利用不可、押下)");
  });

  test("expanded=false のとき『折りたたみ』ラベルへフォールバックする", () => {
    const text = buildSpeechText({
      role: "combobox",
      name: "国",
      properties: {},
      state: { expanded: false },
    });
    expect(text).toBe("[コンボボックス] 国 (折りたたみ)");
  });

  test("off ラベル未定義の状態 (disabled=false) は沈黙する", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: false },
    });
    expect(text).toBe("[ボタン] 送信");
  });

  test("辞書に無い role は生の文字列のまま表示される", () => {
    const text = buildSpeechText({
      role: "customwidget",
      name: "X",
      properties: {},
      state: {},
    });
    expect(text).toBe("[customwidget] X");
  });

  test("level プロパティの無い heading は『見出し』のまま出力される", () => {
    const text = buildSpeechText({
      role: "heading",
      name: "概要",
      properties: {},
      state: {},
    });
    expect(text).toBe("[見出し] 概要");
  });
});
