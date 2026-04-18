# 📊 Implementation Progress

> **Last Updated:** 2026-04-18 (Phase 6)
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
| 4 | Ink TUI 基盤と パフォーマンス最適化 | ✅ Done | `packages/cli/src/tui/{run,virtual-window,role-style,index}.ts` + `components/{App,VirtualList,NodeRow}.tsx` + `__tests__/tui-*.{ts,tsx}` (※旧 `@aria-palina/tui` は CLI に統合済み。下記「CLI/TUI パッケージ統合」参照) |
| 5 | デュアルナビゲーション実装 (TUI) | ✅ Done | `packages/core/src/node-kind.ts` (`findNext` / `filterByKind` / `cycleKind`) + `packages/cli/src/tui/components/App.tsx` (Tab / モーダルフィルタ `h`・`d`・←/→・Esc) + `__tests__/` |
| 6 | Matrix View (Headed モード同期) | ✅ Done | `packages/core/src/highlight.ts` (`enableOverlay` / `highlightNode` / `clearHighlight` / `disableOverlay`) + `packages/cli/src/tui/use-highlight.ts` + App `highlightController` prop + `runTui` の `--headed` 時 Overlay ライフサイクル + `__tests__/highlight.test.ts` / tui-app・tui-run 拡張 |
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

## テーブル出力の改善 (CLI / TUI)

### 実装済み: CLI テーブルコンテキスト (Core)

`flattenAXTree` の後処理として `enrichTableContext` を追加し、テーブル系ノード
の `speechText` に位置情報・列ヘッダー名を自動付与するようにした。

**出力例:**

| ロール | Before | After |
| ------ | ------ | ----- |
| table | `[テーブル]` | `[テーブル 3行×4列] ユーザー一覧` |
| columnheader | `[列見出し] 権限` | `[列見出し 3/4] 権限` |
| cell | `[セル] 管理者` | `[セル 3/4, 権限] 管理者` |

これにより `docs/usecases.md` §1.1 の「理想形」が CLI で実現される。

### 将来計画: TUI でのテーブル表示

TUI (Phase 4 以降) では、CLI とは異なる **2段階の情報密度** を検討する。

| 表示場所 | 情報密度 | 出力例 |
| -------- | -------- | ------ |
| **TUI 一覧** | コンパクト (ヘッダー名のみ) | `[セル, 権限] 管理者` |
| **TUI 詳細ペイン** | フル (位置+ヘッダー名+テーブルメタ) | `[セル 3/4, 権限] 管理者` + テーブル名、行列数等 |

**設計方針:**

- 一覧では位置番号 (`3/4`) を省いて行を短く保つが、列ヘッダー名は残す。
  理由: ヘッダー名が無いと `[セル]` の羅列になり、テーブル構造の問題を
  一覧スキャンで発見できなくなるため。
- 詳細ペインではカーソル位置のノードについて NVDA 完全シミュレーションを
  表示する。行位置 (`tableRowIndex`) も含めたフル情報を出す。
- Core の `A11yNode.properties` には `tableRowIndex` / `tableColIndex` /
  `tableRowCount` / `tableColCount` / `tableColumnHeader` が既に格納されて
  いるため、TUI 側はこれらを参照して表示密度を切り替えるだけで済む。
- TUI 一覧用に `speechText` とは別の簡潔表記を生成する関数を
  `@aria-palina/tui` 側に用意するか、`buildSpeechText` に verbosity オプション
  を追加するかは Phase 4 着手時に決定する。

## ネスト圧縮: wrapper ロールの compound 行吸収 (Core)

`<ul><li><a>ホーム</a></li></ul>` や `<table>…<td><button>削除</button></td></table>`
のように、**名前を持たない 1 要素ラッパー** が単一のインタラクティブ子を包む
深いネストが、リスト・テーブルを含むページで頻出して TUI / CLI 出力を
読みづらくしていた。

