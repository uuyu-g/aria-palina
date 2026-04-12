# 📊 Implementation Progress

> **Last Updated:** 2026-04-12
> **Related:** [DD §4 Roadmap](./dd.md) / [PRD](./prd.md)

本ドキュメントは、`docs/dd.md` §4「開発ロードマップ」の各フェーズの進捗を
トラッキングするための**運用ドキュメント**である。

- `docs/dd.md` の開発ロードマップ本体は **仕様書** として変更しない。
- 実装状況・成果物・コミットへのリンクはこの `progress.md` に集約する。
- 各フェーズ完了時に対応する PR のマージコミットと併せて本ファイルを更新する。

## ステータス凡例

- ✅ **Done** — 実装・テスト完了
- 🚧 **In Progress** — 現在着手中
- ⏳ **Pending** — 未着手

## フェーズ進捗一覧

| Phase | 内容 | ステータス | 成果物 |
| ----- | ---- | ---------- | ------ |
| 1 | モノレポ基盤と DI Core エンジン | ✅ Done | `packages/core/src/{cdp-client,types,index}.ts` |
| 2 | AOM 抽出・平坦化ロジック (Core) | ✅ Done | `packages/core/src/{ax-protocol,flatten,speech,extract}.ts` + `__tests__/` |
| 3 | Playwright 統合と ワンショット CLI | ✅ Done | `packages/cli/src/{args,colorize,formatter,playwright-cdp-adapter,run,bin,index}.ts` + `__tests__/` |
| 4 | Ink TUI 基盤と パフォーマンス最適化 | ⏳ Pending | — |
| 5 | デュアルナビゲーション実装 (TUI) | ⏳ Pending | — |
| 6 | Matrix View (Headed モード同期) | ⏳ Pending | — |
| 7 | Chrome Extension (DevTools Panel) | ⏳ Pending | — |
| 8 | Test Utilities (BDD) | ⏳ Pending | — |
| 9 | 統合バイナリ `palina` の公開 | ⏳ Pending | — |

## Phase 1 実装メモ

- `@aria-palina/core` パッケージの雛形を作成し、`ICDPClient` 抽象と
  `A11yNode` 型を定義。CDP / Playwright / `chrome.debugger` の具体実装に
  依存せず、純粋な TypeScript 型と `interface` のみで構成している。
- 公開 API は `packages/core/src/index.ts` から `type` として再エクスポート。

## Phase 2 実装メモ

### スコープ

`docs/dd.md` §4 Phase 2 で列挙されている以下を実装した:

- `Accessibility.getFullAXTree` コマンドの発行 (`extractA11yTree`)。
- DFS による平坦化、`depth` 算出アルゴリズム (`flattenAXTree`)。
- NVDA 風の日本語テキスト変換 (Speech Simulator) の実装 (`buildSpeechText`)。

### モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/core/src/ax-protocol.ts` | CDP `Accessibility` ドメイン応答の最小型定義 (`RawAXNode` / `RawAXValue` / `RawAXProperty` / `GetFullAXTreeResult`)。外部 SDK 非依存。 |
| `packages/core/src/flatten.ts` | `flattenAXTree(rawNodes)` — DFS ベースの平坦化。`ignored` ノードは子孫ごと除外、`depth` を計算して `A11yNode[]` を返す純粋関数。 |
| `packages/core/src/speech.ts` | `buildSpeechText(input)` — NVDA フォーマット `[{Role}] {Name} ({States})` に準拠。role/state は日本語ラベル辞書で差し替え可能。 |
| `packages/core/src/extract.ts` | `extractA11yTree(cdp)` — `ICDPClient.send("Accessibility.getFullAXTree")` を呼び、結果を `flattenAXTree()` に渡すエントリーポイント。 |

### 設計判断

- `ignored: true` のノードは**自身も子孫も**平坦化配列に含めない。NVDA が
  実際に読み上げる内容に近づけるため (DD §2.2)。
- `Accessibility.enable` は `extractA11yTree` 内部では発行しない。CDP 仕様上
  `getFullAXTree` は enable なしで動作する上、副作用を核となる Core に閉じ
  込めたくない。必要な場合は Phase 3 のアダプタ層で対応する。
- `properties[]` を **構造系** (`level`, `valuenow`, `roledescription`, ...)
  と **状態系** (`focused`, `expanded`, `disabled`, ...) の 2 辞書に分離。
  これにより `buildSpeechText` の状態アナウンス処理が単純になる。
