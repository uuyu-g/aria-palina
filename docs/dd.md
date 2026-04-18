# 🛠️ Design Document (DD): aria-palina Ecosystem

> **Status:** Draft
> **Last Updated:** 2026-04-11
> **Related:** [PRD](./prd.md)

## 1. システムアーキテクチャ (System Architecture)

本プロジェクトは、機能の分離と再利用性を最大化するため、pnpm workspaces を利用したモノレポ構成を採用します。

最大の技術的ハイライトは、**「Core エンジンへの Dependency Injection（依存性の注入）」** です。これにより、Node.js 環境（Playwright）とブラウザ環境（Chrome Extension）で同じ AOM 変換ロジックを 100% 再利用します。

### 1.1 パッケージ構成

- **`@aria-palina/core`**:
  - 環境非依存の純粋なロジック群。CDP クライアント（インターフェース）を受け取り、AXTree の取得、平坦化、テキスト変換を行う。
- **`@aria-palina/cli`**:
  - `palina` バイナリを提供する Node.js パッケージ。Playwright を内包し、`core` に Playwright 経由の `CDPSession` を注入する。
  - **デフォルトは CLI ワンショットモード**（NVDA 風テキストを stdout 出力）、`--tui` フラグで `src/tui/` サブツリーを dynamic import して Ink (React) ベースの対話 TUI モードに切り替わる。`vitest` / `vitest run` と同じ「単一パッケージ・モードフラグ」モデル。
  - TUI 用の公開型・コンポーネントはサブパスエクスポート `@aria-palina/cli/tui` から参照できる。
- **`@aria-palina/extension`**:
  - Chrome DevTools 拡張機能。`chrome.debugger` API 経由の CDP クライアントを作成し、`core` に注入して動作する。
- **`@aria-palina/test-utils`**:
  - Playwright / Vitest 向けのアサーションマッチャー群。マッチャー API はブランド名に揃え、`toHavePalinaText` / `toHavePalinaTextSequence` として提供する (エクスポートは `palinaMatchers`)。

> **Note:** 初期計画では CLI と TUI を `@aria-palina/cli` / `@aria-palina/tui` の 2
> パッケージに分離していたが、`vitest` のように**単一パッケージ + モードフラグ**の
> 方が概念的に一貫し、CDP アダプタ等の重複も解消できるため、実装過程で
> `@aria-palina/cli` に統合した。再編の経緯は [`docs/progress/cli-tui-merge.md`](./progress/cli-tui-merge.md) を参照。

### 1.2 ユーザー向けバイナリ配布 (Distribution)

CLI モードと TUI モードはエンドユーザーには **単一の `palina` コマンド** として提供する。

- **配布パッケージ:** `@aria-palina/cli` が `palina` バイナリを `bin` として宣言する。npm 公開時には unscoped alias `aria-palina` から `@aria-palina/cli` を re-export する薄いラッパを用意する（Phase 9）。
- **モード切替:** デフォルトは CLI ワンショットモード。`--tui` フラグで TUI モードに遷移する。
- **共通フラグ:** `--url`, `--headed` は両モードで共通。`--format` / `--indent` / `--color` は CLI モード専用。
- `--tui` 判定時に `./tui/index.js` を動的 import することで、ワンショット実行時の起動時間を Ink/React のロード分だけ短縮する。

## 2. データ構造とアルゴリズム (Data Structures & Algorithms)

### 2.1 データモデル (Data Model)

CDP から取得した生の階層型ツリー (`Accessibility.getFullAXTree` のレスポンス) を、以下の平坦化された `A11yNode` の配列に変換します。

```typescript
// @aria-palina/core/src/types.ts
export interface A11yNode {
  backendNodeId: number;     // DOMのハイライト（双方向同期）に使用
  role: string;              // 例: "button", "heading"
  name: string;              // 計算済みのアクセシブルネーム
  depth: number;             // ツリーの階層の深さ（インデント描画用）
  properties: Record<string, any>; // 例: { level: 2 } (h2の場合)
  state: Record<string, boolean | string>; // 例: { expanded: true, disabled: false }

  // マシン・リーダブルな要素から、NVDAが発話するテキストに変換された文字列
  speechText: string;        // 例: "[見出し2] ユーザー設定"

  // ナビゲーション用のフラグ
  isFocusable: boolean;      // Tabキーでのジャンプ対象か
  isIgnored: boolean;        // role="presentation" や aria-hidden="true" など
}
```

### 2.2 ツリー平坦化アルゴリズム (Linearization)

1. CDP からルートノードを取得する。
2. 深さ優先探索（DFS）でツリーをトラバースする。
3. トラバース中、`ignored: true` とマークされているノード（およびその子孫）は配列への追加をスキップする。
4. 各ノードの元の階層レベルを `depth` プロパティとして記録する。

### 2.3 NVDA テキスト変換エンジン (Speech Simulator)

各ノードの情報を元に、スクリーンリーダーユーザーが理解しやすいテキスト文字列（`speechText`）を合成します。

- **フォーマット規約:** `[{Role・Properties}] {Name} ({States})`
- **変換例:**
  - `role="button"`, `name="送信"`, `state={disabled: true}` → `[ボタン] 送信 (利用不可)`
  - `role="heading"`, `properties={level: 2}`, `name="概要"` → `[見出し2] 概要`
  - `role="combobox"`, `name="国"`, `state={expanded: true}` → `[コンボボックス] 国 (展開)`