`flattenAXTree` の既存後処理 `absorbLoneStaticText` (StaticText 専用の
テキスト吸収) を `absorbLoneChild` に汎用化し、以下のロールが単一の非テキスト
子を持つ場合は 1 行の compound 表記へ圧縮するようにした。

- `listitem` / `menuitem` / `treeitem`
- `cell` / `gridcell`

**出力例:**

| 構造 | Before | After |
| ---- | ------ | ----- |
| `<li><a>ホーム</a></li>` | `[listitem]` + `[link] ホーム` (2 行) | `[listitem] [link] ホーム` (1 行) |
| `<td><button>削除</button></td>` | `[cell 1/1]` + `[button] 削除 (利用不可)` | `[cell 1/1] [button] 削除 (利用不可)` |
| `<li><h3>トピック</h3></li>` | `[listitem]` + `[heading3] トピック` | `[listitem] [heading3] トピック` |

**設計判断:**

- `COMPOUND_WRAPPER_ROLES` を絞り込むことで、たとえば `<main>` や `<paragraph>`
  のようにセマンティックな意味を持つラッパーは畳まない。これら landmark /
  段落は単独行として残る方が H / D ジャンプや読み上げ順序の追跡に都合が良い。
- `isFocusable` と `state` を子から親へマージするため、Tab モード (`findNext`) の
  到達性や disabled の読み上げは保持される。
- compound 行は親の role 表記 (例: `cell 1/1`, tableColumnHeader 付き) を
  そのまま残し、その後ろへ子の `buildSpeechText` 出力 (`[link] ...`, `[button] ...`)
  を連結する。セルのテーブル位置情報を失わずに 1 行に集約できる。
- StaticText 吸収は従来通りの挙動を維持。`name=""` 親 + 単独 StaticText 子 の
  既存テスト群はそのまま緑。

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

## Phase 4 実装メモ

### スコープ

`docs/dd.md` §4 Phase 4 で列挙されている以下を実装した:

- `@aria-palina/tui` パッケージを新規作成 (Ink + React)。
- DD §3.2 の `VirtualList` を純粋関数 `computeWindow` + Ink コンポーネント
  の 2 層に分離して実装。末尾付近の前詰めで、DD §3.2 疑似コードの
  「末尾近くでカーソルを中央化できない」欠陥を補正。
- 矢印キー (`↑`/`↓`/`k`/`j`)・`PageUp`/`PageDown`・`g`/`G`・`q`/`Ctrl+C`
  の最小キーバインドを実装。Phase 5 の `Tab`/`H`/`D` は未実装。
- CLI の `--tui` フラグを `@aria-palina/tui` への dynamic import dispatch
  に差し替え (`packages/cli/src/run.ts` の旧「Phase 4 予告」を削除)。

### モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/tui/src/virtual-window.ts` | `computeWindow()` — `[start, end)` を算出する純粋関数。末尾前詰め補正あり。 |
| `packages/tui/src/role-style.ts` | `roleTextStyle(role)` — CLI の `colorizeByRole` に対応する Ink `<Text>` props マッピング。 |
| `packages/tui/src/playwright-cdp-adapter.ts` | `MinimalCDPSession` → `ICDPClient` アダプター (CLI の同名モジュールを構造的に再掲。循環依存回避のため独立)。 |
| `packages/tui/src/components/NodeRow.tsx` | 1 行分の描画コンポーネント。`React.memo` でリレンダ抑制。選択時は `inverse`、非選択時はロール別 color/bold。 |
| `packages/tui/src/components/VirtualList.tsx` | `computeWindow` の結果で `nodes.slice()` し、可視範囲のみ `NodeRow` を描画する仮想スクロール本体。 |
| `packages/tui/src/components/App.tsx` | ヘッダー (URL + 位置) / `VirtualList` / フッター (ヘルプ) の 3 段構成。`useInput` で操作キーを処理。 |
| `packages/tui/src/run.ts` | `runTui(args, io)` — Playwright 起動→CDP セッション→`extractA11yTree`→Ink `render`→`waitUntilExit` の一連のフロー。`BrowserFactory` / `TuiRenderer` / `extractor` が注入可能。 |

