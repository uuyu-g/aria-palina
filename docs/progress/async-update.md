# Done Record — 非同期画面更新への追従 (Async Update)

> **Scope:** 横断改善 (cross-cutting)
> **Related:** [usecases §2.2](../usecases.md), [plan.md](../plan.md)

## 背景

`aria-palina` は従来、ページ読み込み直後に 1 回だけ AX ツリーを抽出する設計だった。
`waitForNetworkIdle` で初期ネットワークの静穏化は待てたが、以下のシナリオで
ツリーが実際の画面と乖離する問題があった:

- SPA ルーティング後の再描画 (`domcontentloaded` より遅い)
- モーダル / Drawer の遅延展開
- `setTimeout` / `requestIdleCallback` による遅延レンダ
- `aria-live` リージョンのテキスト更新
- TUI 起動後の画面変化 (再取得手段がそもそも存在しなかった)

`docs/usecases.md` §2.2「SPA 遷移の沈黙」で挙げられていた欠落を、NVDA の
「仮想バッファ自動更新」「aria-live 読み上げ」体験に寄せて埋める横断改善。

## スコープ

1. 初期取得時の待機戦略拡張 (ワンショット CLI / TUI 共通)
2. TUI のライブ更新 (既定 ON) + 手動 refresh UX
3. aria-live リージョンの差分検出と通知 (NVDA 相当)

## モジュール構成

### `@aria-palina/core` 新規モジュール

| モジュール | 責務 |
| --- | --- |
| `src/wait-for-ax-stable.ts` | `waitForAXStable(cdp, opts)` — AX ツリーを N ms 間隔でポーリングし、フィンガープリント (`nodeId:role:ignored` 列) が K 回連続で一致したら resolve |
| `src/subscribe-ax-updates.ts` | `subscribeAXTreeUpdates(cdp, onUpdate, opts)` — `DOM.documentUpdated` / `Page.frameNavigated` / `Page.lifecycleEvent` を購読し、デバウンス後に `extractA11yTree` を呼んで通知する |
| `src/aria-live-diff.ts` | `diffLiveRegions(before, after)` — 2 スナップショットから live 相当領域の差分を抽出 (role=status/alert/log/marquee/timer または `properties.live`) |
| `src/wait-conditions.ts` | `waitForSelector` / `waitForFunction` / `delay` — `Runtime.evaluate` を使った汎用ポーリング |

### `@aria-palina/core` 既存モジュールの変更

- `src/flatten.ts`: `STRUCTURAL_PROPERTY_KEYS` に `live` / `atomic` / `relevant` を追加。
  明示的な `aria-live="polite"` 属性を持つ素の `<div>` が `properties.live` 経由で
  `diffLiveRegions` に届くようにする。speech 出力には影響しない。

### `@aria-palina/cli`

- `src/args.ts`: 新フラグ追加。
  - `--wait-for-selector <css>` / `--wait-for-function <js>` / `--delay <ms>`: 初期
    ネットワークアイドル後の追加待機戦略。CLI/TUI 共通。
  - `--no-live`: TUI のライブ更新を無効化。既定は ON。
- `src/run.ts`: 上記フラグを `waitForSelector` / `waitForFunction` / `delay` に
  ディスパッチ。適用順は `network-idle → selector → function → delay → extract`。
- `src/tui/run.ts`: `LiveBridge` を新規に構築。初期抽出後に
  `subscribeAXTreeUpdates` で DOM/Page イベントを購読し、更新を `App` へ流す。
  `r` キーは `refresh()`、`L` キーは `toggleLive()` に対応。
- `src/tui/components/App.tsx`: `liveBridge` prop を追加。`useState` で
  `nodes` を保持し、購読リスナで差し替え。カーソル位置は `backendNodeId` 一致で
  保存復元。live 変化はステータスバーに `♪` (polite) / `!` (assertive) 付きで表示。

## 設計判断

### CDP イベント購読戦略

購読対象は 3 種のみに絞った:

- `DOM.documentUpdated` — 文書全体の再構築 (SPA 遷移で主に発火)
- `Page.frameNavigated` (main frame のみ) — pushState / history API 追従
- `Page.lifecycleEvent` (`load` / `networkIdle`) — 追加のライフサイクル

`DOM.childNodeInserted/Removed` は高頻度かつノイズが大きいため意図的に除外。
細粒度変更を拾いたい場合はユーザーに `r` キーの手動再取得を提供する。

### フィンガープリント設計 (waitForAXStable)

