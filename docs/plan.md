# 📋 開発計画 (Plan)

> **Related:** [DD §4 Roadmap](./dd.md) / [PRD](./prd.md) / [Done Records](./progress/)

本ドキュメントは **予定・ステータス管理** に特化した運用ドキュメントである。
実装完了後の詳細記録 (設計判断・モジュール構成・テスト) は `docs/progress/` 配下の
フェーズ別ファイルに分離している。

- `docs/dd.md` §4「開発ロードマップ」は **仕様書** として不変。
- 本ファイルは「次に何をやるか」「いま何がどこまで進んでいるか」のみを管理する。
  進捗の詳細はフェーズ別の done record にリンクする。
- ステータス遷移 (⏳ → 🚧 → ✅) が発生したときのみ本ファイルを更新する。
  設計メモの追記は done record 側に書く。

## ステータス凡例

- ✅ **Done** — 実装・テスト完了 (詳細は done record 参照)
- 🚧 **In Progress** — 現在着手中
- ⏳ **Pending** — 未着手

## フェーズ進捗一覧

| Phase | 内容 | ステータス | Done Record |
| ----- | ---- | ---------- | ----------- |
| 1 | モノレポ基盤と DI Core エンジン | ✅ Done | [phase-1](./progress/phase-1.md) |
| 2 | AOM 抽出・平坦化ロジック (Core) | ✅ Done | [phase-2](./progress/phase-2.md) |
| 3 | Playwright 統合とワンショット CLI | ✅ Done | [phase-3](./progress/phase-3.md) |
| 4 | Ink TUI 基盤とパフォーマンス最適化 | ✅ Done | [phase-4](./progress/phase-4.md) |
| 5 | デュアルナビゲーション実装 (TUI) | ✅ Done | [phase-5](./progress/phase-5.md) |
| 6 | Matrix View (Headed モード同期) | ✅ Done | [phase-6](./progress/phase-6.md) |
| 6.5 | リーダブルビュー (中間表現 + レンダラー切替) | ⏳ Pending | — |
| 6.6 | TUI テキストブラウザビュー (Lynx/w3m 風) | ✅ Done | [phase-6.6](./progress/phase-6.6.md) |
| 7 | Chrome Extension (DevTools Panel) | ⏳ Pending | — |
| 8 | Test Utilities (BDD) | ⏳ Pending | — |
| 9 | 統合バイナリ `palina` の公開 | ⏳ Pending | — |

## 横断的な done record

フェーズ境界をまたぐ改善・リファクタリングは専用の done record にまとめる。

| 内容 | Done Record |
| ---- | ----------- |
| テーブルコンテキスト付与 / ネスト圧縮 (Core) | [improvements](./progress/improvements.md) |
| CLI/TUI パッケージ統合リファクタ | [cli-tui-merge](./progress/cli-tui-merge.md) |
| 非同期画面更新への追従 (ライブ AX 更新 / aria-live 通知) | [async-update](./progress/async-update.md) |

## 次にやること (Pending フェーズ)

### Phase 6.5: リーダブルビュー (中間表現 + レンダラー切替)

> DD §4 ロードマップの差し込みフェーズ。DD 本体は不変なので本ファイル側に詳細を残す。

**価値提案**: 「スクリーンリーダーで世界がどう見えているか」を晴眼者がそのまま
俯瞰できるようにする。CDP 生ツリーをそのまま深くインデントするより、ランドマーク
と見出しを章立てとして並べ、構造把握を妨げるラッパーノードを潰した方が、晴眼者の
脳内モデル (= 目次的なページ構造) と一致しやすい。

**スコープ**:

- `@aria-palina/core` に**ビュー中間表現**を導入。
  - `buildReaderView(nodes: A11yNode[]): ReaderSection[]` のような純粋関数。
  - `ReaderSection` はランドマーク (`banner` / `nav` / `main` / `complementary` /
    `contentinfo` / `region` 等) を境界とし、配下に heading 階層と平坦化された
    item 列を持つイメージ。
  - 折り畳み対象ロールの初期セット: `generic` / `none` / `presentation` /
    name 無しの単独子ラッパー。実サイトで試しながらブラッシュアップしていく。
- CLI / TUI に**組み込みレンダラー切替**を追加。
  - `reader` (新デフォルト) / `raw` (現行の素朴な深いインデント表示)。
  - `--view=reader|raw` 相当のフラグを追加 (短縮形は実装時に検討)。
- TUI のランドマーク区切りは**罫線** (例: `── main ──`) として描画する。
- 既存のキーバインド (`h` / `H` 見出しジャンプ, `D` ランドマークジャンプ等) が
  新表示でも自然に効くか確認し、必要なら微調整する。

**スコープ外 (将来検討)**:

- `Renderer` インターフェースを公開しての**外部プラグイン化** (案 3 相当)。
  本フェーズの中間表現があれば後から `Renderer` I/F でラップするだけで上乗せ
  できる設計を保つ。
- ユーザー設定可能な折り畳みロールリスト (`--collapse-roles=...` 等)。

**Phase 7 との関係**: Chrome Extension でも同じビューが欲しくなるため、変換ロジックは
必ず Core 側 (`buildReaderView`) に置き、Extension パッケージ追加時にそのまま再利用
できるようにする。

### Phase 6.6: TUI テキストブラウザビュー (Lynx/w3m 風) — ✅ Done

> Phase 6.5 とは独立した追加モード。中間表現は導入せず、TUI 限定で
> Lynx / w3m 風のリーダブル描画を提供する。詳細は
> [phase-6.6 done record](./progress/phase-6.6.md) を参照。

### Phase 7: Chrome Extension (DevTools Panel)

- `@aria-palina/extension` (Manifest V3) 新設。
- `chrome.debugger` → `ICDPClient` アダプタを実装し、Core を再利用する。
- 詳細は DD §4 Phase 7。

### Phase 8: Test Utilities (BDD)

- `@aria-palina/test-utils` 新設。Playwright カスタムマッチャー
  (`toHavePalinaText` 等) を提供。
- 詳細は DD §4 Phase 8。

### Phase 9: 統合バイナリ `palina` の公開

- `aria-palina` umbrella パッケージを npm で公開 (`@aria-palina/cli` を re-export)。
- 詳細は DD §4 Phase 9。

## フェーズ完了時の手順

1. 対応する done record を新規作成 (`docs/progress/phase-N.md`)。
   - スコープ / モジュール構成 / 設計判断 / テスト / 公開 API 変更 を記述。
2. 本ファイル (`docs/plan.md`) の進捗一覧をステータス更新 + done record リンク追加。
3. CI (`vp test` / `vp check` / `vp run -F './packages/*' build`) 緑を確認。
4. Conventional Commits 形式 (`type(scope): summary`) でコミット。
