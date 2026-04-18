# Phase 間のリファクタリング: CLI/TUI パッケージ統合

> やったこと記録。Phase 4 完了後に `@aria-palina/tui` を `@aria-palina/cli` に吸収した経緯。
> [← DD §4 Roadmap](../dd.md) / [plan.md](../plan.md)

## スコープ

DD §1.1 / §1.2 初期案の 「`@aria-palina/cli` + `@aria-palina/tui` の 2 パッケージ + Phase 9
で umbrella `aria-palina`」 という 3 段構造を、`vitest` / `vitest run` に倣って
**単一パッケージ + モードフラグ** 構造に再編した。

- `packages/tui/` 配下を `packages/cli/src/tui/` に吸収。
- `playwright-cdp-adapter.ts` の二重保持 (循環依存回避のために両パッケージに同一コードを置いていた) を解消し、CLI 側の単一ファイルに一本化。
- `@aria-palina/tui` は workspace から削除。`ink` / `react` / `@types/react` / `ink-testing-library` の依存は `@aria-palina/cli` に移管。
- `runCli` の TUI dispatch は `import("@aria-palina/tui")` → `import("./tui/index.js")` に差し替え。ワンショット実行時に Ink/React がロードされない遅延ロード特性は維持。
- TUI 公開 API は `@aria-palina/cli/tui` サブパスエクスポート (`packages/cli/src/tui/index.ts`) から参照する形に整理。

## 動機

- `palina` は AOM ツリービューアという単一ツールで、one-shot / 対話は出力モード違いに過ぎない (vitest と同じ構図)。
- 旧構造では CDP アダプタを **循環依存回避のためだけに** 同一コードで二重保持しており、境界コストが機能価値を下回っていた。
- Phase 7 Chrome Extension は `chrome.debugger` + DOM/React を使う別実装で、Ink 製 TUI の再利用予定は DD にも存在しないため、TUI を独立パッケージにしておく分離利得が弱い。
- Phase 9 の umbrella も `@aria-palina/cli` を npm 公開する薄い alias に簡略化できる。

## 影響範囲

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

## 検証

- `vp test` — 全テスト緑 (`packages/cli/src/__tests__/tui-*.{ts,tsx}` 含む)。
- `vp check` — lint / format 緑。
- `vp run -F './packages/*' build` — `@aria-palina/core` + `@aria-palina/cli` が緑。`packages/cli/dist/` に `index.mjs` / `bin.mjs` / `tui/index.mjs` の 3 エントリが生成される。

## 公開 API 変更

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
