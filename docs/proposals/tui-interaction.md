# 📝 提案: TUI インタラクション機能 (NVDA ライクな操作性)

> **Status:** Proposal (未承認)
> **Last Updated:** 2026-04-18
> **Related:** [PRD §4.2](../prd.md) / [DD §4](../dd.md) / [Plan](../plan.md)

## 1. 背景と課題

現行 TUI (`palina --tui`) はアクセシビリティツリーを **読み取る** UI に閉じて
おり、ブラウザに対するアクション (クリック、フォーム入力、チェックボックス
トグル等) を TUI 側から行うことができない。

一方で、プロダクトビジョンである
「ターミナル版 NVDA」「究極のアクセシビリティ開発環境」(PRD §1.2) を体現
するには、NVDA 実機の体験に倣い **カーソル下の要素を操作できる** ことが
不可欠である。特に以下のユースケースは現状の読み取り専用モデルでは
検証できない:

- モーダルを開いた直後の AOM 構造を確認したい (クリック → live 更新)
- フォーム入力中のエラー表示や `aria-describedby` 連動を確認したい
- アコーディオン展開時の `aria-expanded` / 内部構造変化を追いたい
- リンク遷移先の AOM を即座に覗きたい

NVDA の操作モデル (Browse Mode / Focus Mode + クイックナビキー + Enter/Space
による確定操作) をそのまま TUI に載せることで、既存の読み取り機能と自然に
統合できる。

## 2. 方針: NVDA 操作モデルのトレース

NVDA は以下 3 点の組み合わせで操作性を構築している。aria-palina TUI も
この 3 点を順次取り込む。

1. **クイックナビキー** — 見出し `H` / ランドマーク `D` / リンク `K` /
   ボタン `B` / フォーム `F` / 見出しレベル別 `1`〜`6` など、種別ごとに
   1 キーで次の要素へジャンプする。
2. **確定操作** — `Enter` でクリック / リンク遷移、`Space` でチェック・
   ラジオ・ボタンのトグル。
3. **モード切替** — 編集可能要素に入ると Focus Mode に切り替わり、入力
   キーがブラウザへそのまま流れる。`Escape` で Browse Mode に戻る。

## 3. 3 段階ロードマップ

実装リスクと体感改善の比を踏まえ、段階的に導入する。各段階は独立して
リリース可能で、途中で凍結しても既存機能を損なわない。

| 段階 | スコープ | 想定工数 | リスク |
| --- | --- | --- | --- |
| Stage 1 | Enter/Space による確定操作 (クリック・トグル) | S (約半日) | 低 — live 更新機構に便乗 |
| Stage 2 | NVDA クイックナビキー拡充 (`k`/`b`/`f`/`1`-`6`/`t`/`l`) | M (約 1 日) | 低 — 既存 FilterModal の延長 |
| Stage 3 | Browse/Focus モード明示 + テキスト入力 + 双方向同期 | L (約 2-3 日) | 中 — モード状態・キー衝突・IME |

### Stage 1: 確定操作 (Enter / Space)

- **キーバインド**:
  - `Enter` … カーソル下の要素が `button` / `link` / `menuitem` 等なら
    CDP 経由でクリック。`onclick` ハンドラ発火後、live 更新で AOM を差し替える。
  - `Space` … `checkbox` / `radio` / `switch` / `button` の切替。
- **新規 core API** (`packages/core/src/actions.ts`):
  ```ts
  export async function clickNode(cdp: ICDPClient, backendNodeId: number): Promise<void>;
  export async function focusNode(cdp: ICDPClient, backendNodeId: number): Promise<void>;
  ```
  内部的には `DOM.scrollIntoViewIfNeeded` → `DOM.getBoxModel` で要素座標を
  取得し `Input.dispatchMouseEvent` を `mousePressed` / `mouseReleased` の
  組で発行する。`Runtime.evaluate` で `element.click()` を呼ぶ方式は
  pointer-events やフレームワークの合成イベントで差が出るため採用しない。
- **フィードバック**: クリック直後はフッターに `✱ クリック: <label>` と
  表示し、live 更新でカーソル位置 (backendNodeId) を復元する。
- **ヘッドレス時の挙動**: 許容する。ただし初回操作時にフッターへ
  `[headless] 操作結果は `--headed` で視認可能` と 1 度だけ警告する。

### Stage 2: クイックナビキー拡充

NVDA と同じ 1 キー = 次要素ジャンプをサポートする。既存 `h` / `d` の
FilterModal 呼び出しと一貫した挙動 (モーダルを開く) にする案と、
モーダルを開かず「次の該当要素へカーソルを移動する」挙動のみに統一
する案がある。本提案は **後者 (モーダルレス)** を推す。モーダルは
`F7` (NVDA の要素リスト相当) として別キーに割り当てる。

