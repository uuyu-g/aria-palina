import { describe, expect, test } from "vite-plus/test";
import type { A11yNode } from "@aria-palina/core";
import { formatJsonOutput, formatTextOutput } from "../formatter.js";

function fakeNodes(): A11yNode[] {
  return [
    {
      backendNodeId: 1,
      role: "heading",
      name: "タイトル",
      depth: 0,
      properties: { level: 1 },
      state: {},
      speechText: "[見出し1] タイトル",
      isFocusable: false,
      isIgnored: false,
    },
    {
      backendNodeId: 2,
      role: "button",
      name: "送信",
      depth: 1,
      properties: {},
      state: {},
      speechText: "[ボタン] 送信",
      isFocusable: true,
      isIgnored: false,
    },
    {
      backendNodeId: 3,
      role: "link",
      name: "ホーム",
      depth: 1,
      properties: {},
      state: {},
      speechText: "[リンク] ホーム",
      isFocusable: true,
      isIgnored: false,
    },
  ];
}

describe("formatTextOutput", () => {
  test("indent:false color:false のとき speechText を改行連結する", () => {
    const result = formatTextOutput(fakeNodes(), {
      indent: false,
      color: false,
    });
    expect(result).toBe("[見出し1] タイトル\n[ボタン] 送信\n[リンク] ホーム");
  });

  test("indent:true のとき depth に応じたインデントが付く", () => {
    const result = formatTextOutput(fakeNodes(), {
      indent: true,
      color: false,
    });
    const lines = result.split("\n");
    expect(lines[0]).toBe("[見出し1] タイトル");
    expect(lines[1]).toBe("  [ボタン] 送信");
    expect(lines[2]).toBe("  [リンク] ホーム");
  });

  test("color:true のとき ANSI エスケープシーケンスが含まれる", () => {
    const result = formatTextOutput(fakeNodes(), {
      indent: false,
      color: true,
    });
    expect(result).toContain("\u001b[");
  });
});

describe("formatJsonOutput", () => {
  test("整形済み JSON 文字列として全ノードが含まれる", () => {
    const nodes = fakeNodes();
    const result = formatJsonOutput(nodes);
    const parsed = JSON.parse(result) as A11yNode[];
    expect(parsed).toEqual(nodes);
  });
});
