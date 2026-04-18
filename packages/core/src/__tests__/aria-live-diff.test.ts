import { describe, expect, test } from "vite-plus/test";
import { diffLiveRegions } from "../aria-live-diff.js";
import type { A11yNode } from "../types.js";

function n(overrides: Partial<A11yNode> & { backendNodeId: number; role: string }): A11yNode {
  return {
    name: "",
    depth: 0,
    properties: {},
    state: {},
    speechText: `[${overrides.role}]`,
    isFocusable: false,
    isIgnored: false,
    ...overrides,
  };
}

describe("diffLiveRegions", () => {
  test("role=status のノードは暗黙の polite として追加が検出される", () => {
    const before: A11yNode[] = [];
    const after: A11yNode[] = [
      n({
        backendNodeId: 1,
        role: "status",
        name: "保存しました",
        speechText: "[status] 保存しました",
      }),
    ];
    const changes = diffLiveRegions(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      kind: "added",
      node: after[0],
      politeness: "polite",
      after: "[status] 保存しました",
    });
  });

  test("role=alert は assertive として扱われる", () => {
    const after: A11yNode[] = [
      n({ backendNodeId: 2, role: "alert", name: "エラー", speechText: "[alert] エラー" }),
    ];
    const changes = diffLiveRegions([], after);
    expect(changes[0]?.politeness).toBe("assertive");
  });

  test("properties.live='assertive' は role よりも優先される", () => {
    const after: A11yNode[] = [
      n({
        backendNodeId: 3,
        role: "status",
        properties: { live: "assertive" },
        speechText: "[status] 緊急",
      }),
    ];
    const changes = diffLiveRegions([], after);
    expect(changes[0]?.politeness).toBe("assertive");
  });

  test("properties.live='polite' があれば role 無しでも検出される", () => {
    const after: A11yNode[] = [
      n({
        backendNodeId: 4,
        role: "generic",
        properties: { live: "polite" },
        speechText: "[generic] 3件の通知",
      }),
    ];
    const changes = diffLiveRegions([], after);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.politeness).toBe("polite");
  });

  test("同じノードの speechText が変わると text 変更が検出される", () => {
    const before: A11yNode[] = [
      n({ backendNodeId: 1, role: "status", speechText: "[status] 0件" }),
    ];
    const after: A11yNode[] = [n({ backendNodeId: 1, role: "status", speechText: "[status] 3件" })];
    const changes = diffLiveRegions(before, after);
    expect(changes).toEqual([
      {
        kind: "text",
        node: after[0],
        politeness: "polite",
        before: "[status] 0件",
        after: "[status] 3件",
      },
    ]);
  });

  test("after から消えた live 領域は removed として検出される", () => {
    const before: A11yNode[] = [n({ backendNodeId: 5, role: "alert", speechText: "[alert] 失敗" })];
    const after: A11yNode[] = [];
    const changes = diffLiveRegions(before, after);
    expect(changes).toEqual([
      {
        kind: "removed",
        node: before[0],
        politeness: "assertive",
        before: "[alert] 失敗",
      },
    ]);
  });

  test("live でない通常ノードの変化は無視される", () => {
    const before: A11yNode[] = [n({ backendNodeId: 1, role: "button", speechText: "[button] A" })];
    const after: A11yNode[] = [n({ backendNodeId: 1, role: "button", speechText: "[button] B" })];
    const changes = diffLiveRegions(before, after);
    expect(changes).toEqual([]);
  });

  test("speechText に変化がなければ text 変更は発火しない", () => {
    const before: A11yNode[] = [
      n({ backendNodeId: 1, role: "status", speechText: "[status] 同じ" }),
    ];
    const after: A11yNode[] = [
      n({ backendNodeId: 1, role: "status", speechText: "[status] 同じ" }),
    ];
    expect(diffLiveRegions(before, after)).toEqual([]);
  });

  test("backendNodeId が 0 のノードは同一性を決められないためスキップされる", () => {
    const before: A11yNode[] = [n({ backendNodeId: 0, role: "status", speechText: "[status] x" })];
    const after: A11yNode[] = [n({ backendNodeId: 0, role: "status", speechText: "[status] y" })];
    expect(diffLiveRegions(before, after)).toEqual([]);
  });

  test("role=marquee は politeness=off として検出される", () => {
    const after: A11yNode[] = [
      n({
        backendNodeId: 9,
        role: "marquee",
        name: "流れる広告",
        speechText: "[marquee] 流れる広告",
      }),
    ];
    const changes = diffLiveRegions([], after);
    expect(changes[0]?.politeness).toBe("off");
  });
});
