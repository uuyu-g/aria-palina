# Phase 6.5 実装メモ — リーダブルビュー (中間表現 + レンダラー切替)

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

## スコープ

`docs/plan.md` の Phase 6.5 要件に沿って、「スクリーンリーダーで世界がどう
見えているか」を晴眼者が俯瞰しやすいビューを導入した:

- `@aria-palina/core` に **ビュー中間表現** `ReaderSection` / `ReaderItem`
  と純粋関数 `buildReaderView(nodes)` を追加。
- CLI / TUI に **組み込みレンダラー切替** `reader` (新デフォルト) / `raw` を
  追加し、`--view <mode>` フラグで選択可能にした。
- TUI のランドマーク区切りは **罫線** (`── main「記事」 ──` 等) として
  `ReaderList` コンポーネントで描画。
- 既存キーバインド (`h` / `d` / Tab など) は cursor 管理を `A11yNode` 配列
  インデックスで保ったまま再利用でき、リーダブルビューでも自然に機能する。

## モジュール構成

### `@aria-palina/core`

| モジュール | 責務 |
| ---------- | ---- |
| `src/reader-view.ts` | `ReaderSection` / `ReaderItem` 型、`buildReaderView(nodes)` 純粋関数 |

### `@aria-palina/cli`

| モジュール | 責務 |
| ---------- | ---- |
| `src/args.ts` | `CliArgs.view` の追加、`--view reader\|raw` フラグ解析 |
| `src/formatter.ts` | `formatReaderTextOutput(nodes, opts)` を追加。既存 `formatTextOutput` は `raw` として維持 |
| `src/run.ts` | `args.view` で `formatReaderTextOutput` / `formatTextOutput` を分岐 |
| `src/tui/reader-rows.ts` | `toReaderRows(nodes)` — `ReaderSection[]` を separator/node 混在のフラット行に展開する純粋関数 |
| `src/tui/components/ReaderList.tsx` | ランドマーク罫線と rebased-depth 付き NodeRow を仮想スクロールで描画 |
| `src/tui/components/App.tsx` | `view?: "reader" \| "raw"` prop を追加し `ReaderList` / `VirtualList` を分岐 |
| `src/tui/run.ts` | `TuiArgs.view` を App に伝搬 |

## 設計判断

- **中間表現を Core に置く**: Chrome Extension (Phase 7) でも同一のビュー
  ロジックを再利用することを前提に、`buildReaderView` は純粋関数として Core
  に置いた。Ink/React/DOM など環境固有の依存を持ち込んでいない。
- **セクションはフラット**: ネストしたランドマーク (`<main><nav>...</nav></main>`)
  は隣接セクションとして扱う。nav を抜けて外側の main 内容が再出現した場合は、
  外側へ戻る検出 (`node.depth <= landmark.depth`) をトリガに、無名セクション
  (`landmark: null`) を開いて残りを積む。実サイトでの入れ子は稀で、スタック
  追跡より単純化優先。
- **Cursor は A11yNode インデックス**: TUI の cursor 管理は既存の VirtualList と
  同じく `A11yNode[]` 上のインデックスに統一。separator 行は cursor 対象外で、
  `toReaderRows` が返す `nodeIndexToRow` で row インデックスへ変換して windowing
  する。これにより `h` / `d` / Tab / PageDown 等の既存キーバインドは無改修で
  reader / raw の両ビューに適用可能。
- **折り畳みロールは `none` / `presentation` のみ**: 名前なしの `generic` は
  既に `flattenAXTree` が透過処理している。重複ロジックを避けるため、Phase 6.5
  では追加で `none` / `presentation` のみ除外する。ユーザー設定可能な
  折り畳みロールリストは将来フェーズで検討 (plan.md スコープ外に明記)。
- **JSON 出力はビュー非依存**: `--format json` は常に `A11yNode[]` をそのまま
  出力する。機械可読フォーマットとしては平坦配列の方が使いやすいため、
  `view` と直交させた。
- **`formatReaderTextOutput` は `formatTextOutput` を補完する別関数**: 既存
  `formatTextOutput` の振る舞い (raw モード) は完全に保存し、reader モードを
  新関数として追加。外部から両方を import できるよう `formatter.ts` から
  個別 export する。
- **ランドマーク罫線のカラー**: CLI の `colorizeByRole` / TUI の
  `roleTextStyle` にすでに `main` / `navigation` 等のスタイルが定義済みなので
  separator も同じロールスタイルで着色する (`main` は bold + blue)。
- **ラベル書式 `role「name」`**: ランドマークに name が付く場合 (`<main
  aria-label="記事">`) は `main「記事」` と鉤括弧で連結する。NVDA の読み上げ
  フォーマットに近い日本語圏での馴染みを優先。

## テスト

**`@aria-palina/core`**:

- `src/__tests__/reader-view.test.ts` — 10 テスト。
  - ランドマーク未出現時の暗黙セクション
  - 複数ランドマーク分割
  - depth 再採番
  - `none` / `presentation` の除外
  - name 付き/空白ラベルの扱い
  - ネストしたランドマーク (無名セクションへのフォールバック)
  - 空配列・アイテム 0 件セクション
  - `ReaderItem.node` の参照 identity 保持

**`@aria-palina/cli`**:

- `src/__tests__/formatter.test.ts` — `formatReaderTextOutput` の describe を
  追加。罫線挿入・depth 再採番・名前付きラベル・ランドマーク無しのフォールバック・
  color:true での ANSI 付与を網羅。
- `src/__tests__/args.test.ts` — `--view` のデフォルト (reader) / 明示指定
  (raw) / 不正値エラーの 3 本を追加。
- `src/__tests__/run.test.ts` — runCli 経由で reader / raw / 不正値の 3 本
  (ランドマーク罫線挿入・raw の平坦出力・invalid エラー)。
- `src/__tests__/tui-reader-list.test.tsx` — `toReaderRows` (separator 挿入 /
  `nodeIndexToRow` / depth 再採番) と `ReaderList` コンポーネント (罫線 /
  cursor 反転 / separator 無しフォールバック / 0 件メッセージ / viewport 制約) を網羅。
- `src/__tests__/tui-app.test.tsx` — App の `view='reader'` 既定と `view='raw'`
  指定時の描画差分を検証する 2 テストを追加。
- `src/__tests__/tui-run.test.ts` — `args.view` が App props として伝搬する
  (既定 reader / 明示 raw) ことを検証する 2 テストを追加。

## 公開 API 変更

`@aria-palina/core`:

```ts
export {
  buildReaderView,
  type ReaderItem,
  type ReaderSection,
} from "./reader-view.js";
```

`@aria-palina/cli`:

```ts
// formatter.ts
export { formatReaderTextOutput } from "./formatter.js";
// args.ts
export interface CliArgs {
  // ...
  view: "reader" | "raw";
}
```

`@aria-palina/cli/tui`:

```ts
export { ReaderList, type ReaderListProps } from "./components/ReaderList.js";
export { toReaderRows, type ReaderRow, type ReaderRowsResult } from "./reader-rows.js";
// TuiArgs に view?: "reader" | "raw" を追加
// AppProps に view?: "reader" | "raw" を追加
```

## 残課題 / 将来検討

plan.md の Phase 6.5 スコープ外に明記されている通り、以下は後続フェーズで
検討する:

- `Renderer` インターフェースを公開しての**外部プラグイン化** (案 3 相当)。
  中間表現 `ReaderSection` があるため、後から `Renderer` I/F をラップするだけ
  で拡張可能な状態になっている。
- ユーザー設定可能な折り畳みロールリスト (`--collapse-roles=...` 等)。
