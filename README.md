# aria-palina

> **"Visual noise off. Semantics on."**
>
> aria-palina Ecosystem — CSS の視覚的ノイズを剥ぎ取り、アクセシビリティツリー（AOM）そのものをターミナル／DevTools 上に描き出す、アクセシビリティ開発のためのエコシステム。

## Packages

| パッケージ                             | 概要                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| [`@aria-palina/core`](./packages/core) | 環境非依存の AOM 抽出・平坦化・NVDA 風テキスト生成エンジン (pure TypeScript)    |
| [`@aria-palina/cli`](./packages/cli)   | `palina` コマンド。Playwright ワンショット CLI + Ink ベースの対話 TUI (`--tui`) |

## Quick Start

```bash
# 対象 URL の AOM を NVDA 風テキストとして stdout に出力 (ワンショット)
$ palina --url http://localhost:3000

# JSON として出力し jq でフィルタ
$ palina -u http://localhost:3000 -f json | jq '.[] | select(.role == "button")'

# インタラクティブ TUI (キーバインド: ↑/↓, Tab, h, d, q 等)
$ palina --tui --url http://localhost:3000
```

詳細なオプション・キーバインドは [User Manual](./docs/manual.md) を参照。

## Development

本リポジトリは pnpm workspaces + Vite+ (`vp` コマンド) で構築されている。

```bash
vp install                            # 依存インストール
vp test                               # 全パッケージのテスト
vp check                              # lint + format
vp run -F './packages/*' build        # 各パッケージの dist 生成
```

AI エージェント向け規約・アーキテクチャ不変条件は [`CLAUDE.md`](./CLAUDE.md) に集約。

## Status

実装フェーズの最新状況は [`docs/progress.md`](./docs/progress.md) を参照。現時点では Phase 1–4 (Core エンジン / ワンショット CLI / Ink TUI 基盤) が完了し、Phase 5 以降 (デュアルナビゲーション, Matrix View, Chrome 拡張, Test Utilities) が Pending。

## Documentation

- [Product Requirements Document (PRD)](./docs/prd.md)
- [Design Document (DD)](./docs/dd.md)
- [Use Cases / UX Simulations](./docs/usecases.md)
- [User Manual & Command Reference](./docs/manual.md)
- [Progress Tracking](./docs/progress.md)
