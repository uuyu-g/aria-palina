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
