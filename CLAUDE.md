# CLAUDE.md

> このファイルは Claude Code / その他の AI エージェントに向けた、
> `aria-palina` monorepo の**プロジェクト規約**を記した運用メモである。
> コードを書き始める前に必ず目を通し、矛盾する判断を避けること。

## 📚 参照ドキュメント

仕様の一次ソースは以下の通り。AI エージェントは **必ずこれらを先に読むこと**。

- [`docs/prd.md`](./docs/prd.md) — プロダクト要件定義 (PRD)。
- [`docs/dd.md`](./docs/dd.md) — 設計ドキュメント (DD)。§4 の開発ロードマップが
  実装の主な道筋を示している。**DD のロードマップ本体は仕様書として不変** で
  あり、進捗情報の追記は禁止。
- [`docs/usecases.md`](./docs/usecases.md) — UX シミュレーション集。
- [`docs/manual.md`](./docs/manual.md) — ユーザー向けマニュアル (`palina` CLI/TUI)。
- [`docs/progress.md`](./docs/progress.md) — **進捗トラッキング運用ドキュメント**。
  各フェーズのステータス (✅ / 🚧 / ⏳) と成果物をここに集約する。
  フェーズ完了時に必ず更新すること。

## 🧰 ツールチェーン: Vite+

本プロジェクトは **Vite+ (`vp` コマンド)** を統一ツールチェーンとして採用している。
詳細は `node_modules/vite-plus/AGENTS.md` を参照。

### やるべきこと

- 依存追加: `pnpm install` ではなく **`vp install`** (または `pnpm exec vp install`)。
- テスト実行: **`vp test`** (内部で Vitest が走る)。
- Lint / フォーマット: **`vp check`** / **`vp check --fix`**。
- ビルド (各パッケージ): **`vp run -F './packages/*' build`** (ルート `package.json` の `build` スクリプト)。
- CI 相当の検証: コミット前に **必ず** 以下を通すこと:
  1. `vp test`
  2. `vp check`
  3. `vp run -F './packages/*' build`

### やってはいけないこと

- `vitest` / `oxlint` / `oxfmt` / `tsdown` を **直接 devDependency に追加しない**。
  Vite+ がこれらを内包している。
- テストで `import { ... } from "vitest"` と書かない。
  必ず `import { describe, expect, test, vi } from "vite-plus/test"` を使う。
- `vp build` は Vite のアプリビルドを実行するコマンド。
  ライブラリをビルドしたい場合は **`vp pack`** (各 package.json に定義済み) を使う。
- `pnpm` を直接叩くより `vp` 経由を優先する (package manager は Vite+ が wrap する)。

## 🧪 テストの規約

### テストランナー / 配置

- テストランナーは Vite+ 同梱の **Vitest**。`vp test` で全ワークスペースを横断実行する。
- テストファイルは実装ファイルと同じパッケージの
  `src/__tests__/*.test.ts` 配下に置く。
  (例: `packages/core/src/flatten.ts` → `packages/core/src/__tests__/flatten.test.ts`)
- import は必ず:
  ```ts
  import { describe, expect, test, vi } from "vite-plus/test";
  ```

### 🌐 テストケース名は日本語で書く

**プロジェクト規約**: `test(...)` / `it(...)` に渡す説明文字列は **日本語** で書くこと。

- 理由: `aria-palina` のドメイン (NVDA 発話テキスト、ARIA role の日本語ラベル等)
  は日本語の語彙で思考されており、仕様書 (`docs/*.md`) も全て日本語のため、
  テストの意図が読み手に最短距離で伝わる。
- `describe(...)` のグルーピング名は **実装シンボル名** (例: `buildSpeechText`,
  `flattenAXTree`) をそのまま使い、その配下の `test(...)` 名を日本語にする。

#### ✅ 良い例

```ts
describe("buildSpeechText", () => {
  test("disabled=true の真偽値状態が『利用不可』として出力される", () => { ... });
  test("heading は properties.level をロールラベル末尾に連結する", () => { ... });
});
```

#### ❌ 悪い例

```ts
describe("buildSpeechText", () => {
  test("renders disabled state as 利用不可", () => { ... });          // 英語
  test("should announce level for heading role", () => { ... });      // 英語 + BDD 冗長語
});
```

### アサーションの書き方

