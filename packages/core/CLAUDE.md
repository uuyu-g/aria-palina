# CLAUDE.md — `@aria-palina/core`

> `@aria-palina/core` パッケージ固有の運用メモ。
> ルートの [`/CLAUDE.md`](../../CLAUDE.md) を補完するため、
> このパッケージで作業する際は両方に目を通すこと。

---

## 📤 出力形式の変更には「順番付き ビフォー / アフター 例」を必ず添える

**プロジェクト規約**: 本パッケージで以下のいずれかの**出力形式**に変更が生じる場合、
レビュアーが差分を即座に把握できるよう、**変更前後の具体例を出力順 (DFS 順 /
配列順) どおりに並べて** PR 本文 / コミットメッセージ / `docs/progress/*.md` /
チャット応答に添付すること。

### 対象となる「出力形式」

`@aria-palina/core` の出力 = 下流 (CLI / TUI / 拡張 / test-utils) が依存する
**観測可能な文字列・データ構造**を指す。具体的には:

- `buildSpeechText()` が返す NVDA 風日本語テキスト
  (`[role] name (state)` の整形ルール、ロールラベル、状態語彙、heading level
  の連結方法、テーブル位置・列ヘッダーの埋め込み方等)
- `flattenAXTree()` が返す `A11yNode[]` のフィールド構成・並び順・`depth`
  算出規則
- `extractA11yTree()` 経由で得られる `A11yNode` のうち、下流が文字列化に
  利用するプロパティ
- `enrichTableContext()` が `A11yNode` に付与するテーブル文脈情報の
  キー名・値の表現
- `A11yNode` / 公開型 (`src/index.ts` から export されるもの) のフィールド
  追加・削除・改名・型変更

### 添付すべき例の書式

1. **入力 (AX ツリー or `SpeechInput`)** を最小限のスニペットで示す。
2. **変更前 (Before)** の出力を**実行順どおりに 1 行 1 ノード**で並べる。
3. **変更後 (After)** の出力を同じノード順で並べる。
4. 差分が分かりやすいよう、変わった行に `←` 等のマークを付けるか、
   `diff` コードブロックで `-` / `+` を使う。

### ✅ 良い例 (`buildSpeechText` の状態語彙を変更した場合)

入力となる AX ツリー (`<button disabled>送信</button>` を含む):

```ts
[
  { role: "main", name: "" },
  { role: "button", name: "送信", state: { disabled: true } },
  { role: "link", name: "ヘルプ" },
];
```

Before (DFS 順):

```
[main]
[button] 送信 (disabled)         ← 変更対象
[link] ヘルプ
```

After (DFS 順):

```
[main]
[button] 送信 (利用不可)         ← state 語彙を日本語化
[link] ヘルプ
```

### ✅ 良い例 (`A11yNode` フィールド追加 — `flattenAXTree` の出力)

Before (`A11yNode[]` JSON、配列順):

```json
[
  { "role": "main", "name": "", "depth": 0 },
  { "role": "button", "name": "送信", "depth": 1 }
]
```

After (`A11yNode[]` JSON、配列順 — `indexInParent` を追加):

```json
[
  { "role": "main", "name": "", "depth": 0, "indexInParent": 0 },
  { "role": "button", "name": "送信", "depth": 1, "indexInParent": 0 }
]
```

### ❌ 悪い例 (順序が崩れている / 抽象的すぎる)

- 「speechText がより自然な日本語になりました」
- 「depth の計算式を見直しました」

→ どのノードがどう変わるのか、レビュアーが実装を読まないと分からないため不可。

### なぜこのルールが必要か

- `@aria-palina/core` の出力は CLI (stdout)、TUI (画面)、テストの
  期待値、拡張のパネル表示など**複数の下流が文字列単位で依存**している。
  わずかな整形変更でも回帰の影響範囲が広い。
- AX ツリーは木構造だが、下流が見るのは**平坦化後の順序付き列**である。
  変更の意味は「N 行目がこう変わる」という**順番付きの差分**でしか正確に
  伝わらない。
- 仕様書 (`docs/dd.md`, `docs/usecases.md`) との整合確認も、順番付きの
  ビフォー / アフターがあれば即座に行える。

### 添付場所

- **コミット**: コミットメッセージ本文に Before / After ブロックを含める。
- **PR**: `## 変更内容` セクション直下に必ず置く。
- **進捗記録 (`docs/progress/phase-*.md`)**: 「公開 API 変更」または
  「出力フォーマット変更」見出しの下に置く。
- **チャット応答**: 変更を実装し終えた最終サマリで提示する。

---

## 🔒 アーキテクチャ不変条件 (再掲)

ルート `CLAUDE.md` の「アーキテクチャ不変条件」節を遵守すること。
特に本パッケージ固有の制約として:

- **環境非依存 (pure TS) を保つ**。
  puppeteer / playwright / `chrome.debugger` / fs / net / Node 固有 API
  (`node:*`) を import しない。ブラウザ接続は `ICDPClient` 経由でのみ受け取る。
- 公開 API は `src/index.ts` からしか export しない。
  下流パッケージは `@aria-palina/core/internal/...` のような深い import を
  しないこと (= 内部ファイルを公開してはいけない)。
