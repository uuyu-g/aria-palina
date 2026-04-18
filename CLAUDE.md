# CLAUDE.md

> このファイルは Claude Code / その他の AI エージェントに向けた、
> `aria-palina` monorepo の**プロジェクト規約**を記した運用メモである。
> コードを書き始める前に必ず目を通し、矛盾する判断を避けること。

## 📚 参照ドキュメント

仕様の一次ソースは以下の通り。AI エージェントは **必ずこれらを先に読むこと**。

- [`docs/prd.md`](./docs/prd.md) — プロダクト要件定義 (PRD)。
- [`docs/dd.md`](./docs/dd.md) — 設計ドキュメント (DD)。§4 の開発ロードマップが
  実装の主な道筋を示している。**DD のロードマップ本体は仕様書として不変** で
  あり、進捗情報の追記は禁止。
- [`docs/usecases.md`](./docs/usecases.md) — UX シミュレーション集。
- [`docs/manual.md`](./docs/manual.md) — ユーザー向けマニュアル (`palina` CLI/TUI)。
- [`docs/plan.md`](./docs/plan.md) — **予定・ステータス管理ドキュメント**。
  各フェーズのステータス (✅ / 🚧 / ⏳) と次にやることを集約する。
  ステータス遷移が発生したときのみ更新すること。
- [`docs/progress/`](./docs/progress/) — **やったこと記録 (done records)**。
  フェーズ別 (`phase-N.md`) + 横断リファクタ (`improvements.md` /
  `cli-tui-merge.md`) にファイル分割。フェーズ完了時に対応する done record を
  新規作成する。

---

## 🗂️ コードベース構造

### モノレポ概要

```
aria-palina/
├── packages/
│   ├── core/          # @aria-palina/core  — 環境非依存コアエンジン
│   └── cli/           # @aria-palina/cli   — Playwright one-shot CLI + Ink TUI (--tui)
├── docs/              # 仕様書・進捗トラッキング
├── .github/workflows/ # CI (GitHub Actions)
├── package.json       # ルート (private, pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── CLAUDE.md          # 本ファイル
```

- **パッケージマネージャ**: pnpm 10.33.0 (pnpm workspaces で `packages/*` を管理)
- **TypeScript**: 6.x — `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`

### `@aria-palina/core` (packages/core)

環境非依存の純粋 TypeScript ライブラリ。外部ランタイム依存なし。

| モジュール                     | 責務                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `src/cdp-client.ts`            | `ICDPClient` インターフェース定義 (DI 境界)                       |
| `src/types.ts`                 | `A11yNode` データモデル                                           |
| `src/ax-protocol.ts`           | CDP `Accessibility` ドメインの最小型定義 (`RawAXNode` 等)         |
| `src/extract.ts`               | `extractA11yTree(cdp)` — CDP から AX ツリーを取得し平坦化         |
| `src/flatten.ts`               | `flattenAXTree(rawNodes)` — DFS 平坦化 + `depth` 算出             |
| `src/speech.ts`                | `buildSpeechText(input)` — NVDA 風日本語テキスト変換              |
| `src/table-context.ts`         | `enrichTableContext()` — テーブル系ノードに位置・列ヘッダーを付与 |
| `src/wait-for-network-idle.ts` | `waitForNetworkIdle(cdp)` — SPA 非同期読み込み待機                |

**公開 API** (`src/index.ts`):

```ts
// 型
export type { ICDPClient } from "./cdp-client.js";
export type { A11yNode } from "./types.js";
export type { GetFullAXTreeResult, RawAXNode, RawAXProperty, RawAXValue } from "./ax-protocol.js";
// 関数
export { flattenAXTree, type FlattenOptions } from "./flatten.js";
export { buildSpeechText, type SpeechInput } from "./speech.js";
export { extractA11yTree } from "./extract.js";
export { waitForNetworkIdle, type NetworkIdleOptions } from "./wait-for-network-idle.js";
```

**ビルド**: `vp pack --dts --clean src/index.ts` → `dist/index.mjs` + `dist/index.d.mts`

### `@aria-palina/cli` (packages/cli)