### 設計判断

- **循環依存回避**: TUI は CLI の `adaptCDPSession` / `MinimalCDPSession`
  を import せず、同構造のコピーを TUI 側に保持した。双方向の workspace
  依存を避けつつ、将来 `@aria-palina/extension` の CDP adapter と対称な
  「各アダプタ層がそれぞれ持つ」方針に統一。CLI 側は `adaptCDPSession`
  を公開 API として export (再利用性確保)。
- **TUI は CLI の `CliArgs` を直接 import しない**。代わりに
  `TuiArgs` という最小構造型を定義し、CLI 側はフィールド名で橋渡しする
  (`{ url, headed, role, wait, idleTime, timeout }`)。これにより
  `@aria-palina/cli` → `@aria-palina/tui` の一方向依存を維持。
- **CLI の `--tui` dispatch**: `runCli` 内で
  `import("@aria-palina/tui")` を dynamic import し、
  `runTui(args, defaultTuiIO())` を呼ぶ。テスト時は `RunIO.tuiRunner`
  を注入してフェイクに差し替え可能。
- **仮想スクロール算出**: DD §3.2 の疑似コードは末尾近辺で
  `startIndex + visibleCount > nodes.length` となり最後のノードが
  描画されない問題があったため、`end = min(total, start+viewport)` の
  後に `start = max(0, end - viewport)` で前詰めする補正を入れた。
- **viewport**: 既定で `process.stdout.rows - HEADER_LINES - FOOTER_LINES`。
  テスト用に `viewportOverride` prop を受け取る。
- **非 TTY 環境**: `runTui` は `isTTY === false` の場合、早期に
  exitCode:2 を返し、stderr に日本語案内を書く (Ink の raw mode
  要件に合わせる)。
- **テーブル密度切替 (progress.md §テーブル出力) の先送り**: Phase 4 は
  `speechText` をそのまま表示する。一覧用のコンパクト表記と
  詳細ペインのフル表記への分離は Phase 5 で `buildSpeechText` の
  verbosity オプションと一緒に設計する。

### テスト

`packages/tui/src/__tests__/` に以下のユニットテストを追加
(古典派、日本語テスト名):

- `virtual-window.test.ts` — `computeWindow()` の先頭/中央/末尾/境界
  ケースを純粋関数として検証。カーソルが常に `[start, end)` に
  含まれる不変条件もテスト。
- `virtual-list.test.tsx` — `ink-testing-library` の `lastFrame()` で、
  ビューポート分のみ描画されること、末尾付近でも viewport 分の行が
  描画されること、選択行に `>` プレフィクスが付くこと、空配列時の
  案内メッセージ、`depth` 連動インデントを検証。
- `app.test.tsx` — キーストローク (`stdin.write`) を投入して
  カーソル移動・PageDown・`g`/`G`・ヘッダー/フッター表示を検証。
  `useInput` の effect 登録タイミングに合わせて `setImmediate` を
  複数回回す `waitFrames()` ヘルパーを共有。
- `run.test.ts` — fake `BrowserFactory` + fake `TuiRenderer` で、
  非 TTY 時の早期 exit、ブラウザ close、role フィルタ、Chromium
  未インストール時の案内を検証。

`@aria-palina/cli` 側の `run.test.ts` は `--tui` 指定時の旧案内
テストを、`tuiRunner` 注入テストに置き換えた。

### 公開 API 変更

`@aria-palina/tui` から以下を新規エクスポート:

```ts
export { runTui, defaultTuiIO, type TuiArgs, type TuiIO, type TuiRenderer, type TuiRenderResult, type BrowserFactory, type BrowserHandle } from "./run.js";
export { App, type AppProps } from "./components/App.js";
export { VirtualList, type VirtualListProps } from "./components/VirtualList.js";
export { NodeRow, type NodeRowProps } from "./components/NodeRow.js";
export { computeWindow, type VirtualWindow, type VirtualWindowInput } from "./virtual-window.js";
export { adaptCDPSession, type MinimalCDPSession } from "./playwright-cdp-adapter.js";
```

