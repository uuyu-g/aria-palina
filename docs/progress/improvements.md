# Core / 出力系の継続的改善

> やったこと記録。フェーズ境界をまたぐ細粒度の改善をまとめる。
> [← DD §4 Roadmap](../dd.md) / [plan.md](../plan.md)

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

## Headed モードでブラウザ側もカーソルに追従してスクロール

Phase 6 で実装した「TUI カーソル → ブラウザ Overlay ハイライト」の同期において、
ハイライト対象ノードがビューポート外にあるとユーザーにはハイライトが見えず
同期が機能していないように見えるケースがあった。TUI 側で `j`/`k` を連打して
画面下方のノードへ移動したときに、ブラウザ側が自動でスクロールしなかったため。

解消策として `HighlightController.highlight()` の内部で
`DOM.scrollIntoViewIfNeeded` を並行発行するようにした。

- `packages/core/src/highlight.ts` に `scrollIntoView(cdp, backendNodeId)` を追加。
  `backendNodeId === 0` は `highlightNode` と同じく no-op。
  既に可視範囲にある要素は CDP 実装側が no-op として扱うため、毎フレーム呼び出しても
  コストは小さい (別途アプリ側での debounce は `useHighlight` に既にある)。
- `packages/cli/src/tui/run.ts` の `createHighlightController` で
  `highlight()` 呼び出し時に `highlightNode` と `scrollIntoView` を両方
  fire-and-forget 発行する。エラーは既存の `onFirstError` パイプラインに流して
  TUI 描画は壊さない。
- 核心の不変条件 (headless では Overlay / DOM 系コマンドを一切発行しない) は
  維持。`highlightController = null` のパスは変わらないため headless テストは
  そのまま緑。

## 永続ブラウザコンテキスト (CLI / TUI)

`--headed` でブラウザを立ち上げるたびにログイン状態や Cookie が失われるため、
認証が必要なページの検証で毎回サインインし直す必要があった。Playwright の
`chromium.launchPersistentContext(userDataDir, ...)` を既定で使うようにして、
ブラウザの状態を次回起動時まで引き継げるようにした。

**ポリシー: 既定オン・オプトアウト**

- デフォルト: `~/.palina/profile` を `userDataDir` として永続コンテキストで起動。
  ディレクトリは Playwright が自動生成する。
- `--user-data-dir <path>` で保存先を任意のディレクトリに差し替え可能
  (プロジェクトごとに分離するユースケース)。
- `--no-persist` で従来の挙動 (`launch` + `newContext`) に戻せる。CI や
  プロファイル汚染を避けたいテストで使う。

**実装メモ:**

- `CliArgs` / `TuiArgs` に `persist: boolean` と `userDataDir: string | undefined`
  を追加。`parseCliArgs` のデフォルトは `persist: true`, `userDataDir: undefined`
  (factory 側で既定パスを解決) とし、tri-state は導入しない。
- `BrowserFactory` の引数に `BrowserFactoryOptions` (`headed` / `persist` /
  `userDataDir`) を新設。`defaultBrowserFactory` は `persist` で
  `launchPersistentContext` と `launch` + `newContext` を分岐する。`close()`
  は前者は `context.close()`, 後者は `browser.close()` で Playwright の
  ライフサイクルに合わせる。
- 既定パス `~/.palina/profile` は `run.ts` / `tui/run.ts` の両方で
  `defaultUserDataDir()` として定義。ユーザーが factory を差し替える際の
  オプション型参照のため `BrowserFactoryOptions` と `defaultUserDataDir` を
  `@aria-palina/cli` / `@aria-palina/cli/tui` から export している。
- headless + 永続化の組み合わせも素直に動作する (認証済みスナップショットを
  CI が再利用するユースケース)。`--headed` との直交性は保った。