`palina` バイナリを提供する単一パッケージ。デフォルトは Playwright ワンショット
CLI (NVDA 風テキストを stdout に出力)、`--tui` フラグで Ink (React) ベースの
対話 TUI にモード切替する。vitest の `vitest` / `vitest run` と同じ「単一
パッケージ・モードフラグ」モデル。

#### CLI モード (トップレベル)

| モジュール                      | 責務                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/args.ts`                   | `node:util.parseArgs` による argv 解析 (tri-state オプション)                                          |
| `src/colorize.ts`               | role ベースの ANSI カラーライザ (外部依存なし)                                                         |
| `src/formatter.ts`              | text/json 出力フォーマッタ (TTY 判定連動)                                                              |
| `src/playwright-cdp-adapter.ts` | Playwright `CDPSession` → `ICDPClient` アダプター (CLI/TUI 共用)                                       |
| `src/run.ts`                    | `runCli(argv, io?)` — ブラウザ起動→AOM 取得→整形→出力。`--tui` 時は `./tui/index.js` を dynamic import |
| `src/bin.ts`                    | `#!/usr/bin/env node` shebang エントリ                                                                 |

#### TUI モード (`src/tui/`)

Ink (React) ベースのインタラクティブ TUI。`palina --tui` で起動する。
`runCli` が `--tui` 判定後に `./tui/index.js` を dynamic import するため、
ワンショット実行時は Ink/React/tui サブツリーは一切ロードされない。

| モジュール                           | 責務                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `src/tui/virtual-window.ts`          | `computeWindow()` — 仮想スクロール可視レンジ算出 (純粋関数、末尾前詰め補正) |
| `src/tui/role-style.ts`              | `roleTextStyle(role)` — Ink `<Text>` props (color / bold) マッピング        |
| `src/tui/components/NodeRow.tsx`     | 1 行描画 (`React.memo` でリレンダ抑制)                                      |
| `src/tui/components/VirtualList.tsx` | `computeWindow` 結果で slice して可視分のみ描画                             |
| `src/tui/components/App.tsx`         | ヘッダー / VirtualList / フッターの 3 段。`useInput` でキーバインド処理     |
| `src/tui/run.ts`                     | `runTui(args, io)` — ブラウザ起動→AOM 取得→Ink render→`waitUntilExit`       |
| `src/tui/index.ts`                   | TUI サブパス公開 API バレル (`@aria-palina/cli/tui`)                        |

**公開 API**:

`@aria-palina/cli` ルート (`src/index.ts`):

```ts
export { runCli } from "./run.js";
export type { BrowserFactory, BrowserHandle, RunIO, TuiRunner } from "./run.js";
export type { CliArgs } from "./args.js";
export { parseCliArgs, type ParseResult } from "./args.js";
export { adaptCDPSession, type MinimalCDPSession } from "./playwright-cdp-adapter.js";
```

`@aria-palina/cli/tui` サブパス (`src/tui/index.ts`):

```ts
export {
  runTui,
  defaultTuiIO,
  type TuiArgs,
  type TuiIO,
  type TuiRenderer,
  type TuiRenderResult,
  type BrowserFactory,
  type BrowserHandle,
} from "./run.js";
export { App, type AppProps } from "./components/App.js";
export { VirtualList, type VirtualListProps } from "./components/VirtualList.js";
export { NodeRow, type NodeRowProps } from "./components/NodeRow.js";
export { computeWindow, type VirtualWindow, type VirtualWindowInput } from "./virtual-window.js";
```

**依存関係**: `@aria-palina/core@workspace:*`, `ink@^5`, `react@^18`, `playwright-core@~1.56.0`
**バイナリ**: `palina` → `./dist/bin.mjs`
**キーバインド**: `↑`/`↓`/`j`/`k` (行移動), `PageUp`/`PageDown` (ページ移動), `g`/`G` (先頭/末尾), `Tab`/`Shift+Tab` (インタラクティブ), `h`/`H` (見出し), `D` (ランドマーク), `q`/`Ctrl+C` (終了)。

### 将来のパッケージ (未実装)

DD §1.1 で計画されているが、まだ作成されていないパッケージ:

