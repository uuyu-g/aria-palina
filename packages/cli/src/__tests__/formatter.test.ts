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
      speechText: "[heading1] タイトル",
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
      speechText: "[button] 送信",
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
      speechText: "[link] ホーム",
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
    expect(result).toBe("[heading1] タイトル\n[button] 送信\n[link] ホーム");
  });

  test("indent:true のとき depth に応じたインデントが付く", () => {
    const result = formatTextOutput(fakeNodes(), {
      indent: true,
      color: false,
    });
    const lines = result.split("\n");
    expect(lines[0]).toBe("[heading1] タイトル");
    expect(lines[1]).toBe("  [button] 送信");
    expect(lines[2]).toBe("  [link] ホーム");
  });

  test("color:true のとき ANSI エスケープシーケンスが含まれる", () => {
    const result = formatTextOutput(fakeNodes(), {
      indent: false,
      color: true,
    });
    expect(result).toContain("\u001b[");
  });

  test("inlineSegments を持つノードは親色とセグメント色が交互に切り替わる", () => {
    const speechText = "[paragraph] これは リンク と 画像 の行";
    const linkStart = speechText.indexOf("リンク");
    const imgStart = speechText.indexOf("画像");
    const nodes: A11yNode[] = [
      {
        backendNodeId: 1,
        role: "paragraph",
        name: "これは リンク と 画像 の行",
        depth: 0,
        properties: {},
        state: {},
        speechText,
        isFocusable: false,
        isIgnored: false,
        inlineSegments: [
          {
            role: "link",
            name: "リンク",
            backendNodeId: 11,
            isFocusable: true,
            state: {},
            properties: {},
            start: linkStart,
            end: linkStart + "リンク".length,
          },
          {
            role: "img",
            name: "画像",
            backendNodeId: 12,
            isFocusable: false,
            state: {},
            properties: {},
            start: imgStart,
            end: imgStart + "画像".length,
          },
        ],
      },
    ];
    const result = formatTextOutput(nodes, { indent: false, color: true });
    // link の color = blue (\u001b[34m), img の color = gray (\u001b[90m)
    expect(result).toContain("\u001b[34mリンク\u001b[0m");
    expect(result).toContain("\u001b[90m画像\u001b[0m");
    // 非セグメント領域はリセット後にも残るテキストが含まれる
    expect(result).toContain("これは ");
    expect(result).toContain(" と ");
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
