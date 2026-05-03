import type { A11yNode } from "@aria-palina/core";
import { render } from "ink-testing-library";
import { describe, expect, test } from "vite-plus/test";
import { TextBrowserList } from "../tui/components/TextBrowserList.js";
import { buildTextBrowserLines } from "../tui/textbrowser/build.js";
import { makeNode } from "./helpers.js";

describe("TextBrowserList", () => {
  test("ランドマーク開始行は ── role ── 罫線で描画される", () => {
    const nodes: A11yNode[] = [
      makeNode({ backendNodeId: 1, role: "main", name: "", speechText: "[main]", depth: 0 }),
    ];
    const model = buildTextBrowserLines(nodes);
    const { lastFrame, unmount } = render(
      <TextBrowserList model={model} cursor={0} viewport={5} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("── main ──");
    unmount();
  });

  test("リンクが [N]text 形式で番号付きで描画される", () => {
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
    const { lastFrame, unmount } = render(
      <TextBrowserList model={model} cursor={0} viewport={5} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("[1]Home");
    expect(frame).toContain("[2]About");
    unmount();
  });

  test("見出しは level に応じた # 記号で描画される", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "heading",
        name: "Title",
        speechText: "[heading1] Title",
        properties: { level: 1 },
      }),
      makeNode({
        backendNodeId: 2,
        role: "heading",
        name: "Sub",
        speechText: "[heading3] Sub",
        properties: { level: 3 },
      }),
    ];
    const model = buildTextBrowserLines(nodes);
    const { lastFrame, unmount } = render(
      <TextBrowserList model={model} cursor={0} viewport={5} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("# Title");
    expect(frame).toContain("### Sub");
    unmount();
  });

  test("テーブルは ASCII 罫線で囲まれて描画される", () => {
    const nodes: A11yNode[] = [
      makeNode({
        backendNodeId: 1,
        role: "table",
        name: "",
        speechText: "[table 2行×2列]",
        properties: { tableRowCount: 2, tableColCount: 2 },
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
    const { lastFrame, unmount } = render(
      <TextBrowserList model={model} cursor={0} viewport={10} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("+");
    expect(frame).toContain("|");
    expect(frame).toContain("Name");
    expect(frame).toContain("Alice");
    expect(frame).toContain("30");
    unmount();
  });

  test("ノードが空のときフォールバックメッセージが表示される", () => {
    const model = buildTextBrowserLines([]);
    const { lastFrame, unmount } = render(
      <TextBrowserList model={model} cursor={0} viewport={5} />,
    );
    expect(lastFrame() ?? "").toContain("表示する行がありません");
    unmount();
  });
});