`@aria-palina/cli` から以下を新規エクスポート (再利用性向上のため):

```ts
export type { BrowserFactory, BrowserHandle, RunIO, TuiRunner } from "./run.js";
export { parseCliArgs, type ParseResult } from "./args.js";
export { adaptCDPSession, type MinimalCDPSession } from "./playwright-cdp-adapter.js";
```

`@aria-palina/core` には変更なし (環境非依存性を維持)。

## Phase 5 実装メモ

### スコープ

`docs/dd.md` §4 Phase 5 で列挙されている以下を実装した:

- ブラウズモード (矢印キー / DOM 順移動) は Phase 4 で既に実装済み。
- **フォーカスモード (`Tab` / `Shift+Tab`)**: インタラクティブ要素 (ブラウザで focusable かつ disabled でない) のみをジャンプする。
- **クイックジャンプ (`h` / `H` / `D`)**: 見出し (`role="heading"`) とランドマーク (ARIA landmark roles) 間の巡回 (PRD §4.2 / manual.md)。

### モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/core/src/node-kind.ts` | `NodeKind` (`interactive` / `heading` / `landmark`) 判定と `findNext(nodes, from, kind, direction)` 純粋関数。ARIA landmark roles は内部の `Set` で定義。 |
| `packages/tui/src/components/App.tsx` | `useInput` 分岐を拡張し `Tab` / `Shift+Tab` / `h` / `H` / `D` を `findNext` に dispatch。該当要素が無い場合は cursor を動かさない。 |

### 設計判断

- **インタラクティブ判定は `A11yNode.isFocusable` を再利用**。Phase 2 で CDP の `focusable` state から既に付与されているため、role ベースの判定リストを増設する必要がない。`state.disabled === true` のみ追加で除外する。
- **ラップアラウンドしない**: `findNext` は末尾 (または先頭) の先に該当が無ければ `-1` を返し、App 側で cursor を維持する。「押すたびにジャンプ」する manual の表現と整合し、無限ループ感を回避。
- **キー規約**: `g`/`G` の小文字=順方向・大文字=逆方向規約に倣い、`h`/`H` も小文字を順方向 (Phase 4 互換の下矢印方向) に採用。PRD は大文字 `H` 単独表記だが、詳細規約は DD / manual で具体化し、manual.md を併せて更新した。
- **Core/TUI 境界**: ARIA 仕様知識は全て core 側に閉じ込め、TUI は `findNext` の戻り値を state に反映するだけ。CLAUDE.md 「アーキテクチャ不変条件」に準拠。

### テスト

- `packages/core/src/__tests__/node-kind.test.ts` — `matchesKind` / `findNext` を純粋関数として入出力比較で網羅 (古典派)。disabled スキップ、空配列、境界 (`-1`) を確認。
- `packages/tui/src/__tests__/app.test.tsx` — `ink-testing-library` で Tab/Shift+Tab/h/H/D の cursor 移動、および該当なし時の静止を状態検証。

### 公開 API 変更

`@aria-palina/core`:

```ts
export { findNext, matchesKind, type NodeKind } from "./node-kind.js";
```

`@aria-palina/tui` には新規 export なし (App の挙動拡張のみ)。

## Phase 5.1 ショートカット体系リファクタ (モーダルフィルタ)

Phase 5 完了後に、以下の理由でキーバインド体系を再設計した:

- `H` (Shift+h) / `D` (Shift+d) の「Shift=逆方向」規約が非対称 (landmark の逆方向が未実装だった)。
- 見出し・ランドマーク・インタラクティブが全て**単発ジャンプ**で、「今どの種別を巡回しているか」がユーザーに見えにくかった。スクリーンリーダーの「要素リスト (elements list)」UX に寄せる。

### 新しい体系

