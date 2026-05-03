import type { A11yNode } from "@aria-palina/core";
import { describe, expect, test } from "vite-plus/test";
import { buildTextBrowserLines } from "../tui/textbrowser/build.js";
import { makeNode } from "./helpers.js";

describe("buildTextBrowserLines", () => {
  test("ランドマーク main の前後に landmark-start / landmark-end が挿入される", () => {
    const nodes: A11yNode[] = [
      makeNode({ backendNodeId: 1, role: "main", name: "", speechText: "[main]", depth: 0 }),
      makeNode({
        backendNodeId: 2,
        role: "heading",
        name: "見出し",
        speechText: "[heading2] 見出し",
        properties: { level: 2 },
        depth: 1,
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.lines[0]).toEqual({ kind: "landmark-start", role: "main", nodeIndex: 0 });
    expect(model.lines.at(-1)).toEqual({ kind: "landmark-end", role: "main", nodeIndex: 0 });
  });

  test("複数のランドマークが入れ子で開閉される", () => {
    const nodes: A11yNode[] = [
      makeNode({ backendNodeId: 1, role: "banner", name: "", speechText: "[banner]", depth: 0 }),
      makeNode({
        backendNodeId: 2,
        role: "navigation",
        name: "",
        speechText: "[navigation]",
        depth: 1,
      }),
      makeNode({ backendNodeId: 3, role: "main", name: "", speechText: "[main]", depth: 0 }),
    ];
    const model = buildTextBrowserLines(nodes);
    const kinds = model.lines.map((l) => `${l.kind}:${"role" in l ? l.role : ""}`);
    expect(kinds).toEqual([
      "landmark-start:banner",
      "landmark-start:navigation",
      "landmark-end:navigation",
      "landmark-end:banner",
      "landmark-start:main",
      "landmark-end:main",
    ]);
  });

  test("heading は properties.level を取り出して level フィールドに入る", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "heading",
        name: "Title",
        speechText: "[heading2] Title",
        properties: { level: 2 },
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.lines[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "Title",
      nodeIndex: 0,
    });
  });

  test("単独 link 行は linkIndex=1 から採番される", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 10,
        role: "link",
        name: "Home",
        speechText: "[link] Home",
        isFocusable: true,
      }),
      makeNode({
        backendNodeId: 11,
        role: "link",
        name: "About",
        speechText: "[link] About",
        isFocusable: true,
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.links).toEqual([
      { index: 1, nodeIndex: 0, segmentIndex: null, backendNodeId: 10, text: "Home" },
      { index: 2, nodeIndex: 1, segmentIndex: null, backendNodeId: 11, text: "About" },
    ]);
    expect(model.lines[0]).toMatchObject({ kind: "link", linkIndex: 1, text: "Home" });
    expect(model.lines[1]).toMatchObject({ kind: "link", linkIndex: 2, text: "About" });
  });

  test("インライン圧縮されたリンクも通し番号採番に組み込まれる", () => {
    const speechText = "[paragraph] Hello help world.";
    const helpStart = speechText.indexOf("help");
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "link",
        name: "Top",
        speechText: "[link] Top",
        isFocusable: true,
      }),
      makeNode({
        backendNodeId: 2,
        role: "paragraph",
        name: "Hello help world.",
        speechText,
        inlineSegments: [
          {
            role: "link",
            name: "help",
            backendNodeId: 99,
            isFocusable: true,
            state: {},
            properties: {},
            start: helpStart,
            end: helpStart + "help".length,
          },
        ],
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.links.map((l) => l.index)).toEqual([1, 2]);
    expect(model.links[1]).toEqual({
      index: 2,
      nodeIndex: 1,
      segmentIndex: 0,
      backendNodeId: 99,
      text: "help",
    });
    const paragraph = model.lines.find((l) => l.kind === "paragraph");
    expect(paragraph?.kind).toBe("paragraph");
    if (paragraph?.kind === "paragraph") {
      expect(paragraph.segments).toEqual([
        { kind: "text", text: "Hello " },
        { kind: "link", linkIndex: 2, text: "help", nodeIndex: 1, segmentIndex: 0 },
        { kind: "text", text: " world." },
      ]);
    }
  });

  test("button / form-control はそれぞれ専用行種別で出る", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "button",
        name: "送信",
        speechText: "[button] 送信",
        isFocusable: true,
      }),
      makeNode({
        backendNodeId: 2,
        role: "textbox",
        name: "q",
        speechText: "[textbox] q",
        isFocusable: true,
      }),
      makeNode({
        backendNodeId: 3,
        role: "checkbox",
        name: "通知",
        speechText: "[checkbox] 通知 (未チェック)",
        isFocusable: true,
        state: { checked: false },
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.lines[0]).toEqual({
      kind: "button",
      label: "送信",
      nodeIndex: 0,
      depth: 0,
    });
    expect(model.lines[1]).toEqual({
      kind: "form-control",
      controlType: "textbox",
      label: "q",
      stateText: "",
      nodeIndex: 1,
      depth: 0,
    });
    expect(model.lines[2]).toEqual({
      kind: "form-control",
      controlType: "checkbox",
      label: "通知",
      stateText: "(未チェック)",
      nodeIndex: 2,
      depth: 0,
    });
  });

  test("listitem は list-item 行として depth 付きで出る", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "listitem",
        name: "foo",
        speechText: "[listitem] foo",
        depth: 1,
      }),
      makeNode({
        backendNodeId: 2,
        role: "listitem",
        name: "bar",
        speechText: "[listitem] bar",
        depth: 1,
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.lines[0]).toEqual({
      kind: "list-item",
      segments: [{ kind: "text", text: "foo" }],
      nodeIndex: 0,
      depth: 1,
    });
    expect(model.lines[1]).toEqual({
      kind: "list-item",
      segments: [{ kind: "text", text: "bar" }],
      nodeIndex: 1,
      depth: 1,
    });
  });

  test("table は top → header → mid → body × N → bottom の順で罫線が並ぶ", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "table",
        name: "",
        speechText: "[table 2行×2列]",
        properties: { tableRowCount: 3, tableColCount: 2 },
        depth: 0,
      }),
      makeNode({ backendNodeId: 2, role: "row", name: "", speechText: "[row]", depth: 1 }),
      makeNode({
        backendNodeId: 3,
        role: "columnheader",
        name: "Name",
        speechText: "[columnheader 1/2] Name",
        depth: 2,
        properties: { tableRowIndex: 1, tableColIndex: 1, tableColCount: 2 },
      }),
      makeNode({
        backendNodeId: 4,
        role: "columnheader",
        name: "Age",
        speechText: "[columnheader 2/2] Age",
        depth: 2,
        properties: { tableRowIndex: 1, tableColIndex: 2, tableColCount: 2 },
      }),
      makeNode({ backendNodeId: 5, role: "row", name: "", speechText: "[row]", depth: 1 }),
      makeNode({
        backendNodeId: 6,
        role: "cell",
        name: "Alice",
        speechText: "[cell 1/2, Name] Alice",
        depth: 2,
        properties: {
          tableRowIndex: 2,
          tableColIndex: 1,
          tableColCount: 2,
          tableColumnHeader: "Name",
        },
      }),
      makeNode({
        backendNodeId: 7,
        role: "cell",
        name: "30",
        speechText: "[cell 2/2, Age] 30",
        depth: 2,
        properties: {
          tableRowIndex: 2,
          tableColIndex: 2,
          tableColCount: 2,
          tableColumnHeader: "Age",
        },
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    const kinds = model.lines.map((l) => l.kind);
    expect(kinds).toEqual([
      "table-border",
      "table-row",
      "table-border",
      "table-row",
      "table-border",
    ]);
    const borders = model.lines.filter((l) => l.kind === "table-border");
    expect(borders.map((b) => (b.kind === "table-border" ? b.border : ""))).toEqual([
      "top",
      "mid",
      "bottom",
    ]);
    const headerRow = model.lines[1];
    if (headerRow?.kind === "table-row") {
      expect(headerRow.cells).toEqual(["Name", "Age"]);
      expect(headerRow.isHeader).toBe(true);
    }
    const bodyRow = model.lines[3];
    if (bodyRow?.kind === "table-row") {
      expect(bodyRow.cells).toEqual(["Alice", "30"]);
      expect(bodyRow.isHeader).toBe(false);
    }
  });

  test("nodeToLine と lineToNode が双方向に整合する", () => {
    const nodes: A11yNode[] = [
      makeNode({ backendNodeId: 1, role: "main", name: "", speechText: "[main]", depth: 0 }),
      makeNode({
        backendNodeId: 2,
        role: "heading",
        name: "h1",
        speechText: "[heading1] h1",
        properties: { level: 1 },
        depth: 1,
      }),
      makeNode({
        backendNodeId: 3,
        role: "button",
        name: "go",
        speechText: "[button] go",
        depth: 1,
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    for (let i = 0; i < nodes.length; i++) {
      const lineIdx = model.nodeToLine[i]!;
      expect(lineIdx).toBeGreaterThanOrEqual(0);
      expect(model.lineToNode[lineIdx]).toBe(i);
    }
  });

  test("不明ロールは speechText を素のままパラグラフとして出してフォールバックする", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "unknownrole",
        name: "abc",
        speechText: "[unknownrole] abc",
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    expect(model.lines[0]).toMatchObject({
      kind: "paragraph",
      segments: [{ kind: "text", text: "abc" }],
    });
  });
});
