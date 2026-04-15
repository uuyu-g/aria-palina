import { describe, expect, test } from "vite-plus/test";
import { computeWindow } from "../virtual-window.js";

describe("computeWindow", () => {
  test("先頭付近ではカーソルを中央化できず start=0 で固定される", () => {
    const w = computeWindow({ total: 100, cursor: 0, viewport: 10 });
    expect(w).toEqual({ start: 0, end: 10 });
  });

  test("中央付近ではカーソルをビューポート中央に配置する", () => {
    const w = computeWindow({ total: 100, cursor: 50, viewport: 10 });
    // viewport=10, half=5 なので cursor(50) - 5 = 45 が start となる。
    expect(w).toEqual({ start: 45, end: 55 });
  });

  test("末尾付近でも viewport 分の行が描画される (末尾前詰め)", () => {
    const w = computeWindow({ total: 100, cursor: 99, viewport: 10 });
    expect(w).toEqual({ start: 90, end: 100 });
  });

  test("viewport が total を超える場合は全件を返す", () => {
    const w = computeWindow({ total: 3, cursor: 1, viewport: 10 });
    expect(w).toEqual({ start: 0, end: 3 });
  });

  test("total=0 の場合は空レンジを返す", () => {
    const w = computeWindow({ total: 0, cursor: 0, viewport: 10 });
    expect(w).toEqual({ start: 0, end: 0 });
  });

  test("カーソルが total を超えた場合は末尾にクランプされる", () => {
    const w = computeWindow({ total: 20, cursor: 999, viewport: 5 });
    expect(w.end).toBe(20);
    expect(w.start).toBe(15);
  });

  test("カーソルが負数の場合は 0 にクランプされる", () => {
    const w = computeWindow({ total: 20, cursor: -5, viewport: 5 });
    expect(w).toEqual({ start: 0, end: 5 });
  });

  test("viewport=1 でもカーソルが可視範囲に必ず含まれる", () => {
    const w = computeWindow({ total: 50, cursor: 30, viewport: 1 });
    expect(w.start).toBeLessThanOrEqual(30);
    expect(w.end).toBeGreaterThan(30);
    expect(w.end - w.start).toBe(1);
  });

  test("カーソルは必ず [start, end) の範囲に含まれる (任意の位置)", () => {
    for (const cursor of [0, 1, 5, 10, 42, 99]) {
      const w = computeWindow({ total: 100, cursor, viewport: 12 });
      expect(w.start).toBeLessThanOrEqual(cursor);
      expect(w.end).toBeGreaterThan(cursor);
    }
  });
});
