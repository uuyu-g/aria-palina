import { parseArgs } from "node:util";
import { LANDMARK_ROLES } from "@aria-palina/core";
import {
  expandRoleAliases,
  validateEnumOption,
  validateNumberOption,
  validateTriStateFlag,
} from "./args-validators.js";

const HELP_TEXT = `palina — ページのアクセシビリティツリーを NVDA 風テキストで出力する

使い方:
  palina [options] <url>

オプション:
  -u, --url <URL>    対象 URL (位置引数でも可)
  -f, --format <fmt> 出力形式: "text" (デフォルト) | "json"
  -r, --role <roles> 指定ロールのみ出力 (カンマ区切り, 例: heading,landmark)
      --indent       インデント出力を強制 (デフォルト: TTY なら有効)
      --no-indent    インデントなし出力を強制
      --color        カラー出力を強制 (デフォルト: TTY なら有効)
      --no-color     カラーなし出力を強制
      --headed       ブラウザを表示して実行
      --tui          TUI モードで起動 (Ink ベースのインタラクティブ UI)
      --user-data-dir <path>  ブラウザプロファイルの保存先 (デフォルト: ~/.palina/profile)
      --no-persist   ブラウザの状態を保持しない (デフォルトは保持)
  -w, --wait <strategy>  待機戦略: "network-idle" | "none"
                         デフォルトは CLI ワンショットで network-idle、TUI では none
                         (TUI はライブ購読と r キーで事後再抽出できるため)
      --idle-time <ms>   ネットワークアイドル判定の静穏時間 (デフォルト: 500)
  -t, --timeout <ms>     最大待機時間 (デフォルト: 30000)
      --wait-for-selector <css>   CSS セレクタがマッチするまで追加で待機
      --wait-for-function <js>    ページ内 eval 真偽関数で追加で待機
      --delay <ms>                抽出前の固定スリープ (エスケープハッチ)
      --no-live      TUI モードで DOM 変化による自動再取得を無効化
  -h, --help         このヘルプを表示
  -V, --version      バージョンを表示

ロールエイリアス:
  landmark = main,navigation,banner,contentinfo,complementary,search,region,form

例:
  palina https://example.com
  palina --format json https://example.com
  palina --role heading https://example.com
  palina --no-color --no-indent https://example.com | grep ボタン`;

export interface CliArgs {
  url: string;
  headed: boolean;
  format: "text" | "json";
  role: string[] | undefined;
  indent: boolean | undefined;
  color: boolean | undefined;
  tui: boolean;
  wait: "none" | "network-idle";
  idleTime: number;
  timeout: number;
  persist: boolean;
  userDataDir: string | undefined;
  waitForSelector: string | undefined;
  waitForFunction: string | undefined;
  delay: number;
  live: boolean;
}

const ROLE_ALIASES: Record<string, string[]> = {
  landmark: [...LANDMARK_ROLES],
};

export type ParseResult =
  | { ok: true; args: CliArgs }
  | { ok: false; exitCode: 0; message: string }
  | { ok: false; exitCode: 2; message: string };

