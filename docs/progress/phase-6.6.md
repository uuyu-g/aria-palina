# Phase 6.6 — TUI テキストブラウザビュー (Lynx/w3m 風)

> **Status:** ✅ Done
> **Branch:** `claude/add-text-browser-mode-A75Tz`
> **Related:** [Plan](../plan.md) / Phase 6.5 とは独立した追加モード

## スコープ

`palina --tui` に Lynx / w3m 風の **テキストブラウザビュー** を新設し、
晴眼者がページ構造を俯瞰しやすいリーダブル表示を提供する。Phase 6.5 の
「リーダブルビュー (中間表現 + reader/raw 切替)」とは独立したフェーズで、
中間表現 (`buildReaderView` 等) は導入していない。`@aria-palina/core` の
出力形式 (`buildSpeechText` / `A11yNode` / `flattenAXTree`) は一切変更
しないため、CLI ワンショット出力 (stdout) と JSON 出力には影響しない。

確定方針 (ユーザーから取得済み):

- 位置づけ: Phase 6.5 とは別の追加モード。
- 出力スタイル: Lynx / w3m 風 (ASCII 罫線 + リンク番号付き)。
- 適用範囲: TUI モードのみ。

## モジュール構成

新規追加 (すべて `packages/cli/src/tui/textbrowser/` 配下に閉じ込め):

| モジュール                                        | 責務                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `tui/textbrowser/types.ts`                        | `TextBrowserLine` / `RenderSegment` / `TextBrowserModel` 型定義    |
| `tui/textbrowser/build.ts`                        | `buildTextBrowserLines(nodes)` — 純粋な変換関数                   |
| `tui/textbrowser/format.ts`                       | ランドマーク罫線・見出し記号・リンクラベル等の文字列ヘルパー      |
| `tui/textbrowser/table.ts`                        | テーブル ASCII 罫線 (`+---+`, `| a | b |`) 組み立て + 表示幅算出  |
| `tui/components/TextBrowserList.tsx`              | `computeWindow` を使う仮想リスト (raw 用 `VirtualList` と並列)    |
| `tui/components/TextBrowserRow.tsx`               | 行 1 つの Ink 描画 (`React.memo`)                                 |

編集:

- `cli/src/args.ts` — `--view=raw|textbrowser` フラグ追加 (デフォルト `textbrowser`)
- `cli/src/tui/keybindings.ts` — `t` キー (`toggleViewMode`) を `NORMAL_BINDINGS` に追加
- `cli/src/tui/components/App.tsx` — `viewMode` state、`<TextBrowserList />` 切替、フッターに `t ビュー` 追記
- `cli/src/tui/run.ts` — `TuiArgs.view` 追加、`App` への `initialViewMode` 受け渡し
- `cli/src/tui/index.ts` — `TextBrowserList` / `TextBrowserRow` / `buildTextBrowserLines` / 関連型を public export

## 設計判断

### 行モデルとカーソル

`A11yNode[]` を入力に、`TextBrowserLine[]` への純粋変換を行う。`TextBrowserModel`
は `lines` / `nodeToLine` / `lineToNode` / `links` の整合した 4 フィールドを返す。

カーソル位置の単位は **元 `nodes` インデックスのまま** とした (シンプル化のため)。
描画時に `nodeToLine[cursor]` を `TextBrowserList` の line cursor として渡す。
これにより既存の `j`/`k` / `Tab` / `h` (見出し) / `d` (ランドマーク) / `Enter` /
`Space` キーバインドおよび live 更新の backendNodeId 復元ロジックがそのまま動く。
1 ノードが複数行を生むテーブル系の中途行 (table-border 等) には直接カーソルを
合わせられないが、初期実装としては最低限の操作性を確保している。

### リンク番号付与

`buildTextBrowserLines` 内で 1 パス走査し、`role === "link"` ノードと
`inlineSegments[i].role === "link"` を **出現順に通し番号 (1-origin)** で採番する。
番号は `RenderSegment` / 行モデル / `TextBrowserModel.links` サイドテーブルへ
重複格納し、将来「番号入力でフォーカス」拡張のための足場を残した。

### キーバインド

`t` を採用。確認済みの現状 `NORMAL_BINDINGS` (`j`/`k`/`g`/`G`/`h`/`d`/`r`/`R`/
`L`/`return`/`space` + `Tab`/`q`/Ctrl-C は `App.tsx` 直処理) と衝突しない。
`T` (大文字) は将来用に予約。

### デフォルトビュー

`AppProps.initialViewMode` のデフォルトは `raw` (既存 App テストとの互換性
のため)。CLI 経由 (`runTui`) で起動した場合は `args.view ?? "textbrowser"`
が渡され、ユーザー体験としては **textbrowser がデフォルト** になる。

### テーブル

