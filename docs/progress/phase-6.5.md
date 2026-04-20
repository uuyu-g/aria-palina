# Phase 6.5 実装メモ — リーダブルビュー (ランドマーク罫線化)

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

## スコープ

`docs/plan.md` の Phase 6.5 要件のうち、最終的に採用したのは以下の最小変換:

- **ランドマーク行を `── label ──` の罫線表現に置き換える**
  (例: `[main] 記事` → `── main「記事」 ──`)
- **ベース depth を引いてインデントを正規化**
  (RootWebArea などの無意味な親が消費するインデントを詰める)
- **CLI / TUI に `--view reader\|raw` フラグを追加** (既定: reader)
- 既存キーバインド (`h` / `d` / Tab など) は cursor 管理を `A11yNode` 配列
  インデックスで保ったまま無改修で機能する。`j`/`k` で自然にランドマーク行に
  も乗れ、反転表示で選択強調される。

当初は「ビュー中間表現 `ReaderSection` / `ReaderItem`」を導入する案だったが、
視覚的な最終形が「罫線行への置換 + depth 正規化」に収束したため、IR を抱える
コストと釣り合わず**削除**した。Phase 7 Chrome Extension で構造化された
IR が必要になったら、そのとき設計する (YAGNI)。

## モジュール構成

### `@aria-palina/core`

| モジュール | 責務 |
| ---------- | ---- |
| `src/reader-view.ts` | `LANDMARK_ROLES` 定数 / `readerSectionLabel(node)` / `readerBaseDepth(nodes)` の 3 つの純粋関数のみ |

### `@aria-palina/cli`

| モジュール | 責務 |
| ---------- | ---- |
| `src/args.ts` | `CliArgs.view` の追加、`--view reader\|raw` フラグ解析 |
| `src/formatter.ts` | `formatReaderTextOutput(nodes, opts)` を追加。既存 `formatTextOutput` は `raw` として維持 |
| `src/run.ts` | `args.view` で `formatReaderTextOutput` / `formatTextOutput` を分岐 |
| `src/tui/components/ReaderList.tsx` | ランドマーク行を罫線として描画する仮想スクロールリスト (`VirtualList` のランドマーク対応版) |
| `src/tui/components/App.tsx` | `view?: "reader" \| "raw"` prop を追加し `ReaderList` / `VirtualList` を分岐 |
| `src/tui/run.ts` | `TuiArgs.view` を App に伝搬 |

## 設計判断

- **中間表現を持たない**: ランドマーク行を罫線に置き換えるだけの軽量変換
  なので、`ReaderSection[]` のような IR は構築しない。`A11yNode[]` を
  そのまま走査し、ランドマークかどうかで分岐するだけ。継続セクションや
  スタック管理といった概念も不要 (ドキュメント順がそのまま維持される)。
- **depth 正規化は `readerBaseDepth` 1 関数で**: 全ノードの最小 depth を
  求めて各ノードから引くだけ。RootWebArea が depth=0 を消費する問題が
  解消され、トップレベルランドマークがインデント 0 で描画される。
- **cursor は A11yNode 配列インデックスのまま**: reader 固有の row 変換
  (`nodeIndexToRow` マップ) を廃止。ReaderList は受け取った cursor を
  そのまま windowing に渡すだけ。ランドマーク行への選択強調は
  「その A11yNode インデックスの位置にある行」として自然に実現される。
- **`formatReaderTextOutput` は `formatTextOutput` を補完する別関数**: 既存
  `formatTextOutput` の振る舞い (raw モード) は完全に保存し、reader モードを
  新関数として追加。外部から両方を import できるよう `formatter.ts` から
  個別 export する。
- **罫線・ラベルのカラー**: CLI の `colorizeByRole` / TUI の `roleTextStyle`
  にすでに `main` / `navigation` 等のスタイルが定義済みなので、罫線行も
  同じロールスタイルで着色する (`main` は bold + blue)。
- **ラベル書式 `role「name」`**: ランドマークに name が付く場合 (`<main
  aria-label="記事">`) は `main「記事」` と鉤括弧で連結する。NVDA の読み上げ
  フォーマットに近い日本語圏での馴染みを優先。
- **ネストランドマーク・インライン配置**: DOM 順がそのまま維持されるので、
  `<main>...<nav>...</nav>...</main>` のように外側ランドマークの途中に内側が
  挟まるケースでも元の位置関係が崩れない。継続セクションのような特殊処理は
  不要で、罫線の入れ子は自然な depth インデントで表現される。

## テスト

**`@aria-palina/core`**:

- `src/__tests__/reader-view.test.ts` — 7 テスト。
  - `LANDMARK_ROLES` に ARIA 1.2 の 8 種が含まれる
  - `readerSectionLabel` の空 name / 通常 / 空白のみ 3 ケース
  - `readerBaseDepth` の空配列 / 通常 / シフトが必要なケース 3 ケース

**`@aria-palina/cli`**:

- `src/__tests__/formatter.test.ts` — `formatReaderTextOutput` の describe を
  追加。罫線挿入・indent:true のインデント・ネスト段数インデント・名前付き
  ラベル・ランドマーク無しのフォールバック・インライン入れ子での DOM 順維持・
  color:true での ANSI 付与を網羅。
- `src/__tests__/args.test.ts` — `--view` のデフォルト (reader) / 明示指定
  (raw) / 不正値エラーの 3 本。
- `src/__tests__/run.test.ts` — runCli 経由で reader / raw / 不正値の 3 本。
- `src/__tests__/tui-reader-list.test.tsx` — `ReaderList` コンポーネント
  (罫線描画 / 通常ノード選択 / ランドマーク選択 / ランドマーク無し /
  depth 正規化 / インライン入れ子 / viewport 制約) を網羅。
- `src/__tests__/tui-app.test.tsx` — App の `view='reader'` 既定と
  `view='raw'` 指定時の描画差分を検証する 2 テスト。
- `src/__tests__/tui-run.test.ts` — `args.view` が App props として伝搬する
  (既定 reader / 明示 raw) ことを検証する 2 テスト。

## 公開 API 変更

`@aria-palina/core`:

```ts
export {
  LANDMARK_ROLES,
  readerSectionLabel,
  readerBaseDepth,
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
// TuiArgs に view?: "reader" | "raw" を追加
// AppProps に view?: "reader" | "raw" を追加
```

## 残課題 / 将来検討

plan.md の Phase 6.5 スコープ外に明記されている通り、以下は後続フェーズで
検討する:

- `Renderer` インターフェースを公開しての**外部プラグイン化**。
  ただし現状は IR を持たないため、Phase 7 で本当に必要になってから
  (Chrome Extension の実装と並行で) 設計する。
- ユーザー設定可能な折り畳みロールリスト (`--collapse-roles=...` 等)。
- 深いランドマーク入れ子の視覚強化 (ネストの境界をより明確にする装飾)。
  現状は depth の 2 スペースインデントだけで表現しているため、超深い
  入れ子 (ARIA アンチパターン) だと視認性が落ちる可能性がある。