export function parseCliArgs(argv: readonly string[]): ParseResult {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv as string[],
      allowPositionals: true,
      options: {
        url: { type: "string", short: "u" },
        headed: { type: "boolean", default: false },
        format: { type: "string", short: "f", default: "text" },
        role: { type: "string", short: "r" },
        indent: { type: "boolean" },
        "no-indent": { type: "boolean" },
        color: { type: "boolean" },
        "no-color": { type: "boolean" },
        tui: { type: "boolean", default: false },
        "user-data-dir": { type: "string" },
        "no-persist": { type: "boolean", default: false },
        wait: { type: "string", short: "w" },
        "idle-time": { type: "string", default: "500" },
        timeout: { type: "string", short: "t", default: "30000" },
        "wait-for-selector": { type: "string" },
        "wait-for-function": { type: "string" },
        delay: { type: "string", default: "0" },
        live: { type: "boolean" },
        "no-live": { type: "boolean" },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "V", default: false },
      },
    });
  } catch (e) {
    return {
      ok: false,
      exitCode: 2,
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const { values, positionals } = parsed;

  if (values.help) {
    return {
      ok: false,
      exitCode: 0,
      message: HELP_TEXT,
    };
  }

  if (values.version) {
    return {
      ok: false,
      exitCode: 0,
      message: "palina 0.0.1",
    };
  }

  const url = (values.url as string | undefined) ?? positionals[0];
  if (!url) {
    return {
      ok: false,
      exitCode: 2,
      message: "URL が指定されていません。--url <URL> または位置引数で URL を指定してください。",
    };
  }

  const formatResult = validateEnumOption(values.format as string, "--format", ["text", "json"]);
  if (!formatResult.ok) return { ok: false, exitCode: 2, message: formatResult.error };

  const tuiRequested = (values.tui as boolean) ?? false;
  // `wait` のデフォルトはモード依存。TUI はライブ購読と `r` キーで
  // 事後の再抽出が効くため、起動が体感で止まらない `"none"` を既定とし、
  // 必要なら `--wait=network-idle` で opt-in させる。ワンショット CLI は
  // 1 回きりの抽出なので従来通り `"network-idle"` を既定とする。
  const waitRaw = (values.wait as string | undefined) ?? (tuiRequested ? "none" : "network-idle");
  const waitResult = validateEnumOption(waitRaw, "--wait", ["none", "network-idle"]);
  if (!waitResult.ok) return { ok: false, exitCode: 2, message: waitResult.error };

  const idleTimeResult = validateNumberOption(values["idle-time"] as string, {
    flag: "--idle-time",
    min: 0,
    hint: "0 以上の数値を指定してください。",
  });
  if (!idleTimeResult.ok) return { ok: false, exitCode: 2, message: idleTimeResult.error };

  const timeoutResult = validateNumberOption(values.timeout as string, {
    flag: "--timeout",
    min: 0,
    bound: "exclusive",
    hint: "正の数値を指定してください。",
  });
  if (!timeoutResult.ok) return { ok: false, exitCode: 2, message: timeoutResult.error };

  const delayResult = validateNumberOption(values.delay as string, {
    flag: "--delay",
    min: 0,
    hint: "0 以上の数値を指定してください。",
  });
  if (!delayResult.ok) return { ok: false, exitCode: 2, message: delayResult.error };

  const liveResult = validateTriStateFlag(
    values.live as boolean | undefined,
    values["no-live"] as boolean | undefined,
    "--live",
    "--no-live",
  );
  if (!liveResult.ok) return { ok: false, exitCode: 2, message: liveResult.error };
  // 既定は live=true (TUI のライブ更新が初期 ON)。
  const live = liveResult.value !== false;

  const indentResult = validateTriStateFlag(
    values.indent as boolean | undefined,
    values["no-indent"] as boolean | undefined,
    "--indent",
    "--no-indent",
  );
  if (!indentResult.ok) return { ok: false, exitCode: 2, message: indentResult.error };

  const colorResult = validateTriStateFlag(
    values.color as boolean | undefined,
    values["no-color"] as boolean | undefined,
    "--color",
    "--no-color",
  );
  if (!colorResult.ok) return { ok: false, exitCode: 2, message: colorResult.error };

  const role = expandRoleAliases(values.role as string | undefined, ROLE_ALIASES);

  const userDataDirRaw = values["user-data-dir"] as string | undefined;
  const userDataDir = userDataDirRaw && userDataDirRaw.length > 0 ? userDataDirRaw : undefined;
  const persist = !(values["no-persist"] as boolean);

  const waitForSelector = (values["wait-for-selector"] as string | undefined) || undefined;
  const waitForFunction = (values["wait-for-function"] as string | undefined) || undefined;

  return {
    ok: true,
    args: {
      url,
      headed: (values.headed as boolean) ?? false,
      format: formatResult.value,
      role,
      indent: indentResult.value,
      color: colorResult.value,
      tui: tuiRequested,
      wait: waitResult.value,
      idleTime: idleTimeResult.value,
      timeout: timeoutResult.value,
      persist,
      userDataDir,
      waitForSelector,
      waitForFunction,
      delay: delayResult.value,
      live,
    },
  };
}