| パッケージ                | Phase | 概要                                                          |
| ------------------------- | ----- | ------------------------------------------------------------- |
| `@aria-palina/extension`  | 7     | Chrome DevTools 拡張 (Manifest V3)                            |
| `@aria-palina/test-utils` | 8     | Playwright カスタムマッチャー (`toHavePalinaText` 等)         |
| `aria-palina` (umbrella)  | 9     | npm 公開用の unscoped alias (`@aria-palina/cli` を re-export) |

---

## 🚦 実装進捗

- **予定・ステータス一覧** → [`docs/plan.md`](./docs/plan.md)
- **完了フェーズの詳細記録** → [`docs/progress/phase-*.md`](./docs/progress/)
- **横断的な改善記録** → [`docs/progress/improvements.md`](./docs/progress/improvements.md) / [`docs/progress/cli-tui-merge.md`](./docs/progress/cli-tui-merge.md)

CLAUDE.md にはフェーズ状態を重複して書かない (コンフリクト原因になるため)。
現在のステータスは `docs/plan.md` を一次ソースとして参照する。

---

## 🧰 ツールチェーン: Vite+

本プロジェクトは **Vite+ (`vp` コマンド)** を統一ツールチェーンとして採用している。
詳細は `node_modules/vite-plus/AGENTS.md` を参照。

### やるべきこと

- 依存追加: `pnpm install` ではなく **`vp install`** (または `pnpm exec vp install`)。
- テスト実行: **`vp test`** (内部で Vitest が走る)。
- Lint / フォーマット: **`vp check`** / **`vp check --fix`**。
- ビルド (各パッケージ): **`vp run -F './packages/*' build`** (ルート `package.json` の `build` スクリプト)。
- CI 相当の検証: コミット前に **必ず** 以下を通すこと:
  1. `vp test`
  2. `vp check`
  3. `vp run -F './packages/*' build`

### やってはいけないこと

- `vitest` / `oxlint` / `oxfmt` / `tsdown` を **直接 devDependency に追加しない**。
  Vite+ がこれらを内包している。
- テストで `import { ... } from "vitest"` と書かない。
  必ず `import { describe, expect, test, vi } from "vite-plus/test"` を使う。
- `vp build` は Vite のアプリビルドを実行するコマンド。
  ライブラリをビルドしたい場合は **`vp pack`** (各 package.json に定義済み) を使う。
- `pnpm` を直接叩くより `vp` 経由を優先する (package manager は Vite+ が wrap する)。

### クイックリファレンス

```bash
vp test                              # 全ワークスペースのテスト実行
vp check                             # lint + format チェック
vp check --fix                       # lint + format 自動修正
vp run -F './packages/*' build       # 全パッケージのライブラリビルド
vp install <pkg>                     # 依存追加
```

---

## 🧪 テストの規約

### テストランナー / 配置

- テストランナーは Vite+ 同梱の **Vitest**。`vp test` で全ワークスペースを横断実行する。
- テストファイルは実装ファイルと同じパッケージの
  `src/__tests__/*.test.ts` 配下に置く。
  (例: `packages/core/src/flatten.ts` → `packages/core/src/__tests__/flatten.test.ts`)
- 共有テストヘルパーは `src/__tests__/helpers.ts` に配置。
- import は必ず:
  ```ts
  import { describe, expect, test, vi } from "vite-plus/test";
  ```

### 現在のテストファイル一覧

**`@aria-palina/core`** (`packages/core/src/__tests__/`):

- `flatten.test.ts` — DFS 平坦化、depth 付与、ignored スキップ
- `speech.test.ts` — NVDA テキスト変換 (ロール・状態・heading level 等)
- `extract.test.ts` — CDP モック経由の AOM 抽出
- `table-context.test.ts` — テーブル位置・列ヘッダー付与
- `wait-for-network-idle.test.ts` — ネットワークアイドル検出
- `a11y-detection.test.ts` — a11y 劣化検出
- `helpers.ts` — 共有テストユーティリティ

**`@aria-palina/cli`** (`packages/cli/src/__tests__/`):

