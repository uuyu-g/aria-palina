# Phase 3 実装メモ

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

## スコープ

`docs/dd.md` §4 Phase 3 で列挙されている以下を実装した:

- `@aria-palina/cli` パッケージを新規作成。
- Playwright を起動し、取得した `CDPSession` を Core エンジンの `ICDPClient` に
  適合させるアダプター (`adaptCDPSession`) を記述。
- `isTTY` 判定によるスマートフォーマット出力 (text/json) の完成。
- `--tui` フラグは受理し、Phase 4 実装予定の案内を stderr に出力。

## モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/cli/src/args.ts` | `node:util.parseArgs` による argv 解析。`--url`/`-u` (位置引数でも可)、`--format`/`-f`、`--indent`/`--no-indent`、`--color`/`--no-color`、`--headed`、`--tui` を tri-state で処理。 |
| `packages/cli/src/colorize.ts` | role ベースの ANSI カラーライザ。raw ANSI エスケープコードで button→cyan, heading→bold+magenta 等を実装。外部依存なし。 |
| `packages/cli/src/formatter.ts` | `formatTextOutput(nodes, {indent, color})` と `formatJsonOutput(nodes)` を提供。TTY 判定に応じたインデント・色付けを実行。 |
| `packages/cli/src/playwright-cdp-adapter.ts` | `MinimalCDPSession` interface 経由で Playwright `CDPSession` を `ICDPClient` に適合させる薄いアダプター。 |
| `packages/cli/src/run.ts` | `runCli(argv, io?)` — ブラウザ起動→ページ遷移→CDP セッション取得→`extractA11yTree`→整形→stdout 出力の一連のフロー。`BrowserFactory` を注入可能にしてテスタビリティを確保。 |
| `packages/cli/src/bin.ts` | `#!/usr/bin/env node` shebang エントリ。`runCli(process.argv.slice(2))` を呼び出し。 |
| `packages/cli/src/index.ts` | 公開 API: `runCli` と `CliArgs` 型を再エクスポート。 |

## 設計判断

- CLI は Node 20 標準の `node:util.parseArgs` のみを使用し、外部依存を
  `playwright-core` + `@aria-palina/core` の 2 つだけに抑えた。
- カラー出力は `node:util.styleText` ではなく raw ANSI エスケープコードを
  使用。`styleText` は非 TTY 環境で自動的にカラーを抑制するが、
  CLI では呼び出し側 (`formatter.ts`) が `color` フラグで制御するため、
  常にカラーを適用する `colorizeByRole` が適切。
- `playwright-core` を採用し、ブラウザの自動ダウンロードを回避。
  未インストール時は日本語でガイドメッセージを stderr に出力する。
- `indent` / `color` は tri-state (`boolean | undefined`)。
  `args.ts` では未指定を `undefined` として保持し、`run.ts` でのみ
  `isTTY` と合成する。
- `BrowserFactory` を注入可能にしたため `run.test.ts` で
  実ブラウザなしに E2E 的検証ができる。
- Playwright の `CDPSession` 型を直接 import せず `MinimalCDPSession`
  interface で受けることで、テストとアーキテクチャ境界を両立。

## テスト

`packages/cli/src/__tests__/` に以下のユニットテストを追加 (古典派、日本語テスト名):

- `args.test.ts` — 位置引数 URL、`--url` 優先、エイリアス、tri-state indent/color、
  バリデーションエラーを検証。
- `colorize.test.ts` — 既知ロールの ANSI 装飾、未知ロールのパススルーを検証。
- `formatter.test.ts` — text 出力のインデント有無・カラー有無、JSON 出力の
  parse 可能性を検証。
- `playwright-cdp-adapter.test.ts` — fake CDPSession で send 結果の透過、
  on/off リスナ登録・解除を状態検証。
- `run.test.ts` — fake BrowserFactory を注入し、text/json 出力、
  `--tui` 案内、extract 失敗時の browser.close、URL 未指定エラーを検証。

## 公開 API 変更

`@aria-palina/cli` から以下を新規エクスポート:

```ts
export { runCli } from "./run.js";
export type { CliArgs } from "./args.js";
```

`@aria-palina/core` には変更なし (環境非依存性を維持)。
