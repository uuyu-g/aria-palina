# 📖 aria-palina ユーザーマニュアル ＆ コマンドリファレンス

> **Status:** Draft
> **Last Updated:** 2026-04-11
> **Related:** [PRD](./prd.md) / [DD](./dd.md) / [Use Cases](./usecases.md)

aria-palina エコシステムへようこそ。

このドキュメントは、CLI、TUI、Chrome 拡張機能、およびテストユーティリティの詳細な使用方法を解説する公式ヘルプガイドです。

## 📦 インストール

aria-palina はワンショットの CLI モードとインタラクティブな TUI モードの両方を、**単一の `palina` コマンド**として提供します。モードはオプションで切り替えます。

```bash
# グローバルにインストール（palina コマンドを提供）
$ npm install -g aria-palina

# プロジェクトのテスト依存としてインストールする場合
$ npm install -D @aria-palina/test-utils
```

## 🖥️ 1. `palina` コマンド

`palina` は以下 2 つの動作モードを持ちます。デフォルトは CLI モード、`--tui` フラグで TUI モードに切り替わります。

| モード | 起動方法 | 用途 |
| --- | --- | --- |
| **CLI モード**（デフォルト） | `palina --url <URL>` | ワンショットでアクセシビリティツリーを `stdout` に出力。Unix パイプラインとの組み合わせに最適 |
| **TUI モード** | `palina --tui --url <URL>` | ターミナル上で NVDA の挙動を模倣するインタラクティブな没入型デバッグ UI |

### 共通オプション

| オプション | デフォルト | 説明 |
| --- | --- | --- |
| `--url`, `-u` | (必須) | 検証対象の URL（ローカルサーバーも可） |
| `--tui` | `false` | TUI モードで起動する。未指定時は CLI モード |
| `--headed` | `false` | ヘッドレスモードを無効にし、ブラウザの GUI を表示する（TUI モードでは Matrix View ハイライト同期が有効になる） |

### CLI モード専用オプション

| オプション | デフォルト | 説明 |
| --- | --- | --- |
| `--format`, `-f` | `text` | 出力フォーマット (`text` または `json`) |
| `--indent` | TTY 自動 | ツリー構造をインデントで表現するか (`--no-indent` で無効化) |
| `--color` | TTY 自動 | 出力に色を付けるか (`--no-color` で無効化) |

### 💡 CLI モード: パイプ処理のハック（Unix Philosophy）

出力先がターミナルかパイプかを自動検知し、最適なフォーマットを出力します。

**例1: `aria-expanded` が true になっている（展開されている）コンボボックスを探す**

```bash
$ palina -u http://localhost:3000 -f json | jq '.[] | select(.role == "combobox" and .state.expanded == true)'
```

**例2: 画像（`role="img"`）のうち、`alt` (Name) が空になっているものを探す**

```bash
$ palina -u http://localhost:3000 -f json | jq '.[] | select(.role == "img" and .name == "")'
```

**例3: ページ内のボタンの数をカウントする**

```bash
# パイプに渡すと自動でインデントが消えるため、正確にカウント可能
$ palina -u http://localhost:3000 -f text | grep "^\[ボタン\]" | wc -l
```

### 🕹️ TUI モード

`--tui` を付けて起動すると、ターミナル上でインタラクティブに DOM ツリーをナビゲートできます。

```bash
$ palina --tui --url http://localhost:3000
```

#### 🌟 Matrix View (`--tui --headed`)

`--tui` と `--headed` を同時に指定すると、ブラウザが立ち上がります。TUI でカーソルを動かすと、ブラウザ上の対応する要素が **青くハイライト** され、視覚とセマンティクスのズレを一瞬で特定できます。

```bash
$ palina --tui --headed --url http://localhost:3000
```

#### キーボード・ショートカット (TUI モード)

| キー | モード | アクション |
| --- | --- | --- |
| `↑` / `↓` | ブラウズ | ツリーを 1 行ずつ前後に移動（DOM の順序） |
| `Tab` | フォーカス | 次の「フォーカス可能（Interactive）」な要素へジャンプ |
| `Shift + Tab` | フォーカス | 前の「フォーカス可能」な要素へジャンプ |
| `h` | フィルタ | 「見出し」フィルタモードに入り次の見出しへジャンプ |
| `d` | フィルタ | 「ランドマーク（`main`, `nav` 等）」フィルタモードに入り次のランドマークへジャンプ |
| `↑` / `↓` | フィルタ中 | 絞り込まれたリスト内を 1 件ずつ移動 |
| `←` / `→` | フィルタ中 | フィルタ種別を切り替え（見出し ↔ ランドマーク ↔ インタラクティブ） |
| `Esc` | フィルタ中 | フィルタを解除して通常モードへ戻る |
| `Enter` | アクション | 現在フォーカスしている要素のクリックを発火（リンク遷移やボタン展開） |
| `Q` または `Ctrl+C` | システム | TUI を終了し、バックグラウンドのブラウザを閉じる |