- 文字列比較は `toBe` を使う (`expect(text).toBe("[ボタン] 送信")`)。
- 構造比較は `toEqual` を使う。`toMatchObject` は必要最小限。
- モックには `vi.fn()` を使い、型パラメータを使わず `as` キャストで
  型を当てるとシンプルになる (例: `vi.fn(async () => result) as ICDPClient["send"]`)。

### 🏛️ 古典派 (Classicist) を第一選択とする

**プロジェクト規約**: 単体テストは **Detroit / Chicago school (古典派)** を
デフォルトとする。`vi.fn()` とスパイ検証 (`toHaveBeenCalled*`) を多用する
Mockist (London school) スタイルは避ける。

- **第一選択: 実装を直接呼び出す**
  `@aria-palina/core` の中心は純粋関数 (`flattenAXTree`, `buildSpeechText` 等) で
  ある。これらはダブルを一切使わず、入力 → 戻り値の比較だけでテストする。
- **系の境界で必要な場合は fake を使う**
  `ICDPClient` のような境界インターフェースは `vi.fn()` のモックではなく、
  `class Fake...CDPClient implements ICDPClient` のような **動く偽実装** を
  テスト内に置く。テストが検証するのは **公開 API の戻り値 (状態)** であり、
  「どのメソッドが何回呼ばれたか」というインタラクションではない。
- **相互作用検証は最後の手段**
  `toHaveBeenCalledWith` や `spy` は、fake では再現しきれない副作用 (ログ、
  テレメトリ、イベント発火順序など) を検証したいときだけに留める。

#### ✅ 良い例 (古典派: fake + 状態検証)

```ts
class FakeCDPClient implements ICDPClient {
  private readonly responses = new Map<string, unknown>();
  setResponse<T>(method: string, result: T): void {
    this.responses.set(method, result);
  }
  send<T = unknown>(method: string): Promise<T> {
    if (!this.responses.has(method)) {
      return Promise.reject(new Error(`FakeCDPClient: no response for ${method}`));
    }
    return Promise.resolve(this.responses.get(method) as T);
  }
  on(): void {}
  off(): void {}
}

test("多段ツリーが DFS 順で平坦化される", async () => {
  const client = new FakeCDPClient();
  client.setResponse("Accessibility.getFullAXTree", { nodes: [...] });
  const tree = await extractA11yTree(client);
  expect(tree.map((n) => n.speechText)).toEqual(["[メイン]", "[ボタン] 送信"]);
});
```

#### ❌ 悪い例 (Mockist: vi.fn + インタラクション検証)

```ts
test("calls Accessibility.getFullAXTree", async () => {
  const cdp = {
    send: vi.fn(async () => ({ nodes: [] })),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as ICDPClient;
  await extractA11yTree(cdp);
  expect(cdp.send).toHaveBeenCalledWith("Accessibility.getFullAXTree"); // 実装詳細の検証
});
```

## 🏗️ アーキテクチャ不変条件

- **`@aria-palina/core` は環境非依存 (pure TS)** を保つ。
  puppeteer / playwright / `chrome.debugger` / React / Ink / fs / net に
  直接依存するコードを core に入れない。注入は `ICDPClient` 経由のみ。
- 公開 API は各パッケージの `src/index.ts` からしか export しない。
  アダプタ層 (`@aria-palina/cli` 等) は内部ファイルを直 import しないこと。
- Phase の実装順序は `docs/dd.md` §4 を守る。既存のフェーズを飛ばして将来フェーズを
  先出しする場合は必ず `docs/progress.md` でその旨を記録する。

## 📝 コミットとブランチ運用

- 作業は機能ブランチで行い、ブランチ名は Claude Code が命名するもの
  (`claude/implement-roadmap-phase-2-PPIWI` 等) をそのまま使う。
- コミットメッセージは `type(scope): short summary` (Conventional Commits 風)。
  例: `feat(core): implement Phase 2 AOM extraction and speech simulator`
- プッシュは `git push -u origin <branch>` で行う。
- **PR は明示的に指示されたときのみ作成する**。

## 🔖 フェーズ完了時のチェックリスト

フェーズを終えるとき、以下を必ず満たしてから commit & push する:

- [ ] `vp test` 緑
- [ ] `vp check` 緑 (formatter / linter)
- [ ] `vp run -F './packages/*' build` 緑 (各パッケージの dist 生成)
- [ ] `docs/progress.md` のフェーズステータスを ✅ に更新し、成果物を列挙
- [ ] 新規ファイル/編集ファイルを過不足なくステージ
- [ ] コミットメッセージにどの Phase を実装したか明記
