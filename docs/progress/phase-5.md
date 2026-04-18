# Phase 5 実装メモ

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

## スコープ

`docs/dd.md` §4 Phase 5 で列挙されている以下を実装した:

- ブラウズモード (矢印キー / DOM 順移動) は Phase 4 で既に実装済み。
- **フォーカスモード (`Tab` / `Shift+Tab`)**: インタラクティブ要素 (ブラウザで focusable かつ disabled でない) のみをジャンプする。
- **クイックジャンプ (`h` / `H` / `D`)**: 見出し (`role="heading"`) とランドマーク (ARIA landmark roles) 間の巡回 (PRD §4.2 / manual.md)。

## モジュール構成

| モジュール | 責務 |
| ---------- | ---- |
| `packages/core/src/node-kind.ts` | `NodeKind` (`interactive` / `heading` / `landmark`) 判定と `findNext(nodes, from, kind, direction)` 純粋関数。ARIA landmark roles は内部の `Set` で定義。 |
| `packages/tui/src/components/App.tsx` | `useInput` 分岐を拡張し `Tab` / `Shift+Tab` / `h` / `H` / `D` を `findNext` に dispatch。該当要素が無い場合は cursor を動かさない。 |

## 設計判断

- **インタラクティブ判定は `A11yNode.isFocusable` を再利用**。Phase 2 で CDP の `focusable` state から既に付与されているため、role ベースの判定リストを増設する必要がない。`state.disabled === true` のみ追加で除外する。
- **ラップアラウンドしない**: `findNext` は末尾 (または先頭) の先に該当が無ければ `-1` を返し、App 側で cursor を維持する。「押すたびにジャンプ」する manual の表現と整合し、無限ループ感を回避。
- **キー規約**: `g`/`G` の小文字=順方向・大文字=逆方向規約に倣い、`h`/`H` も小文字を順方向 (Phase 4 互換の下矢印方向) に採用。PRD は大文字 `H` 単独表記だが、詳細規約は DD / manual で具体化し、manual.md を併せて更新した。
- **Core/TUI 境界**: ARIA 仕様知識は全て core 側に閉じ込め、TUI は `findNext` の戻り値を state に反映するだけ。CLAUDE.md 「アーキテクチャ不変条件」に準拠。

## テスト

- `packages/core/src/__tests__/node-kind.test.ts` — `matchesKind` / `findNext` を純粋関数として入出力比較で網羅 (古典派)。disabled スキップ、空配列、境界 (`-1`) を確認。
- `packages/tui/src/__tests__/app.test.tsx` — `ink-testing-library` で Tab/Shift+Tab/h/H/D の cursor 移動、および該当なし時の静止を状態検証。

## 公開 API 変更

`@aria-palina/core`:

```ts
export { findNext, matchesKind, type NodeKind } from "./node-kind.js";
```

`@aria-palina/tui` には新規 export なし (App の挙動拡張のみ)。

---

# Phase 5.1 ショートカット体系リファクタ (モーダルフィルタ)

Phase 5 完了後に、以下の理由でキーバインド体系を再設計した:

- `H` (Shift+h) / `D` (Shift+d) の「Shift=逆方向」規約が非対称 (landmark の逆方向が未実装だった)。
- 見出し・ランドマーク・インタラクティブが全て**単発ジャンプ**で、「今どの種別を巡回しているか」がユーザーに見えにくかった。スクリーンリーダーの「要素リスト (elements list)」UX に寄せる。

## 新しい体系

| キー | モード | アクション |
| --- | --- | --- |
| `h` | 通常 → フィルタ | 「見出し」フィルタモードに入り次の見出しへ |
| `d` | 通常 → フィルタ | 「ランドマーク」フィルタモードに入り次のランドマークへ |
| `↑` / `↓` / `j` / `k` | フィルタ中 | 絞り込まれたリスト内で 1 件移動 |
| `←` / `→` | フィルタ中 | 種別を巡回 (`heading` → `landmark` → `interactive`) |
| `g` / `G` | フィルタ中 | 絞り込みリストの先頭 / 末尾へ |
| `Esc` | フィルタ中 | フィルタ解除して通常モードに戻る (カーソル位置は維持) |
| `Tab` / `Shift+Tab` | 両モード | 全体ツリーのインタラクティブ要素を巡回 (フィルタ中に押すと自動解除) |

## 実装差分

- **`@aria-palina/core`**: `filterByKind(nodes, kind)` と `cycleKind(current, direction)` の 2 つの純粋ヘルパーを `node-kind.ts` に追加。既存の `matchesKind` / `findNext` をそのまま再利用。
- **`@aria-palina/cli/tui`**: `App.tsx` に `filterKind: NodeKind | null` 状態と、`visibleNodes` / `visibleToFull` / `visibleCursor` の `useMemo` 派生値を導入。`cursor` はフル配列のインデックスを維持するため `Esc` 復元は `setFilterKind(null)` だけで済む。ヘッダーはフィルタ中に `[見出し]` / `[ランドマーク]` / `[インタラクティブ]` の種別ラベルのみを表示する (「フィルタ」の語も位置表記も冗長なので省略)。該当要素が無いときは**フィルタモードに入らない** (`findNext` が `-1` を返した場合の no-op ガード)。
- **UI**: フッターヘルプをモード別に切り替え (`↑/↓ 移動 Tab フォーカス h 見出し d ランドマーク …` ↔ `↑/↓ 移動 ←/→ フィルタ切替 … Esc 解除 …`)。

## テスト

- `packages/core/src/__tests__/node-kind.test.ts` — `filterByKind` (順序保存 / 空配列 / disabled 除外) と `cycleKind` (順・逆方向巡回) の純粋関数テストを追加。
- `packages/cli/src/__tests__/tui-app.test.tsx` — 既存の `H` / 大文字 `D` テストを削除し、`d` (小文字) によるランドマークフィルタ進入、`describe("App filter mode", ...)` に 7 本の新規テスト (絞り込み表示・↑↓ 挙動・←→ 巡回・Esc 解除・g/G・Tab 解除) を追加。全 180 件緑。
