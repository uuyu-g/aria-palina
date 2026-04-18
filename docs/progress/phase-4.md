# Phase 4 実装メモ

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

## スコープ

`docs/dd.md` §4 Phase 4 で列挙されている以下を実装した:

- `@aria-palina/tui` パッケージを新規作成 (Ink + React)。
- DD §3.2 の `VirtualList` を純粋関数 `computeWindow` + Ink コンポーネント
  の 2 層に分離して実装。末尾付近の前詰めで、DD §3.2 疑似コードの
  「末尾近くでカーソルを中央化できない」欠陥を補正。
- 矢印キー (`↑`/`↓`/`k`/`j`)・`PageUp`/`PageDown`・`g`/`G`・`q`/`Ctrl+C`
  の最小キーバインドを実装。Phase 5 の `Tab`/`H`/`D` は未実装。
- CLI の `--tui` フラグを `@aria-palina/tui` への dynamic import dispatch
  に差し替え (`packages/cli/src/run.ts` の旧「Phase 4 予告」を削除)。

> ※ 本フェーズ完了後の「CLI/TUI パッケージ統合」リファクタにより、
> `@aria-palina/tui` は `@aria-palina/cli/tui` サブパスに統合された。
> 詳細は [`cli-tui-merge.md`](./cli-tui-merge.md) を参照。

## モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/tui/src/virtual-window.ts` | `computeWindow()` — `[start, end)` を算出する純粋関数。末尾前詰め補正あり。 |
| `packages/tui/src/role-style.ts` | `roleTextStyle(role)` — CLI の `colorizeByRole` に対応する Ink `<Text>` props マッピング。 |
| `packages/tui/src/playwright-cdp-adapter.ts` | `MinimalCDPSession` → `ICDPClient` アダプター (CLI の同名モジュールを構造的に再掲。循環依存回避のため独立)。 |
| `packages/tui/src/components/NodeRow.tsx` | 1 行分の描画コンポーネント。`React.memo` でリレンダ抑制。選択時は `inverse`、非選択時はロール別 color/bold。 |
| `packages/tui/src/components/VirtualList.tsx` | `computeWindow` の結果で `nodes.slice()` し、可視範囲のみ `NodeRow` を描画する仮想スクロール本体。 |
| `packages/tui/src/components/App.tsx` | ヘッダー (URL + 位置) / `VirtualList` / フッター (ヘルプ) の 3 段構成。`useInput` で操作キーを処理。 |
| `packages/tui/src/run.ts` | `runTui(args, io)` — Playwright 起動→CDP セッション→`extractA11yTree`→Ink `render`→`waitUntilExit` の一連のフロー。`BrowserFactory` / `TuiRenderer` / `extractor` が注入可能。 |

## 設計判断

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
- **テーブル密度切替 ([improvements.md §テーブル出力の改善](./improvements.md)) の先送り**: Phase 4 は
  `speechText` をそのまま表示する。一覧用のコンパクト表記と
  詳細ペインのフル表記への分離は Phase 5 で `buildSpeechText` の
  verbosity オプションと一緒に設計する。

## テスト

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

## 公開 API 変更

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
