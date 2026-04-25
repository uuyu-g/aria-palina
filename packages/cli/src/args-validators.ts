/**
 * `args.ts` から呼び出される純粋なバリデータ群。
 *
 * `parseCliArgs` 本体が「パース → 検証 → 既定値解決」を全部抱えていて
 * 巨大化していたため、検証層 (= 入力文字列 → 妥当な値 or エラーメッセージ)
 * だけを切り出した。各関数は副作用なし、`Result<T, string>` を返す純粋関数
 * とし、単体テストを `args.test.ts` 経由ではなく直接当てやすくする狙い。
 */

/** バリデータの戻り値。エラー時は exit code 2 用のメッセージを文字列で返す。 */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const err = (error: string): ValidationResult<never> => ({ ok: false, error });

/** 数値オプション (`--idle-time` `--timeout` `--delay` 等) の検証ルール。 */
export interface NumberOptionRule {
  /** ヘルプ表示・エラーメッセージで使うフラグ名 (例: `"--idle-time"`)。 */
  flag: string;
  /** 受け入れる最小値。 */
  min: number;
  /** 最小値を含む (`>=`) か、含まず排他 (`>`) か。デフォルト `inclusive`。 */
  bound?: "inclusive" | "exclusive";
  /** エラーメッセージ末尾に追加する許容範囲の説明 (例: `"0 以上の数値を指定してください。"`)。 */
  hint: string;
}

/**
 * 数値オプションの文字列値を検証する。`Number(raw)` が NaN/Infinity になる
 * ケースと、下限を満たさないケースの両方を 1 つのメッセージで弾く。
 */
export function validateNumberOption(
  raw: string,
  rule: NumberOptionRule,
): ValidationResult<number> {
  const value = Number(raw);
  const bound = rule.bound ?? "inclusive";
  const inRange = bound === "inclusive" ? value >= rule.min : value > rule.min;
  if (!Number.isFinite(value) || !inRange) {
    return err(`不正な ${rule.flag} 値: "${raw}"。${rule.hint}`);
  }
  return ok(value);
}

/**
 * 列挙型オプション (`--format` `--wait`) の検証。許容値以外を弾く。
 */
export function validateEnumOption<T extends string>(
  raw: string,
  flag: string,
  allowed: readonly T[],
): ValidationResult<T> {
  if ((allowed as readonly string[]).includes(raw)) {
    return ok(raw as T);
  }
  const list = allowed.map((v) => `"${v}"`).join(" または ");
  return err(`不正な ${flag} 値: "${raw}"。${list} を指定してください。`);
}

/**
 * 排他フラグペア (`--indent` / `--no-indent` のような正負ペア) を tri-state
 * (`true | false | undefined`) に正規化する。両方指定されていたらエラー。
 */
export function validateTriStateFlag(
  positive: boolean | undefined,
  negative: boolean | undefined,
  positiveFlag: string,
  negativeFlag: string,
): ValidationResult<boolean | undefined> {
  if (positive && negative) {
    return err(`${positiveFlag} と ${negativeFlag} は同時に指定できません。`);
  }
  if (positive) return ok(true);
  if (negative) return ok(false);
  return ok(undefined);
}

/**
 * カンマ区切りのロール文字列を、`aliases` を展開した重複なし配列に変換する。
 * 空文字列や全空白は `undefined` を返し、呼び出し側で「未指定」と区別できる
 * ようにする。値はすべて lowercase / trim 済みになる。
 */
export function expandRoleAliases(
  raw: string | undefined,
  aliases: Readonly<Record<string, readonly string[]>>,
): string[] | undefined {
  if (!raw) return undefined;
  const expanded = [
    ...new Set(
      raw
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean)
        .flatMap((r) => aliases[r] ?? [r]),
    ),
  ];
  return expanded.length > 0 ? expanded : undefined;
}
