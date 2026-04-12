import { parseArgs } from "node:util";

export interface CliArgs {
  url: string;
  headed: boolean;
  format: "text" | "json";
  indent: boolean | undefined;
  color: boolean | undefined;
  tui: boolean;
}

export type ParseResult = { ok: true; args: CliArgs } | { ok: false; exitCode: 2; message: string };

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
    },
  };
}