- `args.test.ts` — argv 解析・バリデーション
- `colorize.test.ts` — ANSI カラー装飾
- `formatter.test.ts` — text/json 出力フォーマット
- `playwright-cdp-adapter.test.ts` — CDP アダプター透過性
- `run.test.ts` — CLI 実行フロー (fake BrowserFactory 注入)
- `tui-run.test.ts` — TUI 実行フロー (非 TTY / role フィルタ / renderer 注入)
- `tui-app.test.tsx` — Ink App のキーバインド挙動 (`ink-testing-library`)
- `tui-virtual-list.test.tsx` — 仮想スクロール描画検証
- `tui-virtual-window.test.ts` — `computeWindow` の純粋関数テスト
- `helpers.ts` — 共有テストユーティリティ (CLI/TUI 両方で使う)

### 🌐 テストケース名は日本語で書く

**プロジェクト規約**: `test(...)` / `it(...)` に渡す説明文字列は **日本語** で書くこと。

- 理由: `aria-palina` のドメイン (NVDA 発話テキスト、ARIA state の日本語ラベル等)
  は日本語の語彙で思考されており、仕様書 (`docs/*.md`) も全て日本語のため、
  テストの意図が読み手に最短距離で伝わる。
- `describe(...)` のグルーピング名は **実装シンボル名** (例: `buildSpeechText`,
  `flattenAXTree`) をそのまま使い、その配下の `test(...)` 名を日本語にする。

#### ✅ 良い例

```ts
describe("buildSpeechText", () => {
  test("disabled=true の真偽値状態が『利用不可』として出力される", () => { ... });
  test("heading は properties.level をロールラベル末尾に連結する", () => { ... });
});
```

#### ❌ 悪い例

```ts
describe("buildSpeechText", () => {
  test("renders disabled state as 利用不可", () => { ... });          // 英語
  test("should announce level for heading role", () => { ... });      // 英語 + BDD 冗長語
});
```

### アサーションの書き方

- 文字列比較は `toBe` を使う (`expect(text).toBe("[button] 送信")`)。
- 構造比較は `toEqual` を使う。`toMatchObject` は必要最小限。
- モックには `vi.fn()` を使い、型パラメータを使わず `as` キャストで
  型を当てるとシンプルになる (例: `vi.fn(async () => result) as ICDPClient["send"]`)。

### 🏛️ 古典派 (Classicist) を第一選択とする

**プロジェクト規約**: 単体テストは **Detroit / Chicago school (古典派)** を
デフォルトとする。`vi.fn()` のスパイ検証 (`toHaveBeenCalled*`) を多用する
Mockist (London school) スタイルは避ける。

#### 優先順位

1. **純粋関数は直接呼ぶ (ダブル不要)**
   `@aria-palina/core` の中心は純粋関数 (`flattenAXTree`, `buildSpeechText` 等)。
   これらはダブルを一切使わず、入力 → 戻り値の比較だけでテストする。
2. **内部コラボレーションは古典派で書く**
   同一パッケージ内のヘルパー・クラスは本物を組み合わせて実行し、
   公開 API の戻り値 (状態) で振る舞いを検証する。内部オブジェクトを
   `vi.fn()` で包むのは避ける。
3. **外部境界 (`ICDPClient` 等) はモックでよい**
   CDP / HTTP / fs / DB など**プロセスや実行環境をまたぐ境界**は、
   `vi.fn()` ベースのシンプルなモックで決まった応答を返せばよい。
   副作用の重い動くフェイクを作り込む必要はない。
   ただしテストの関心は**引数 & 戻り値の状態**に置き、
   `toHaveBeenCalledWith` のような**相互作用検証は最後の手段**に留める
   (実装詳細に結合するため)。

#### ✅ 良い例 (純粋関数の状態検証)

```ts
describe("buildSpeechText", () => {
  test("disabled=true の真偽値状態が『利用不可』として出力される", () => {
    const text = buildSpeechText({
      role: "button",
      name: "送信",
      properties: {},
      state: { disabled: true },
    });
    expect(text).toBe("[button] 送信 (利用不可)");
  });
});
```

#### ✅ 良い例 (外部境界は軽量モック、検証は戻り値)