| キー | モード | アクション |
| --- | --- | --- |
| `h` | 通常 → フィルタ | 「見出し」フィルタモードに入り次の見出しへ |
| `d` | 通常 → フィルタ | 「ランドマーク」フィルタモードに入り次のランドマークへ |
| `↑` / `↓` / `j` / `k` | フィルタ中 | 絞り込まれたリスト内で 1 件移動 |
| `←` / `→` | フィルタ中 | 種別を巡回 (`heading` → `landmark` → `interactive`) |
| `g` / `G` | フィルタ中 | 絞り込みリストの先頭 / 末尾へ |
| `Esc` | フィルタ中 | フィルタ解除して通常モードに戻る (カーソル位置は維持) |
| `Tab` / `Shift+Tab` | 両モード | 全体ツリーのインタラクティブ要素を巡回 (フィルタ中に押すと自動解除) |

### 実装差分

- **`@aria-palina/core`**: `filterByKind(nodes, kind)` と `cycleKind(current, direction)` の 2 つの純粋ヘルパーを `node-kind.ts` に追加。既存の `matchesKind` / `findNext` をそのまま再利用。
- **`@aria-palina/cli/tui`**: `App.tsx` に `filterKind: NodeKind | null` 状態と、`visibleNodes` / `visibleToFull` / `visibleCursor` の `useMemo` 派生値を導入。`cursor` はフル配列のインデックスを維持するため `Esc` 復元は `setFilterKind(null)` だけで済む。ヘッダーはフィルタ中に `[見出し]` / `[ランドマーク]` / `[インタラクティブ]` の種別ラベルのみを表示する (「フィルタ」の語も位置表記も冗長なので省略)。該当要素が無いときは**フィルタモードに入らない** (`findNext` が `-1` を返した場合の no-op ガード)。
- **UI**: フッターヘルプをモード別に切り替え (`↑/↓ 移動 Tab フォーカス h 見出し d ランドマーク …` ↔ `↑/↓ 移動 ←/→ フィルタ切替 … Esc 解除 …`)。

### テスト

- `packages/core/src/__tests__/node-kind.test.ts` — `filterByKind` (順序保存 / 空配列 / disabled 除外) と `cycleKind` (順・逆方向巡回) の純粋関数テストを追加。
- `packages/cli/src/__tests__/tui-app.test.tsx` — 既存の `H` / 大文字 `D` テストを削除し、`d` (小文字) によるランドマークフィルタ進入、`describe("App filter mode", ...)` に 7 本の新規テスト (絞り込み表示・↑↓ 挙動・←→ 巡回・Esc 解除・g/G・Tab 解除) を追加。全 180 件緑。

## Phase 間のリファクタリング: CLI/TUI パッケージ統合

### スコープ

DD §1.1 / §1.2 初期案の 「`@aria-palina/cli` + `@aria-palina/tui` の 2 パッケージ + Phase 9
で umbrella `aria-palina`」 という 3 段構造を、`vitest` / `vitest run` に倣って
**単一パッケージ + モードフラグ** 構造に再編した。

- `packages/tui/` 配下を `packages/cli/src/tui/` に吸収。
- `playwright-cdp-adapter.ts` の二重保持 (循環依存回避のために両パッケージに同一コードを置いていた) を解消し、CLI 側の単一ファイルに一本化。
- `@aria-palina/tui` は workspace から削除。`ink` / `react` / `@types/react` / `ink-testing-library` の依存は `@aria-palina/cli` に移管。
- `runCli` の TUI dispatch は `import("@aria-palina/tui")` → `import("./tui/index.js")` に差し替え。ワンショット実行時に Ink/React がロードされない遅延ロード特性は維持。
- TUI 公開 API は `@aria-palina/cli/tui` サブパスエクスポート (`packages/cli/src/tui/index.ts`) から参照する形に整理。

### 動機

