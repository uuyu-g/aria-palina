import type { A11yNode } from "@aria-palina/core";

/** stderr をバッファリングするモック。 */
export function createWritableBuffer() {
  let buf = "";
  return {
    stream: {
      write(chunk: string) {
        buf += chunk;
        return true;
      },
    },
    get value() {
      return buf;
    },
  };
}

/** 連番でテスト用 A11yNode を生成する。 */
export function makeNode(overrides: Partial<A11yNode> & { backendNodeId: number }): A11yNode {
  return {
    role: "text",
    name: "",
    depth: 0,
    properties: {},
    state: {},
    speechText: `[text] node-${overrides.backendNodeId}`,
    isFocusable: false,
    isIgnored: false,
    ...overrides,
  };
}

/** N 件のダミーノードを生成するファクトリ。 */
export function makeNodes(count: number): A11yNode[] {
  return Array.from({ length: count }, (_, i) =>
    makeNode({
      backendNodeId: i + 1,
      role: "button",
      name: `ボタン${i + 1}`,
      speechText: `[button] ボタン${i + 1}`,
    }),
  );
}