```ts
function mockCDPClient(result: GetFullAXTreeResult): ICDPClient {
  return {
    send: vi.fn(async () => result) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
}

test("多段ツリーが DFS 順で平坦化される", async () => {
  const tree = await extractA11yTree(mockCDPClient({ nodes: [...] }));
  expect(tree.map((n) => n.speechText)).toEqual(["[main]", "[button] 送信"]);
});
```

#### ❌ 悪い例 (相互作用検証で実装詳細に結合)

```ts
test("calls Accessibility.getFullAXTree", async () => {
  const cdp = {
    send: vi.fn(async () => ({ nodes: [] })),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as ICDPClient;
  await extractA11yTree(cdp);
  expect(cdp.send).toHaveBeenCalledWith("Accessibility.getFullAXTree"); // 実装詳細の検証
});
```

---

## 🏗️ アーキテクチャ不変条件

- **`@aria-palina/core` は環境非依存 (pure TS)** を保つ。
  puppeteer / playwright / `chrome.debugger` / React / Ink / fs / net に
  直接依存するコードを core に入れない。注入は `ICDPClient` 経由のみ。
- 公開 API は各パッケージの `src/index.ts` からしか export しない。
  アダプタ層 (`@aria-palina/cli` 等) は内部ファイルを直 import しないこと。
- Phase の実装順序は `docs/dd.md` §4 を守る。既存のフェーズを飛ばして将来フェーズを
  先出しする場合は必ず `docs/plan.md` にその旨を記録する。

### データフロー

```
[ブラウザ]
    │  Accessibility.getFullAXTree (CDP)
    ▼
extractA11yTree(cdp)          ← @aria-palina/core
    │  RawAXNode[]
    ▼
flattenAXTree(rawNodes)       ← @aria-palina/core (純粋関数)
    │  A11yNode[] (depth 付き)
    ▼
enrichTableContext(nodes)     ← @aria-palina/core (テーブル系後処理)
    │  A11yNode[] (位置・ヘッダー付き)
    ▼
formatTextOutput / formatJsonOutput  ← @aria-palina/cli
    │
    ▼
[stdout]
```

### DI 境界: `ICDPClient`

Core はブラウザ接続を `ICDPClient` インターフェースで抽象化している。
各アダプタ層が具体実装を注入する:

| アダプタ                               | パッケージ               | Phase | 状態 |
| -------------------------------------- | ------------------------ | ----- | ---- |
| Playwright `CDPSession` → `ICDPClient` | `@aria-palina/cli`       | 3     | ✅   |
| `chrome.debugger` → `ICDPClient`       | `@aria-palina/extension` | 7     | ⏳   |

---

## ⚙️ CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

- **トリガー**: `main` への push / PR
- **環境**: Ubuntu latest, Node.js 24, pnpm
- **ステップ**: Install → Format check → Lint → Type check → Build → Test
- **concurrency**: 同一 ref のジョブは後勝ちキャンセル

---

## 📝 コミットとブランチ運用

- 作業は機能ブランチで行い、ブランチ名は Claude Code が命名するもの
  (`claude/implement-roadmap-phase-2-PPIWI` 等) をそのまま使う。
- コミットメッセージは `type(scope): short summary` (Conventional Commits 風)。
  例: `feat(core): implement Phase 2 AOM extraction and speech simulator`
- プッシュは `git push -u origin <branch>` で行う。
- **PR は明示的に指示されたときのみ作成する**。

---

## 🔖 フェーズ完了時のチェックリスト

フェーズを終えるとき、以下を必ず満たしてから commit & push する:

- [ ] `vp test` 緑
- [ ] `vp check` 緑 (formatter / linter)
- [ ] `vp run -F './packages/*' build` 緑 (各パッケージの dist 生成)
- [ ] `docs/progress/phase-N.md` (やったこと記録) を新規作成: スコープ / モジュール構成 / 設計判断 / テスト / 公開 API 変更 を記述
- [ ] `docs/plan.md` のフェーズステータスを ✅ に更新し、done record へのリンクを追加
- [ ] 新規ファイル/編集ファイルを過不足なくステージ
- [ ] コミットメッセージにどの Phase を実装したか明記