- **Browse Mode キーバインド (追加)**:
  | キー | 動作 | NVDA 対応 |
  | --- | --- | --- |
  | `k` / `K` | 次 / 前のリンクへ | `K` / `Shift+K` |
  | `b` / `B` | 次 / 前のボタンへ | `B` / `Shift+B` |
  | `f` / `F` | 次 / 前のフォームフィールドへ | `F` / `Shift+F` |
  | `1`〜`6` | 該当レベルの見出しへ | `1`〜`6` |
  | `t` / `T` | 次 / 前のテーブルへ | `T` / `Shift+T` |
  | `l` / `L` | 次 / 前のリストへ | `L` / `Shift+L` |
  | `F7` | 要素リストモーダル (見出し/リンク/ランドマーク切替) | `NVDA+F7` |

  `L` は現在「ライブ更新トグル」に割当済み。Stage 2 で `Ctrl+L` に退避する。

- **小文字/大文字問題の整理**: 現在 `App.tsx:230-237` は小文字のみ受理
  している。NVDA 慣習は「大文字 = 次」「Shift 押下で前」。実装上
  `input === "k"` は Shift なしの小文字 k、`input === "K"` は Shift+k を
  意味するため、両方ハンドルして「小文字 = 次、大文字 = 前」に揃える。
  PRD §4.2 の `H` / `D` 表記もこの規約で解釈し、manual.md を更新する。

- **新規 core API** (`packages/core/src/node-kind.ts` 拡張):
  既存 `NodeKind = "heading" | "landmark" | "interactive"` を
  `"link" | "button" | "form-field" | "table" | "list"` と
  `{ kind: "heading"; level: 1..6 }` まで拡張する。`matchesKind` /
  `findNext` は既存の純粋関数を流用できる。

### Stage 3: Browse / Focus モード明示

- **状態**: `App` に `mode: "browse" | "focus"` を追加。Focus Mode に
  入る条件は (a) ユーザーが `Enter` を編集可能要素で押す、または
  (b) ブラウザ側のフォーカス変化が編集可能要素に当たる (live 更新で検知)。
- **Focus Mode の挙動**:
  - すべての英数字キー・矢印キーが CDP `Input.dispatchKeyEvent` で
    ブラウザへ転送される。TUI 側のナビは停止する。
  - `Escape` で Browse Mode に戻る。
  - ヘッダーに `[focus]` を橙色で表示し、NVDA の「フォーカスモード」
    ピコピコ音の代替として視覚通知する。
- **新規 core API**:
  ```ts
  export async function typeText(cdp: ICDPClient, text: string): Promise<void>;
  export async function sendKey(cdp: ICDPClient, key: KeyDescriptor): Promise<void>;
  ```
- **課題 (要検討)**:
  - **IME**: 日本語入力は端末側 IME と Focus Mode の転送が衝突する。
    Stage 3 では「ASCII 直接入力のみサポート」と割り切り、IME 連携は
    将来課題とする。
  - **キー衝突**: `q` や `Ctrl+C` など TUI 制御キーは Focus Mode でも
    奪う必要がある。ホワイトリスト方式で実装する。
  - **双方向同期**: ブラウザ側のフォーカス移動を TUI カーソルに反映
    する経路 (現状は TUI → ブラウザの片方向のみ)。`Page.frameNavigated`
    や `DOM.focus` イベントの活用を検討する。ただし PRD §4.2 は
    「TUI → ブラウザの片方向同期のみを提供」と明記しているため、
    PRD 改訂が必要になる可能性がある。

## 4. アーキテクチャ不変条件の遵守

- **操作系 API は `@aria-palina/core` の `actions.ts` に隔離** し、
  既存の読み取り系 (`extract.ts`, `flatten.ts`) とはファイル境界で分離する。
- CLI ワンショット (`palina <url>`) は `actions.ts` を import しない。
  `packages/cli/src/run.ts` には一切影響を与えない。
- `ICDPClient` インターフェースは変更しない。操作系 API も `cdp.send(...)`
  経由のみで実装する。Chrome Extension (Phase 7) でも同じコードが動く。

## 5. リスクと緩和策

| リスク | 緩和策 |
| --- | --- |
| ヘッドレスで操作しても目視できず混乱を招く | 初回操作時にフッターで 1 度警告。`--headed` 推奨を manual.md に明記 |
| クリック後の AOM ズレでカーソルが飛ぶ | 既存の `backendNodeId` ベース復元ロジックをそのまま利用 |
| Focus Mode の IME 崩壊 | Stage 3 では ASCII のみサポート。日本語 IME は将来課題 |
| `L` キーの意味変更による互換性崩れ | manual.md に変更を明記し、旧挙動を `Ctrl+L` に退避 |
| PRD §4.2「TUI → ブラウザの片方向同期のみ」との矛盾 (Stage 3 の双方向同期) | Stage 3 着手前に PRD 改訂判断を行う |

## 6. 完了の定義

- Stage 1: `Enter` / `Space` でボタン・リンク・チェックボックスを操作でき、
  live 更新でカーソルが保たれる。vitest でモック CDP ベースのテストを追加。
- Stage 2: 全クイックナビキーが動作し、manual.md のキーバインド表が
  更新されている。`findNext` の純粋関数テストに新 NodeKind を追加。
- Stage 3: 編集可能要素でテキスト入力ができ、`Escape` で Browse Mode に
  戻れる。ヘッダーにモードインジケータが表示される。

## 7. 次のアクション

1. 本提案のレビュー (オーナー承認)。
2. Stage 1 を単独 issue としてトラッキング開始。
3. Stage 2 / Stage 3 は Stage 1 完了後に再度スコープ確認。