- `palina` は AOM ツリービューアという単一ツールで、one-shot / 対話は出力モード違いに過ぎない (vitest と同じ構図)。
- 旧構造では CDP アダプタを **循環依存回避のためだけに** 同一コードで二重保持しており、境界コストが機能価値を下回っていた。
- Phase 7 Chrome Extension は `chrome.debugger` + DOM/React を使う別実装で、Ink 製 TUI の再利用予定は DD にも存在しないため、TUI を独立パッケージにしておく分離利得が弱い。
- Phase 9 の umbrella も `@aria-palina/cli` を npm 公開する薄い alias に簡略化できる。

### 影響範囲

| 変更 | ファイル |
| ---- | -------- |
| ソース移設 | `packages/tui/src/**` → `packages/cli/src/tui/**` |
| テスト移設 | `packages/tui/src/__tests__/{app,run,virtual-list,virtual-window}.test.*` → `packages/cli/src/__tests__/tui-*.{ts,tsx}` |
| 公開 API | `@aria-palina/cli` ルート (`src/index.ts`) + 新サブパス `@aria-palina/cli/tui` (`src/tui/index.ts`) |
| ビルド | `packages/cli/package.json` の `build` エントリに `src/tui/index.ts` を追加。`exports` に `./tui` を追加 |
| 依存 | `packages/cli/package.json` の `dependencies` から `@aria-palina/tui` 削除、`ink` / `react` を追加 |
| tsconfig | `packages/cli/tsconfig.json` に `"jsx": "react-jsx"` を追加 (.tsx を含むため) |
| DD | §1.1 / §1.2 を単一パッケージ + モードフラグ前提に改訂 (§4 ロードマップは不変) |
| CLAUDE.md | モジュール一覧・テストファイル一覧・配布想定を CLI 統合構造に更新 |

### 検証

- `vp test` — 全テスト緑 (`packages/cli/src/__tests__/tui-*.{ts,tsx}` 含む)。
- `vp check` — lint / format 緑。
- `vp run -F './packages/*' build` — `@aria-palina/core` + `@aria-palina/cli` が緑。`packages/cli/dist/` に `index.mjs` / `bin.mjs` / `tui/index.mjs` の 3 エントリが生成される。

### 公開 API 変更

`@aria-palina/cli` (`src/index.ts`) は従来のまま (`runCli`, `CliArgs`, `adaptCDPSession` 等)。

`@aria-palina/cli/tui` サブパス (`src/tui/index.ts`) から以下を新規エクスポート:

```ts
export {
  runTui,
  defaultTuiIO,
  type BrowserFactory,
  type BrowserHandle,
  type TuiArgs,
  type TuiIO,
  type TuiRenderer,
  type TuiRenderResult,
} from "./run.js";
export { App, type AppProps } from "./components/App.js";
export { VirtualList, type VirtualListProps } from "./components/VirtualList.js";
export { NodeRow, type NodeRowProps } from "./components/NodeRow.js";
export { computeWindow, type VirtualWindow, type VirtualWindowInput } from "./virtual-window.js";
```

`@aria-palina/tui` は workspace ごと削除されたため存在しない。`adaptCDPSession` は CLI 側の公開 API (`@aria-palina/cli`) から一本化して参照する。

## Phase 6 実装メモ

### スコープ

`docs/dd.md` §3.3 / §4 Phase 6 で列挙されている以下を実装した:

- TUI モードで `--headed` が指定された場合、CDP `Overlay` ドメインを通じて
  カーソル位置の DOM ノードをブラウザ画面上で青い網掛けハイライトする
  「TUI → ブラウザ」片方向同期。
- 実行時のライフサイクル管理 (`Overlay.enable` 起動時、`hideHighlight` +
  `Overlay.disable` 終了時)。

### モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/core/src/highlight.ts` | `enableOverlay` / `disableOverlay` / `highlightNode` / `clearHighlight` の薄いラッパー。`backendNodeId === 0` のときは `highlightNode` を no-op として握りつぶす。 |
| `packages/cli/src/tui/use-highlight.ts` | `useHighlight(controller, backendNodeId, options?)` フック。`backendNodeId` 変更を debounce (既定 50ms) してから `controller.highlight()` を呼び、アンマウント時に `controller.clear()` を呼ぶ。`controller === null` のときは完全 no-op。 |
| `packages/cli/src/tui/components/App.tsx` | `highlightController?: HighlightController \| null` prop を受け取り、`useHighlight` でカーソル変更を監視。フィルタモード中も同じ `cursor` (フル配列) の `backendNodeId` を渡す。 |
| `packages/cli/src/tui/run.ts` | `args.headed === true` のときのみ `adaptCDPSession(session)` を `enableOverlay` し、`HighlightController` を構築して App に渡す。`waitUntilExit()` 後に `clearHighlight` + `disableOverlay` を握りつぶしながら呼ぶ。 |

### 設計判断

- **逆方向同期は未実装**: DD §3.3 は「双方向」と表記しているが Phase 6 のスコープは
  TUI → ブラウザの片方向のみとした。逆方向 (ブラウザクリック → TUI カーソル移動) は
  `Overlay.inspectNodeRequested` 等のイベント駆動が必要で、実装コスト/UX 価値が
  見合わないため Phase 7 (Chrome Extension) で改めて検討する。
- **fire-and-forget**: `HighlightController.highlight` / `clear` は Promise を返さず、
  内部で `safeIgnore` してエラーを完全黙殺する。ブラウザが既に閉じられた状態の
  CDP コマンド失敗が TUI 描画を壊すのを防ぐ。
- **debounce 50ms**: `j` 連打時の CDP 呼び出し氾濫を抑える。50ms はキー連打
  (典型的に 30〜80ms 間隔) を 1 回の `highlightNode` に集約しつつ、単発操作の
  視覚遅延として知覚されない閾値として選択。
- **`backendNodeId === 0` で no-op**: `flatten.ts` は `backendDOMNodeId` 欠落時に 0 を
  フォールバック格納するため、core 側で 0 を弾けば呼び出し側はガード不要。
- **`Overlay.enable` 失敗を握りつぶす**: 一部環境で Overlay が enable できなくても
  TUI 起動自体は止めない。`highlightController = null` のまま続行し、ハイライト
  だけが無効化される (UX 劣化はあるが致命的ではない)。
- **headless 互換**: `args.headed === false` のときは `Overlay` 系コマンドを一切
  発行せず、`highlightController = null` を App に渡す。既存の headless TUI 挙動と
  完全互換。

### テスト

- `packages/core/src/__tests__/highlight.test.ts` — 純粋な CDP 呼び出し検証
  (古典派、外部境界モック)。`Overlay.enable` / `Overlay.highlightNode` の
  既定 `contentColor` / `backendNodeId === 0` no-op / カスタム HighlightConfig マージ /
  `Overlay.hideHighlight` / `Overlay.disable` を網羅。
- `packages/cli/src/__tests__/tui-app.test.tsx` — `App highlight controller` describe
  に 3 本追加。`controller=null` で何も呼ばれないこと、マウント直後と ↓ 操作時に
  `backendNodeId` 1→2 が `highlight` に渡ること、アンマウント時に `clear` が
  呼ばれることを fake controller で検証。
- `packages/cli/src/__tests__/tui-run.test.ts` — `--headed` 指定時に
  `Overlay.enable` / `Overlay.hideHighlight` / `Overlay.disable` がセッションへ
  発行されること、headless 時は `Overlay.*` が一切呼ばれず `highlightController` が
  `null` であることを検証。

### 公開 API 変更

`@aria-palina/core`:

```ts
export {
  clearHighlight,
  disableOverlay,
  enableOverlay,
  highlightNode,
  type HighlightConfig,
  type RGBA,
} from "./highlight.js";
```

`@aria-palina/cli/tui`:

```ts
export {
  useHighlight,
  type HighlightController,
  type UseHighlightOptions,
} from "./use-highlight.js";
```

`AppProps` に `highlightController?: HighlightController | null` と
`highlightDebounceMs?: number` (テスト用) を追加。