- Speech Simulator の `heading` 特殊処理: `properties.level` が number の
  ときのみラベルに数値を連結して "見出し2" のように出力する。
- `ROLE_LABELS` / `STATE_LABELS` は `speech.ts` 内に集約しており、今後
  対応 role を増やす場合はこのファイルだけを編集すれば良い。

### テスト

`packages/core/src/__tests__/` に以下のユニットテストを追加:

- `speech.test.ts` — DD §2.3 の代表的な発話例 (`[ボタン] 送信 (利用不可)`
  など) を網羅。name 省略・複数状態・heading level・未知の role 等の
  エッジケースも確認。
- `flatten.test.ts` — DFS による `depth` 付与、`ignored` 子孫スキップ、
  `properties` の構造系/状態系分離、孤児ノードのルート化、`backendDOMNodeId`
  のフォールバック、重複 `childIds` の非再訪問を検証。
- `extract.test.ts` — `ICDPClient` をモックし、`send` が
  `"Accessibility.getFullAXTree"` で呼ばれること、多段ツリーが正しく
  平坦化されて返ることを確認。

テストランナーは Vite+ に内蔵された Vitest を使用 (`vp test`)。
`import { describe, expect, test, vi } from "vite-plus/test"` のみを使用し、
`vitest` パッケージを直接は参照していない (Vite+ ガイドラインに準拠)。

### 公開 API 変更

`packages/core/src/index.ts` に以下を追記:

```ts
export type {
  GetFullAXTreeResult,
  RawAXNode,
  RawAXProperty,
  RawAXValue,
} from "./ax-protocol.js";
export { flattenAXTree } from "./flatten.js";
export { buildSpeechText, type SpeechInput } from "./speech.js";
export { extractA11yTree } from "./extract.js";
```

Phase 3 以降の `@aria-palina/cli` / `@aria-palina/tui` / `@aria-palina/extension`
はこの公開 API のみに依存することで DI の境界を維持する。

## Phase 3 実装メモ

### スコープ

`docs/dd.md` §4 Phase 3 で列挙されている以下を実装した:

- `@aria-palina/cli` パッケージを新規作成。
- Playwright を起動し、取得した `CDPSession` を Core エンジンの `ICDPClient` に
  適合させるアダプター (`adaptCDPSession`) を記述。
- `isTTY` 判定によるスマートフォーマット出力 (text/json) の完成。
- `--tui` フラグは受理し、Phase 4 実装予定の案内を stderr に出力。

### モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/cli/src/args.ts` | `node:util.parseArgs` による argv 解析。`--url`/`-u` (位置引数でも可)、`--format`/`-f`、`--indent`/`--no-indent`、`--color`/`--no-color`、`--headed`、`--tui` を tri-state で処理。 |
| `packages/cli/src/colorize.ts` | role ベースの ANSI カラーライザ。raw ANSI エスケープコードで button→cyan, heading→bold+magenta 等を実装。外部依存なし。 |
| `packages/cli/src/formatter.ts` | `formatTextOutput(nodes, {indent, color})` と `formatJsonOutput(nodes)` を提供。TTY 判定に応じたインデント・色付けを実行。 |
| `packages/cli/src/playwright-cdp-adapter.ts` | `MinimalCDPSession` interface 経由で Playwright `CDPSession` を `ICDPClient` に適合させる薄いアダプター。 |
| `packages/cli/src/run.ts` | `runCli(argv, io?)` — ブラウザ起動→ページ遷移→CDP セッション取得→`extractA11yTree`→整形→stdout 出力の一連のフロー。`BrowserFactory` を注入可能にしてテスタビリティを確保。 |
| `packages/cli/src/bin.ts` | `#!/usr/bin/env node` shebang エントリ。`runCli(process.argv.slice(2))` を呼び出し。 |
| `packages/cli/src/index.ts` | 公開 API: `runCli` と `CliArgs` 型を再エクスポート。 |

### 設計判断

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

### テスト

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

### 公開 API 変更

`@aria-palina/cli` から以下を新規エクスポート:

```ts
export { runCli } from "./run.js";
export type { CliArgs } from "./args.js";
```

`@aria-palina/core` には変更なし (環境非依存性を維持)。
