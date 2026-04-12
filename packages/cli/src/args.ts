import { parseArgs } from "node:util";

const HELP_TEXT = `palina — ページのアクセシビリティツリーを NVDA 風テキストで出力する

使い方:
  palina [options] <url>

オプション:
  -u, --url <URL>    対象 URL (位置引数でも可)
  -f, --format <fmt> 出力形式: "text" (デフォルト) | "json"
      --indent       インデント出力を強制 (デフォルト: TTY なら有効)
      --no-indent    インデントなし出力を強制
      --color        カラー出力を強制 (デフォルト: TTY なら有効)
      --no-color     カラーなし出力を強制
      --headed       ブラウザを表示して実行
      --tui          TUI モードで起動 (未実装)
  -w, --wait <strategy>  待機戦略: "network-idle" (デフォルト) | "none"
      --idle-time <ms>   ネットワークアイドル判定の静穏時間 (デフォルト: 500)
  -t, --timeout <ms>     最大待機時間 (デフォルト: 30000)
  -h, --help         このヘルプを表示
  -V, --version      バージョンを表示

例:
  palina https://example.com
  palina --format json https://example.com
  palina --no-color --no-indent https://example.com | grep ボタン`;

export interface CliArgs {
  url: string;
  headed: boolean;
  format: "text" | "json";
  indent: boolean | undefined;
  color: boolean | undefined;
  tui: boolean;
  wait: "none" | "network-idle";
  idleTime: number;
  timeout: number;
}

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
        indent: { type: "boolean" },
        "no-indent": { type: "boolean" },
        color: { type: "boolean" },
        "no-color": { type: "boolean" },
        tui: { type: "boolean", default: false },
        wait: { type: "string", short: "w", default: "network-idle" },
        "idle-time": { type: "string", default: "500" },
        timeout: { type: "string", short: "t", default: "30000" },
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

  const wait = values.wait as string;
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

  return {
    ok: true,
    args: {
      url,
      headed: (values.headed as boolean) ?? false,
      format,
      indent,
      color,
      tui: (values.tui as boolean) ?? false,
      wait,
      idleTime,
      timeout,
    },
  };
}