> **フィルタモード**: `h` / `d` を単独で押すと、マッチしないノードは一覧から隠れ、
> ヘッダーに `[見出し]` のように現在の種別だけが表示されます。
> ←/→ で heading → landmark → interactive と種別を巡回でき、`Tab` を押すと解除して
> 通常モードの Tab ナビゲーションへ遷移します。

## 2. Chrome DevTools 拡張機能

ターミナルを開かずに、普段の開発フローのままアクセシビリティを検証できる Chrome 拡張機能です。

### 導入方法

1. リポジトリの `packages/extension/dist` フォルダをビルドします。
2. Chrome の `chrome://extensions/` を開き、「パッケージ化されていない拡張機能を読み込む」からフォルダを選択します。

### 使い方

1. 開発中のページで `F12` を押し、DevTools を開きます。
2. **「aria-palina」タブ** を選択します。
3. **リアルタイム同期:** ブラウザ上で要素をクリックしてモーダルを開いたり、React のステートが変更されたりすると、DevTools 内のアクセシビリティツリーが自動的に再描画されます。
4. **ハイライト同期:** DevTools 内のツリーの行にマウスをホバーさせると、画面上の対応する DOM 要素がハイライトされます。

## 3. 自動テストユーティリティ (`@aria-palina/test-utils`)

手動デバッグで得た「正しい読み上げ順序」を、Playwright 等の E2E テストのアサーションとして固定化します。静的解析（axe-core 等）では検知できない、動的なフォーカス移動や DOM 変更をテストできます。

### Playwright でのセットアップ

`playwright.config.ts` などでカスタムマッチャーをインポートします。

```typescript
// tests/setup.ts
import { expect } from '@playwright/test';
import { palinaMatchers } from '@aria-palina/test-utils';

expect.extend(palinaMatchers);
```

### API リファレンス

#### `toHavePalinaTextSequence(sequence: string[])`

指定した順序通りに、アクセシビリティツリーのテキストが並んでいることを検証します。（※間に別のノードが挟まっていても、指定した要素がその「順番」で出現すればパスします）

```typescript
test('モーダル内の正しいフォーカス順序', async ({ page }) => {
  await page.click('button:has-text("開く")');

  await expect(page).toHavePalinaTextSequence([
    '[ダイアログ] 設定',
    '[テキスト入力] ユーザー名',
    '[ボタン] 保存',
    '[ボタン] キャンセル'
  ]);
});
```

#### `not.toHavePalinaText(text: string)`

特定の要素が、アクセシビリティツリーから「完全に隠蔽されている（読み上げられない）」ことを検証します。`aria-hidden` や `display: none` のテストに最適です。

```typescript
test('モーダル展開時、背景要素が隠蔽されること', async ({ page }) => {
  await page.click('button:has-text("開く")');

  // 視覚的には後ろにある「利用規約」リンクが、AOM上から消えていることを保証
  await expect(page).not.toHavePalinaText('[リンク] 利用規約');
});
```

## ❓ FAQ & トラブルシューティング

**Q. TUI で画面が崩れる、または極端に遅い**

A. ターミナルのウィンドウサイズが極端に小さい場合、仮想スクロールの計算が乱れることがあります。ターミナルを標準的なサイズ（縦 24 行以上）にして再度お試しください。

**Q. CLI でパイプ処理するとエラーになる**

A. `npm run palina` のように npm script 経由で実行すると、npm 自身の出力ログが `stdout` に混ざる場合があります。`npx palina` または `pnpm palina` のように直接バイナリを叩くか、`--silent` フラグを使用して npm のログを抑制してください。

**Q. Chrome 拡張機能で「Debugger Attached」という警告が出続ける**

A. これは Chrome のセキュリティ仕様上、CDP（`chrome.debugger`）を使用している拡張機能が動作している際に必ず表示される仕様です。動作に影響はありません。
