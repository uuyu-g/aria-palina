import { parseArgs } from "node:util";

const HELP_TEXT = `palina — ページのアクセシビリティツリーを NVDA 風テキストで出力する

使い方:
  palina [options] <url>

オプション:
  -u, --url <URL>    対象 URL (位置引数でも可)
  -f, --format <fmt> 出力形式: "text" (デフォルト) | "json"
      --view <mode>  ビューの種類: "reader" (デフォルト) | "raw"
                     reader はランドマーク区切りの章立てで表示し、
                     raw は CDP 生ツリーをそのまま深くインデントして表示する。
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
  view: "reader" | "raw";
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
  landmark: [
    "main",
    "navigation",
    "banner",
    "contentinfo",
    "complementary",
    "search",
    "region",
    "form",
  ],
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
        view: { type: "string", default: "reader" },
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

  const format = values.format as string;
  if (format !== "text" && format !== "json") {
    return {
      ok: false,
      exitCode: 2,
      message: `不正な --format 値: "${format}"。"text" または "json" を指定してください。`,
    };
  }

  const view = values.view as string;
  if (view !== "reader" && view !== "raw") {
    return {
      ok: false,
      exitCode: 2,
      message: `不正な --view 値: "${view}"。"reader" または "raw" を指定してください。`,
    };
  }

  const tuiRequested = (values.tui as boolean) ?? false;
  const waitRaw = values.wait as string | undefined;
  // `wait` のデフォルトはモード依存。TUI はライブ購読と `r` キーで
  // 事後の再抽出が効くため、起動が体感で止まらない `"none"` を既定とし、
  // 必要なら `--wait=network-idle` で opt-in させる。ワンショット CLI は
  // 1 回きりの抽出なので従来通り `"network-idle"` を既定とする。
  const wait = waitRaw ?? (tuiRequested ? "none" : "network-idle");
  if (wait !== "none" && wait !== "network-idle") {
    return {
      ok: false,
      exitCode: 2,
      message: `不正な --wait 値: "${wait}"。"network-idle" または "none" を指定してください。`,
    };
  }

  const idleTimeRaw = values["idle-time"] as string;
  const idleTime = Number(idleTimeRaw);
  if (!Number.isFinite(idleTime) || idleTime < 0) {
    return {
      ok: false,
      exitCode: 2,
      message: `不正な --idle-time 値: "${idleTimeRaw}"。0 以上の数値を指定してください。`,
    };
  }

  const timeoutRaw = values.timeout as string;
  const timeout = Number(timeoutRaw);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return {
      ok: false,
      exitCode: 2,
      message: `不正な --timeout 値: "${timeoutRaw}"。正の数値を指定してください。`,
    };
  }

  const delayRaw = values.delay as string;
  const delay = Number(delayRaw);
  if (!Number.isFinite(delay) || delay < 0) {
    return {
      ok: false,
      exitCode: 2,
      message: `不正な --delay 値: "${delayRaw}"。0 以上の数値を指定してください。`,
    };
  }

  const hasLive = values.live as boolean | undefined;
  const hasNoLive = values["no-live"] as boolean | undefined;
  if (hasLive && hasNoLive) {
    return {
      ok: false,
      exitCode: 2,
      message: "--live と --no-live は同時に指定できません。",
    };
  }
  const live = hasNoLive ? false : true;

  const hasIndent = values.indent as boolean | undefined;
  const hasNoIndent = values["no-indent"] as boolean | undefined;
  let indent: boolean | undefined;
  if (hasIndent && hasNoIndent) {
    return {
      ok: false,
      exitCode: 2,
      message: "--indent と --no-indent は同時に指定できません。",
    };
  } else if (hasIndent) {
    indent = true;
  } else if (hasNoIndent) {
    indent = false;
  }

  const hasColor = values.color as boolean | undefined;
  const hasNoColor = values["no-color"] as boolean | undefined;
  let color: boolean | undefined;
  if (hasColor && hasNoColor) {
    return {
      ok: false,
      exitCode: 2,
      message: "--color と --no-color は同時に指定できません。",
    };
  } else if (hasColor) {
    color = true;
  } else if (hasNoColor) {
    color = false;
  }

  const roleRaw = values.role as string | undefined;
  const role = roleRaw
    ? [
        ...new Set(
          roleRaw
            .split(",")
            .map((r) => r.trim().toLowerCase())
            .filter(Boolean)
            .flatMap((r) => ROLE_ALIASES[r] ?? [r]),
        ),
      ]
    : undefined;

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
      format,
      view,
      role: role?.length ? role : undefined,
      indent,
      color,
      tui: tuiRequested,
      wait,
      idleTime,
      timeout,
      persist,
      userDataDir,
      waitForSelector,
      waitForFunction,
      delay,
      live,
    },
  };
}
