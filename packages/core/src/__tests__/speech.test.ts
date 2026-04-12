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

  test("table に tableRowCount/tableColCount があるとき行列数が出力される", () => {
    const text = buildSpeechText({
      role: "table",
      name: "ユーザー一覧",
      properties: { tableRowCount: 3, tableColCount: 4 },
      state: {},
    });
    expect(text).toBe("[テーブル 3行×4列] ユーザー一覧");
  });

  test("cell に位置とヘッダー名が揃っているとき両方出力される", () => {
    const text = buildSpeechText({
      role: "cell",
      name: "管理者",
      properties: { tableColIndex: 3, tableColCount: 4, tableColumnHeader: "権限" },
      state: {},
    });
    expect(text).toBe("[セル 3/4, 権限] 管理者");
  });

  test("cell に位置のみでヘッダー名が無いとき位置だけ出力される", () => {
    const text = buildSpeechText({
      role: "cell",
      name: "田中太郎",
      properties: { tableColIndex: 1, tableColCount: 4 },
      state: {},
    });
    expect(text).toBe("[セル 1/4] 田中太郎");
  });

  test("columnheader に位置があるとき列位置が出力される", () => {
    const text = buildSpeechText({
      role: "columnheader",
      name: "権限",
      properties: { tableColIndex: 3, tableColCount: 4 },
      state: {},
    });
    expect(text).toBe("[列見出し 3/4] 権限");
  });

  test("テーブルプロパティの無い cell は素の『セル』のまま出力される", () => {
    const text = buildSpeechText({
      role: "cell",
      name: "値",
      properties: {},
      state: {},
    });
    expect(text).toBe("[セル] 値");
  });

  test("slider に valuenow/valuemax があるとき値が出力される", () => {
    const text = buildSpeechText({
      role: "slider",
      name: "音量",
      properties: { valuenow: 50, valuemax: 100 },
      state: {},
    });
    expect(text).toBe("[スライダー 50/100] 音量");
  });

  test("progressbar に valuenow のみのとき値だけ出力される", () => {
    const text = buildSpeechText({
      role: "progressbar",
      name: "読込中",
      properties: { valuenow: 75 },
      state: {},
    });
    expect(text).toBe("[プログレスバー 75] 読込中");
  });

  test("meter に valuetext があるとき valuetext が優先される", () => {
    const text = buildSpeechText({
      role: "meter",
      name: "CPU",
      properties: { valuenow: 85, valuemax: 100, valuetext: "85%" },
      state: {},
    });
    expect(text).toBe("[メーター 85%] CPU");
  });

  test("slider に値プロパティが無いときはロールラベルのみ", () => {
    const text = buildSpeechText({
      role: "slider",
      name: "音量",
      properties: {},
      state: {},
    });
    expect(text).toBe("[スライダー] 音量");
  });

  test("grid / gridcell でもテーブル書式が適用される", () => {
    const grid = buildSpeechText({
      role: "grid",
      name: "",
      properties: { tableRowCount: 2, tableColCount: 3 },
      state: {},
    });
    expect(grid).toBe("[グリッド 2行×3列]");

    const gridcell = buildSpeechText({
      role: "gridcell",
      name: "A1",
      properties: { tableColIndex: 1, tableColCount: 3, tableColumnHeader: "列A" },
      state: {},
    });
    expect(gridcell).toBe("[グリッドセル 1/3, 列A] A1");
  });
});