## 3. インターフェース設計 (Interface Design)

### 3.1 CLI のスマート出力制御 (TTY Detection)

`@aria-palina/cli` は `process.stdout.isTTY` を評価し、フォーマットを動的に切り替えます。

```typescript
// @aria-palina/cli/src/formatter.ts
export function formatTextOutput(nodes: A11yNode[], isTTY: boolean): string {
  return nodes.map(node => {
    // TTY(人間)なら depth * 2 のスペースでインデントする
    const indent = isTTY ? '  '.repeat(node.depth) : '';
    // TTY(人間)なら chalk 等で色付けする (疑似コード)
    const text = isTTY ? colorize(node.speechText) : node.speechText;
    return `${indent}${text}`;
  }).join('\n');
}
```

### 3.2 TUI のパフォーマンス最適化 (Windowing)

数千行の `A11yNode` 配列を Ink (React) にそのまま渡すと、毎フレームの再レンダリングでターミナルがフリーズします。必ず仮想スクロールを実装します。

```tsx
// @aria-palina/cli/src/tui/components/VirtualList.tsx
// 概念実証コード
const VirtualList = ({ nodes, cursorIndex }) => {
  const terminalHeight = process.stdout.rows || 24;
  const visibleCount = terminalHeight - 4; // ヘッダー等の余白を引く

  // カーソル位置を中心に、表示すべき範囲だけをスライスする
  const startIndex = Math.max(0, cursorIndex - Math.floor(visibleCount / 2));
  const visibleNodes = nodes.slice(startIndex, startIndex + visibleCount);

  return (
    <Box flexDirection="column">
      {visibleNodes.map((node, i) => {
        const globalIndex = startIndex + i;
        const isSelected = globalIndex === cursorIndex;
        // depth を使ったインデント描画
        return (
          <Text key={node.backendNodeId} color={isSelected ? 'green' : 'white'}>
            {isSelected ? '> ' : '  '}
            {'  '.repeat(node.depth)}
            {node.speechText}
          </Text>
        );
      })}
    </Box>
  );
};
```

### 3.3 Two-way Matrix View (双方向同期)

TUI モードで `--headed` が指定された場合、または DevTools 拡張機能の場合、CDP の `Overlay` ドメインを使用してブラウザ上の要素をハイライトします。

```typescript
// カーソル移動時のイベントハンドラ内
async function onCursorMove(backendNodeId: number) {
  // CDP経由で対象ノードに青い網掛けを描画する
  await cdpClient.send('Overlay.highlightNode', {
    highlightConfig: {
      contentColor: { r: 0, g: 120, b: 255, a: 0.5 },
    },
    backendNodeId: backendNodeId
  });
}
```

## 4. 開発ロードマップ (Implementation Roadmap for AI)

AI エージェントは以下のフェーズに従って、段階的に実装と検証を進めてください。

- **Phase 1: モノレポ基盤と DI Core エンジン**
  - `package.json` での pnpm workspaces 設定。
  - `@aria-palina/core` の作成。CDP のメッセージ送受信インターフェース (`ICDPClient`) を定義し、特定のライブラリへの依存を排除する。
- **Phase 2: AOM 抽出・平坦化ロジック (Core)**
  - `Accessibility.getFullAXTree` コマンドの発行と、DFS による平坦化、`depth` の算出アルゴリズムの実装。
  - NVDA テキストへの変換ロジック（Speech Simulator）の実装。
- **Phase 3: Playwright 統合と ワンショット CLI**
  - `@aria-palina/cli` を作成。Playwright を起動し、取得した `CDPSession` を Core エンジンの `ICDPClient` に適合させるアダプターを記述。
  - `isTTY` 判定によるスマートフォーマット出力の完成。
- **Phase 4: Ink TUI 基盤と パフォーマンス最適化**
  - `@aria-palina/tui` を作成。仮想スクロール (`VirtualList`) の確実な実装。
- **Phase 5: デュアルナビゲーション実装 (TUI)**
  - TUI 上での矢印キー（DOM 順移動）と Tab キー（インタラクティブ要素ジャンプ）のロジック実装。
- **Phase 6: Matrix View (Headed モード同期)**
  - `Overlay.highlightNode` を用いた、TUI カーソル移動とブラウザ画面のハイライト同期機能の実装。
- **Phase 7: Chrome Extension (DevTools Panel)**
  - `@aria-palina/extension` を作成。Manifest V3 の設定。
  - `chrome.debugger` API を `ICDPClient` に適合させるアダプターの実装。DevTools パネル UI の構築。
- **Phase 8: Test Utilities (BDD)**
  - `@aria-palina/test-utils` を作成。平坦化されたテキスト配列に対する Playwright カスタムマッチャー (`toHavePalinaText` / `toHavePalinaTextSequence`) の実装。
- **Phase 9: 統合バイナリ `palina` の公開**
  - unscoped `aria-palina` umbrella パッケージを作成し、`bin` に `palina` を登録。`--tui` フラグで `@aria-palina/cli` と `@aria-palina/tui` の該当エントリに dispatch する薄い launcher を実装する。
