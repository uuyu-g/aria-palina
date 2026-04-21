import { describe, expect, test } from "vite-plus/test";
import { parseMouseSequence } from "../tui/use-mouse.js";

describe("parseMouseSequence", () => {
  test("ホイール上方向は wheel-up として解釈される", () => {
    // SGR: Cb=64 (0x40) → wheel bit + button=0 → wheel-up
    const events = parseMouseSequence("\u001B[<64;10;20M");
    expect(events).toEqual([
      { kind: "wheel-up", button: 64, x: 10, y: 20, ctrl: false, alt: false, shift: false },
    ]);
  });

  test("ホイール下方向は wheel-down として解釈される", () => {
    // SGR: Cb=65 (0x40|0x01) → wheel bit + button=1 → wheel-down
    const events = parseMouseSequence("\u001B[<65;5;7M");
    expect(events).toEqual([
      { kind: "wheel-down", button: 65, x: 5, y: 7, ctrl: false, alt: false, shift: false },
    ]);
  });

  test("ホイールに Shift/Ctrl/Alt が合成されてもフラグが立つ", () => {
    // Cb = 64 (wheel up) | 0x04 (shift) | 0x10 (ctrl) = 84
    const [event] = parseMouseSequence("\u001B[<84;1;2M");
    expect(event).toEqual({
      kind: "wheel-up",
      button: 84,
      x: 1,
      y: 2,
      ctrl: true,
      alt: false,
      shift: true,
    });
  });

  test("左ボタン press/release は press/release として解釈される", () => {
    const press = parseMouseSequence("\u001B[<0;3;4M");
    const release = parseMouseSequence("\u001B[<0;3;4m");
    expect(press[0]?.kind).toBe("press");
    expect(release[0]?.kind).toBe("release");
  });

  test("マウス以外の制御シーケンスは無視される", () => {
    expect(parseMouseSequence("\u001B[A")).toEqual([]); // 上矢印キー
    expect(parseMouseSequence("hello")).toEqual([]);
    expect(parseMouseSequence("")).toEqual([]);
  });

  test("1 つのチャンクに複数のマウスシーケンスが含まれていてもすべて拾う", () => {
    const events = parseMouseSequence("\u001B[<64;1;1M\u001B[<65;2;2M");
    expect(events.map((e) => e.kind)).toEqual(["wheel-up", "wheel-down"]);
  });

  test("前後に混ざった非マウス文字列はスキップしてマウス部分だけを取る", () => {
    const events = parseMouseSequence("prefix\u001B[<64;1;1Msuffix");
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("wheel-up");
  });
});
