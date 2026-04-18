import { describe, expect, test } from "vite-plus/test";
import type { A11yNode } from "@aria-palina/core";
import { formatJsonOutput, formatReaderTextOutput, formatTextOutput } from "../formatter.js";

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
});

describe("formatJsonOutput", () => {
  test("整形済み JSON 文字列として全ノードが含まれる", () => {
    const nodes = fakeNodes();
    const result = formatJsonOutput(nodes);
    const parsed = JSON.parse(result) as A11yNode[];
    expect(parsed).toEqual(nodes);
  });
});

function sectionedNodes(): A11yNode[] {
  return [
    {
      backendNodeId: 1,
      role: "banner",
      name: "",
      depth: 0,
      properties: {},
      state: {},
      speechText: "[banner]",
      isFocusable: false,
      isIgnored: false,
    },
    {
      backendNodeId: 2,
      role: "heading",
      name: "ロゴ",
      depth: 1,
      properties: { level: 1 },
      state: {},
      speechText: "[heading1] ロゴ",
      isFocusable: false,
      isIgnored: false,
    },
    {
      backendNodeId: 3,
      role: "main",
      name: "",
      depth: 0,
      properties: {},
      state: {},
      speechText: "[main]",
      isFocusable: false,
      isIgnored: false,
    },
    {
      backendNodeId: 4,
      role: "heading",
      name: "記事",
      depth: 1,
      properties: { level: 2 },
      state: {},
      speechText: "[heading2] 記事",
      isFocusable: false,
      isIgnored: false,
    },
    {
      backendNodeId: 5,
      role: "paragraph",
      name: "本文",
      depth: 2,
      properties: {},
      state: {},
      speechText: "[paragraph] 本文",
      isFocusable: false,
      isIgnored: false,
    },
  ];
}

describe("formatReaderTextOutput", () => {
  test("indent:false ではレール・角記号を付けずラベルと speechText だけを並べる", () => {
    const result = formatReaderTextOutput(sectionedNodes(), { indent: false, color: false });
    const lines = result.split("\n");
    expect(lines[0]).toBe("banner");
    expect(lines[1]).toBe("[heading1] ロゴ");
    expect(lines[2]).toBe("main");
    expect(lines[3]).toBe("[heading2] 記事");
    expect(lines[4]).toBe("[paragraph] 本文");
  });

  test("indent:true のとき兄弟ランドマークは ┌── → ├── の順で開く", () => {
    const result = formatReaderTextOutput(sectionedNodes(), { indent: true, color: false });
    const lines = result.split("\n");
    // banner は最初のランドマークなので ┌──
    expect(lines[0]).toBe("┌── banner");
    // 配下アイテム = rail 1 本
    expect(lines[1]).toBe("│ [heading1] ロゴ");
    // main は同 rail (0) に既に banner があるので ├──
    expect(lines[2]).toBe("├── main");
    expect(lines[3]).toBe("│ [heading2] 記事");
    // paragraph は item.depth=1 → rail 1 本 + スペース 2 段
    expect(lines[4]).toBe("│   [paragraph] 本文");
  });

  test("ネストしたランドマークは `│ ┌── ...` のように rail 付きで開く", () => {
    // <banner depth=0><a>ホーム</a><nav depth=1 aria-label="グローバル"><a>概要</a></nav></banner>
    const nodes: A11yNode[] = [
      {
        backendNodeId: 1,
        role: "banner",
        name: "",
        depth: 0,
        properties: {},
        state: {},
        speechText: "[banner]",
        isFocusable: false,
        isIgnored: false,
      },
      {
        backendNodeId: 2,
        role: "link",
        name: "ホーム",
        depth: 1,
        properties: {},
        state: {},
        speechText: "[link] ホーム",
        isFocusable: true,
        isIgnored: false,
      },
      {
        backendNodeId: 3,
        role: "navigation",
        name: "グローバル",
        depth: 1,
        properties: {},
        state: {},
        speechText: "[navigation] グローバル",
        isFocusable: false,
        isIgnored: false,
      },
      {
        backendNodeId: 4,
        role: "link",
        name: "概要",
        depth: 2,
        properties: {},
        state: {},
        speechText: "[link] 概要",
        isFocusable: true,
        isIgnored: false,
      },
    ];
    const result = formatReaderTextOutput(nodes, { indent: true, color: false });
    expect(result).toBe(
      ["┌── banner", "│ [link] ホーム", "│ ┌── navigation「グローバル」", "│ │ [link] 概要"].join(
        "\n",
      ),
    );
  });

  test("ランドマークに name があるとラベルに鉤括弧付きで表示される", () => {
    const nodes: A11yNode[] = [
      {
        backendNodeId: 1,
        role: "navigation",
        name: "サイドバー",
        depth: 0,
        properties: {},
        state: {},
        speechText: "[navigation] サイドバー",
        isFocusable: false,
        isIgnored: false,
      },
    ];
    const result = formatReaderTextOutput(nodes, { indent: true, color: false });
    expect(result).toBe("┌── navigation「サイドバー」");
  });

  test("ランドマーク未出現のページは rail もラベル行も出ない", () => {
    const nodes: A11yNode[] = [
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
    ];
    const result = formatReaderTextOutput(nodes, { indent: true, color: false });
    expect(result).toBe("[heading1] タイトル");
  });

  test("color:true のときセクション見出しにも ANSI カラーが適用される", () => {
    const result = formatReaderTextOutput(sectionedNodes(), { indent: true, color: true });
    // main のランドマークは bold + blue のスタイルが適用される
    expect(result).toContain("\u001b[");
  });
});