`@aria-palina/core` の `enrichTableContext` が cell ノードに付与する
`tableRowIndex` / `tableColIndex` / `tableColCount` プロパティを使い、
`+---+---+` / `| Name | Age |` 形式の ASCII 罫線で囲んだ表を生成する。
列幅は東アジア文字 (CJK) を 2 幅とみなす素朴な実装で算出する
(`tui/textbrowser/table.ts` の `displayWidth`)。完全な East Asian Width
判定はしていない。

## テスト

新規 (古典派 / 日本語 test 名 / `vite-plus/test`):

- `cli/src/__tests__/tui-textbrowser-build.test.ts` — `buildTextBrowserLines` 純粋関数 (10 ケース)
  - ランドマーク開閉、入れ子、heading level、単独 link 採番、インライン link 採番、
    button / form-control、listitem、table の罫線並び順、`nodeToLine` ↔ `lineToNode`
    双方向整合、不明ロールのフォールバック
- `cli/src/__tests__/tui-textbrowser-render.test.tsx` — Ink 描画 (5 ケース)
  - ランドマーク罫線、リンク番号、見出し `#` 記号、テーブル ASCII、空ノード
- `cli/src/__tests__/tui-app.test.tsx` 拡張 — `initialViewMode=textbrowser` 起動 / `t` キートグル (2 ケース)
- `cli/src/__tests__/args.test.ts` 拡張 — `--view` デフォルト / `raw` / 不正値 (3 ケース)
- 既存 `tui-app.test.tsx` の「URL と format のデフォルト値」を `view: "textbrowser"` を含む形に更新

最終結果:

- `vp test`: 24 files / **318 tests passed**
- `vp check`: format / lint クリーン
- `vp run -F './packages/*' build`: 2 パッケージ (core / cli) 緑

## 公開 API 変更

`@aria-palina/cli/tui` (`packages/cli/src/tui/index.ts`) から以下を新規 export:

```ts
export { TextBrowserList, type TextBrowserListProps } from "./components/TextBrowserList.js";
export { TextBrowserRow, type TextBrowserRowProps } from "./components/TextBrowserRow.js";
export { buildTextBrowserLines } from "./textbrowser/build.js";
export type {
  RenderSegment,
  TextBrowserLine,
  TextBrowserLink,
  TextBrowserModel,
} from "./textbrowser/types.js";
```

`AppProps` に `initialViewMode?: "raw" | "textbrowser"` (デフォルト `raw`) を追加。
`TuiArgs` に `view?: "raw" | "textbrowser"` (デフォルト `textbrowser`) を追加。
`CliArgs.view: "raw" | "textbrowser"` を必須フィールドとして追加。

## 出力フォーマット変更 (TUI 描画) — Before / After

`@aria-palina/core` の出力 (`buildSpeechText` / `A11yNode`) は変更していない
ため、core/CLAUDE.md の「ビフォー/アフター例」ルールには非該当。一方で
`@aria-palina/cli` の TUI 描画は変わるので、サンプル入力に対する描画の
**Before / After** を以下に並べる。

入力 HTML 概要:

```html
<header>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
</header>
<main>
  <h1>Welcome</h1>
  <p>Hello <a href="/help">help</a> world.</p>
  <ul><li>foo</li><li>bar</li></ul>
  <form><input type="text" name="q"><button>送信</button></form>
</main>
```

Before (raw / 従来表示):

```
[banner]
  [navigation]
    [link] Home
    [link] About
[main]
  [heading1] Welcome
  [paragraph] Hello help world.
  [list]
    [listitem] foo
    [listitem] bar
  [form]
    [textbox] q
    [button] 送信
```

After (textbrowser / 新表示):

```
── banner ──
── navigation ──
  [1]Home  [2]About
── /navigation ──
── /banner ──
── main ──
# Welcome
Hello [3]help world.
- foo
- bar
[textbox: q]
[Button: 送信]
── /main ──
```

テーブル例 (`<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>`):

Before (raw):

```
[table 2行×2列]
  [row]
    [columnheader 1/2] Name
    [columnheader 2/2] Age
  [row]
    [cell 1/2, Name] Alice
    [cell 2/2, Age] 30
```

After (textbrowser):

```
+-------+-------+
| Name  | Age   |
+-------+-------+
| Alice | 30    |
+-------+-------+
```

## 将来の拡張余地

- リンク番号入力でジャンプ (`TextBrowserModel.links` のサイドテーブルが既に揃っている)
- East Asian Width の正確判定 (現状は素朴実装)
- Phase 6.5 (`buildReaderView` 中間表現) との統合: 中間表現が入った時点で
  textbrowser モードを `Renderer` インターフェースの 1 実装として再構成可能
- カーソルを line インデックス軸へ切り替え、テーブル中途行 (border 行等) も
  選択できるようにする
