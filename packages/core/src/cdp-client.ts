/**
 * CDP (Chrome DevTools Protocol) クライアントの抽象インターフェース。
 *
 * `@aria-palina/core` はこのインターフェースに対してのみ依存し、
 * 特定の実装（Playwright `CDPSession` / puppeteer / `chrome.debugger` API）に
 * 依存しない。各環境向けパッケージ (`@aria-palina/cli`, `@aria-palina/extension`)
 * が本インターフェースを満たすアダプターを実装し、`core` に注入する。
 *
 * このインターフェースの導入が、`aria-palina` 全体のコードを Node.js と
 * ブラウザ環境の両方で 100% 再利用可能にするための技術的ハイライトである。
 *
 * @see ../../../docs/dd.md §1「システムアーキテクチャ」および §4 Phase 1
 */
export interface ICDPClient {
  /**
   * CDP コマンドを送信し、結果を受け取る。
   *
   * @example
   * ```ts
   * const { nodes } = await cdp.send<{ nodes: unknown[] }>(
   *   "Accessibility.getFullAXTree",
   *   { depth: -1 },
   * );
   * ```
   */
  send<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult>;

  /**
   * CDP イベントリスナーを登録する。
   *
   * TUI/Extension モードで DOM の動的変化（モーダル展開、SPA 画面遷移など）を
   * リアルタイムに AOM ツリーへ反映するために使用する。
   *
   * @example
   * ```ts
   * cdp.on("DOM.documentUpdated", () => refreshTree());
   * ```
   */
  on(event: string, listener: (params: unknown) => void): void;

  /**
   * CDP イベントリスナーを解除する。
   */
  off(event: string, listener: (params: unknown) => void): void;
}
