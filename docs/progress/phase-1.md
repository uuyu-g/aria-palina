# Phase 1 実装メモ

> [← plan.md](../plan.md) / [DD §4 Roadmap](../dd.md)

- `@aria-palina/core` パッケージの雛形を作成し、`ICDPClient` 抽象と
  `A11yNode` 型を定義。CDP / Playwright / `chrome.debugger` の具体実装に
  依存せず、純粋な TypeScript 型と `interface` のみで構成している。
- 公開 API は `packages/core/src/index.ts` から `type` として再エクスポート。
