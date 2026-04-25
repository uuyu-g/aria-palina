import { getRoleStyle, type RoleStyle } from "../role-theme.js";

/**
 * ロールごとの Ink `<Text>` props マッピング。
 *
 * CLI の `colorizeByRole` と同じマスター定義 (`role-theme.ts`) を参照する。
 * Ink はカラー指定を props (`color`, `bold`) で行うため、ANSI エスケープ
 * ではなくそのままオブジェクトとして返す。
 */
export type RoleTextStyle = RoleStyle;

export function roleTextStyle(role: string): RoleTextStyle {
  return getRoleStyle(role);
}
