import { describe, expect, test } from "vite-plus/test";

import type { GetFullAXTreeResult, RawAXNode } from "../ax-protocol.js";
import type { ICDPClient } from "../cdp-client.js";
import { extractA11yTree } from "../extract.js";

/**
 * `ICDPClient` の**フェイク実装** (古典派スタイル)。
 *
 * vi.fn() による相互作用検証ではなく、あらかじめ登録したコマンドの応答を
 * 返す「動く実装」として振る舞わせる。テストは `extractA11yTree` の
 * **戻り値の状態** を比較することで振る舞いを検証する。
 *
 * 未登録のコマンドが叩かれた場合は `Error` を投げることで、本物のクライアント
 * と同様の失敗を再現する (= テストが意図しない経路を検知できる)。
 */
class FakeCDPClient implements ICDPClient {
  private readonly responses = new Map<string, unknown>();

  setResponse<T>(method: string, result: T): void {
    this.responses.set(method, result);
  }

  send<TResult = unknown>(method: string): Promise<TResult> {
    if (!this.responses.has(method)) {
      return Promise.reject(new Error(`FakeCDPClient: no response for ${method}`));
    }
    return Promise.resolve(this.responses.get(method) as TResult);
  }

  on(): void {
    // 本テストではイベントを使わない。
  }

  off(): void {
    // 本テストではイベントを使わない。
  }
}

function fakeClientWith(result: GetFullAXTreeResult): FakeCDPClient {
  const client = new FakeCDPClient();
  client.setResponse("Accessibility.getFullAXTree", result);
  return client;
}

describe("extractA11yTree", () => {
  test("単一ノードの CDP 応答を A11yNode の配列に変換する", async () => {
    const nodes: RawAXNode[] = [
      {
        nodeId: "1",
        ignored: false,
        role: { type: "role", value: "main" },
        name: { type: "computedString", value: "メイン" },
      },
    ];
    const tree = await extractA11yTree(fakeClientWith({ nodes }));

    expect(tree).toHaveLength(1);
    expect(tree[0]?.role).toBe("main");
    expect(tree[0]?.name).toBe("メイン");
    expect(tree[0]?.speechText).toBe("[メイン] メイン");
    expect(tree[0]?.depth).toBe(0);
  });

  test("CDP が空の nodes を返したときは空配列を返す", async () => {
    const tree = await extractA11yTree(fakeClientWith({ nodes: [] }));
    expect(tree).toEqual([]);
  });

  test("多段ツリーが DFS 順で平坦化される", async () => {
    const tree = await extractA11yTree(
      fakeClientWith({
        nodes: [
          {
            nodeId: "r",
            ignored: false,
            role: { type: "role", value: "main" },
            childIds: ["c"],
          },
          {
            nodeId: "c",
            parentId: "r",
            ignored: false,
            role: { type: "role", value: "button" },
            name: { type: "computedString", value: "送信" },
          },
        ],
      }),
    );
    expect(tree.map((n) => [n.role, n.depth, n.speechText])).toEqual([
      ["main", 0, "[メイン]"],
      ["button", 1, "[ボタン] 送信"],
    ]);
  });

  test("Accessibility.getFullAXTree 以外のメソッドは叩かれない", async () => {
    // フェイクは未登録メソッドで reject する。`extractA11yTree` が
    // `getFullAXTree` 以外を呼ぶとこのテストは例外で失敗する
    // (= 実装から不要な CDP 副作用が漏れていないことを状態ベースで検証)。
    const client = new FakeCDPClient();
    client.setResponse<GetFullAXTreeResult>("Accessibility.getFullAXTree", { nodes: [] });
    await expect(extractA11yTree(client)).resolves.toEqual([]);
  });
});