`getFullAXTree` 全体を JSON シリアライズするのはコストが高いため、
`nodeId + role + ignored` のタプルだけを連結した文字列で代用。AX ツリーの
「形」の変化を検出するには十分かつ軽量。

### カーソル保存復元

TUI の更新ハンドラでは、現在カーソルが指しているノードの `backendNodeId` を
新スナップショットで探し、見つかれば該当インデックスに追従、見つからなければ
先頭に戻す。backendNodeId は Chrome の DOM ノードと一意対応するため、SPA の
部分再構築でも同じ要素を追える。

### ライブ既定 ON の負荷

購読対象は 3 種のみ、抽出は 200ms デバウンス、単一実行ロック (進行中の抽出が
終わってから次を実行) で CPU/IO 負荷を抑制。想定される常時負荷は軽微。

### aria-live の politeness 解決順序

1. `properties.live` が "polite" / "assertive" / "off" ならそれを採用
2. 否なら role ベースの暗黙マッピング (`status` → polite、`alert` → assertive 等)
3. どちらにも該当しなければ live 領域ではないと判定

### flatten.ts への最小限の手入れ

`live` / `atomic` / `relevant` を `STRUCTURAL_PROPERTY_KEYS` に追加するのみ。
speech 出力ロジック (`speech.ts`) は既存の `level` / `valuetext` 等しか
参照しないため、読み上げ文字列には影響しない。JSON 出力には含まれるようになる
が、これは意図した副作用 (デバッグ可視性の向上)。

## テスト

### 新規テストファイル

- `packages/core/src/__tests__/wait-for-ax-stable.test.ts` — 4 ケース (安定検出 / 差分リセット / timeout / 静的ツリー)
- `packages/core/src/__tests__/subscribe-ax-updates.test.ts` — 7 ケース (enable 発行 / debounce / frame フィルタ / lifecycle フィルタ / manual refresh / unsubscribe)
- `packages/core/src/__tests__/aria-live-diff.test.ts` — 10 ケース (role 暗黙 / properties.live 明示 / text 変更 / removed / backendNodeId=0 スキップ 等)
- `packages/core/src/__tests__/wait-conditions.test.ts` — 5 ケース (selector / function / delay)

### 既存テストの更新

- `packages/cli/src/__tests__/args.test.ts` — 新フラグのデフォルト値・パース・エラー (6 ケース追加)
- `packages/cli/src/__tests__/tui-run.test.ts` — headless 時の live 既定 ON で DOM.enable / Page.enable が発行されることを確認する新ケース + `--no-live` 明示のケースに書き換え
- `packages/cli/src/__tests__/tui-app.test.tsx` — 5 ケース追加 (bridge 購読で nodes 差し替え / backendNodeId 追従 / `r` / `L` / assertive 通知表示)

全 249 テスト (Core 131 / CLI 118) 緑。

## 公開 API 変更

### `@aria-palina/core`

- 追加: `waitForAXStable`, `AXStableOptions`
- 追加: `subscribeAXTreeUpdates`, `AXUpdateCause`, `AXUpdateOptions`, `AXUpdateSubscription`
- 追加: `diffLiveRegions`, `LiveChange`, `LiveChangeKind`, `LivePoliteness`
- 追加: `waitForSelector`, `waitForFunction`, `delay`, `WaitConditionOptions`
- 変更なし: 既存 API (`extractA11yTree`, `flattenAXTree`, `buildSpeechText`, etc.)

### `@aria-palina/cli`

- `CliArgs` に `waitForSelector`, `waitForFunction`, `delay`, `live` を追加 (既存フィールドは不変)
- 新フラグ: `--wait-for-selector <css>` / `--wait-for-function <js>` / `--delay <ms>` / `--no-live` (対応する `--live` は明示有効化用)

### `@aria-palina/cli/tui`

- `TuiArgs` に `waitForSelector?`, `waitForFunction?`, `delay?`, `live?` を追加
- 追加 export: `LiveBridge`, `LiveUpdate`
- `App` (`AppProps`) に `liveBridge?` prop を追加 (未指定なら従来通り静的 nodes 表示)
- 新規キーバインド: `r` / `R` (手動再取得), `L` (ライブトグル)

## 未対応 / 先送り

- Chrome Extension (`@aria-palina/extension`) 側での live 対応は Phase 7 本実装時に合わせる
- NVDA のブラウズモード/フォーカスモード切替相当の UX は別途検討
- フォーカス追従 (`Page.focusChanged` 購読) は今回のスコープ外。`backendNodeId`
  カーソル追従だけを先に入れたので、DOM 側のフォーカスイベント同期は次イテレーション
