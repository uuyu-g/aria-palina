/**
 * `ICDPClient` を介して CDP `Accessibility.getFullAXTree` コマンドを発行し、
 * 応答を `flattenAXTree` で平坦化して `A11yNode[]` を返すエントリーポイント。
 *
 * ここが `@aria-palina/core` の「外から叩く側」の入り口であり、
 * `@aria-palina/cli` / `@aria-palina/extension` の各アダプターはそれぞれ
 * 異なる `ICDPClient` 実装 (Playwright `CDPSession` / `chrome.debugger`
 * API / ...) をここに注入する。
 *
 * なお `Accessibility.enable` の発行は行わない。CDP 仕様上 `getFullAXTree` は
 * `Accessibility` ドメインを明示的に enable しなくても動作するため、アダプタ
 * 層で必要に応じて enable する責務を負う。
 *
 * @see ../../../docs/dd.md §4 Phase 2
 */

import type { GetFullAXTreeResult } from "./ax-protocol.js";
import type { ICDPClient } from "./cdp-client.js";
import { flattenAXTree, type FlattenOptions } from "./flatten.js";
import type { A11yNode } from "./types.js";

/**
 * 注入された `ICDPClient` を使って現在のページの AOM を抽出し、
 * 平坦化された `A11yNode[]` を返す。
 */
export async function extractA11yTree(
  cdp: ICDPClient,
  options?: FlattenOptions,
): Promise<A11yNode[]> {
  const { nodes } = await cdp.send<GetFullAXTreeResult>("Accessibility.getFullAXTree");
  return flattenAXTree(nodes, options);
}
