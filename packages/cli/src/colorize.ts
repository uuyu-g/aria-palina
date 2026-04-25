import { getRoleStyle } from "./role-theme.js";

const ANSI_RESET = "\u001b[0m";
const ANSI_BOLD = "\u001b[1m";

const ANSI_COLORS: Record<string, string> = {
  cyan: "\u001b[36m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  gray: "\u001b[90m",
};

export function colorizeByRole(role: string, text: string): string {
  const style = getRoleStyle(role);
  const codes: string[] = [];
  if (style.bold) codes.push(ANSI_BOLD);
  if (style.color) {
    const code = ANSI_COLORS[style.color];
    if (code) codes.push(code);
  }
  if (codes.length === 0) return text;
  return `${codes.join("")}${text}${ANSI_RESET}`;
}
