import type { A11yNode } from "@aria-palina/core";
import { colorizeByRole } from "./colorize.js";

export interface TextFormatOptions {
  indent: boolean;
  color: boolean;
}

export function formatTextOutput(nodes: A11yNode[], opts: TextFormatOptions): string {
  return nodes
    .map((node) => {
      const prefix = opts.indent ? "  ".repeat(node.depth) : "";
      const text = opts.color ? colorizeByRole(node.role, node.speechText) : node.speechText;
      return `${prefix}${text}`;
    })
    .join("\n");
}

export function formatJsonOutput(nodes: A11yNode[]): string {
  return JSON.stringify(nodes, null, 2);
}
