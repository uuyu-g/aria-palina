import type { CliArgs } from "./args.js";

export interface DisplayOptions {
  indent: boolean;
  color: boolean;
}

/**
 * `CliArgs` の tri-state な `indent` / `color` を実効値に正規化する。
 *
 * 明示指定があれば (true / false) その値、未指定なら TTY かどうかに倣う。
 * `formatTextOutput` に渡す直前のフォールバックを一箇所に集約するためのヘルパ。
 */
export function normalizeDisplayOptions(
  args: Pick<CliArgs, "indent" | "color">,
  isTTY: boolean,
): DisplayOptions {
  return {
    indent: args.indent ?? isTTY,
    color: args.color ?? isTTY,
  };
}
