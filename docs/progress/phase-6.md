# Phase 6 実装メモ

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

## スコープ

`docs/dd.md` §4 Phase 6 で列挙されている以下を実装した:

- TUI モードで `--headed` が指定された場合、CDP `Overlay` ドメインを通じて
  カーソル位置の DOM ノードをブラウザ画面上で青い網掛けハイライトする
  「TUI → ブラウザ」ハイライト同期。
- 実行時のライフサイクル管理 (`Overlay.enable` 起動時、`hideHighlight` +
  `Overlay.disable` 終了時)。

ロードマップは TUI → ブラウザの片方向同期のみを対象とし、
逆方向 (ブラウザ側操作 → TUI 側カーソル) はスコープ外とする。

## モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/core/src/highlight.ts` | `enableOverlay` / `disableOverlay` / `highlightNode` / `clearHighlight` の薄いラッパー。`backendNodeId === 0` のときは `highlightNode` を no-op として握りつぶす。 |
| `packages/cli/src/tui/use-highlight.ts` | `useHighlight(controller, backendNodeId, options?)` フック。`backendNodeId` 変更を debounce (既定 50ms) してから `controller.highlight()` を呼び、アンマウント時に `controller.clear()` を呼ぶ。`controller === null` のときは完全 no-op。 |
| `packages/cli/src/tui/components/App.tsx` | `highlightController?: HighlightController \| null` prop を受け取り、`useHighlight` でカーソル変更を監視。フィルタモード中も同じ `cursor` (フル配列) の `backendNodeId` を渡す。 |
| `packages/cli/src/tui/run.ts` | `args.headed === true` のときのみ `adaptCDPSession(session)` を `enableOverlay` し、`HighlightController` を構築して App に渡す。`waitUntilExit()` 後に `clearHighlight` + `disableOverlay` を握りつぶしながら呼ぶ。 |

## 設計判断

- **TUI → ブラウザの片方向のみ**: 逆方向 (ブラウザ上のクリックや DOM 変化を
  TUI カーソルへ反映) はロードマップから除外した。実装コストに対して UX 価値が
  低く、Phase 7 Chrome Extension でも同様の要件は生じない見込み。
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

## テスト

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

## 公開 API 変更

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
