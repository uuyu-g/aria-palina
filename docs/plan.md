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
| 7 | Chrome Extension (DevTools Panel) | ⏳ Pending | — |
| 8 | Test Utilities (BDD) | ⏳ Pending | — |
| 9 | 統合バイナリ `palina` の公開 | ⏳ Pending | — |

## 横断的な done record

フェーズ境界をまたぐ改善・リファクタリングは専用の done record にまとめる。

| 内容 | Done Record |
| ---- | ----------- |
| テーブルコンテキスト付与 / ネスト圧縮 (Core) | [improvements](./progress/improvements.md) |
| CLI/TUI パッケージ統合リファクタ | [cli-tui-merge](./progress/cli-tui-merge.md) |

## 次にやること (Pending フェーズ)

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
