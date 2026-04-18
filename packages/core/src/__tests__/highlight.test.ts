import { describe, expect, test, vi } from "vite-plus/test";
import { clearHighlight, disableOverlay, enableOverlay, highlightNode } from "../highlight.js";
import type { ICDPClient } from "../cdp-client.js";

interface SendCall {
  method: string;
  params: Record<string, unknown> | undefined;
}

function recordingClient(): { client: ICDPClient; calls: SendCall[] } {
  const calls: SendCall[] = [];
  const client: ICDPClient = {
    send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params });
      return {};
    }) as ICDPClient["send"],
    on: vi.fn(),
    off: vi.fn(),
  };
  return { client, calls };
}

describe("enableOverlay", () => {
  test("Overlay.enable コマンドを 1 度だけ送る", async () => {
    const { client, calls } = recordingClient();
    await enableOverlay(client);
    expect(calls).toEqual([{ method: "Overlay.enable", params: undefined }]);
  });
});

describe("disableOverlay", () => {
  test("Overlay.disable コマンドを送る", async () => {
    const { client, calls } = recordingClient();
    await disableOverlay(client);
    expect(calls).toEqual([{ method: "Overlay.disable", params: undefined }]);
  });
});

describe("highlightNode", () => {
  test("backendNodeId と既定の青色 contentColor を Overlay.highlightNode に渡す", async () => {
    const { client, calls } = recordingClient();
    await highlightNode(client, 42);
    expect(calls).toEqual([
      {
        method: "Overlay.highlightNode",
        params: {
          highlightConfig: {
            contentColor: { r: 0, g: 120, b: 255, a: 0.5 },
          },
          backendNodeId: 42,
        },
      },
    ]);
  });

  test("backendNodeId が 0 の場合は Overlay コマンドを発行しない", async () => {
    const { client, calls } = recordingClient();
    await highlightNode(client, 0);
    expect(calls).toEqual([]);
  });

  test("カスタム HighlightConfig が指定された場合はそれをマージして送る", async () => {
    const { client, calls } = recordingClient();
    await highlightNode(client, 7, {
      contentColor: { r: 255, g: 0, b: 0, a: 0.3 },
      paddingColor: { r: 0, g: 255, b: 0, a: 0.2 },
    });
    expect(calls).toEqual([
      {
        method: "Overlay.highlightNode",
        params: {
          highlightConfig: {
            contentColor: { r: 255, g: 0, b: 0, a: 0.3 },
            paddingColor: { r: 0, g: 255, b: 0, a: 0.2 },
          },
          backendNodeId: 7,
        },
      },
    ]);
  });
});

describe("clearHighlight", () => {
  test("Overlay.hideHighlight コマンドを送る", async () => {
    const { client, calls } = recordingClient();
    await clearHighlight(client);
    expect(calls).toEqual([{ method: "Overlay.hideHighlight", params: undefined }]);
  });
});
