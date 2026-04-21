import { useStdin, useStdout } from "ink";
import { useEffect, useRef } from "react";

/**
 * SGR マウスプロトコル (`CSI < Cb ; Cx ; Cy M/m`) のイベント種別。
 *
 * ホイール操作は `M` で届き、通常ボタンの押下 `M` / 解放 `m` とは
 * ビットで判別する。本 TUI はホイールスクロールだけを扱うので、
 * `press` / `release` は同等に扱わず単なる参考値として渡す。
 */
export type MouseEventKind = "wheel-up" | "wheel-down" | "press" | "release";

export interface MouseEvent {
  kind: MouseEventKind;
  /** SGR `Cb` の生値 (button + modifier bits)。 */
  button: number;
  /** 1 始まりの列 (Cx)。 */
  x: number;
  /** 1 始まりの行 (Cy)。 */
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface UseMouseOptions {
  /** ホイール上方向 (or button=4) のイベント。 */
  onWheelUp?: (event: MouseEvent) => void;
  /** ホイール下方向 (or button=5) のイベント。 */
  onWheelDown?: (event: MouseEvent) => void;
  /** すべてのマウスイベントを拾いたい場合に使う汎用コールバック。 */
  onEvent?: (event: MouseEvent) => void;
}

/** SGR マウスモード有効化: `?1000h` = basic tracking (press/release + wheel), `?1006h` = SGR extended coords。 */
const ENABLE_SEQ = "\x1b[?1000h\x1b[?1006h";
/** 有効化と逆順で解除する。 */
const DISABLE_SEQ = "\x1b[?1006l\x1b[?1000l";

/**
 * SGR マウスシーケンスを抽出する正規表現。
 *
 * 例: `\x1b[<64;10;20M` → button=64 (wheel up), x=10, y=20, terminator=`M`
 */
// eslint-disable-next-line no-control-regex
const SGR_MOUSE_PATTERN = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

/**
 * 1 つ以上の SGR マウスシーケンスを含みうる文字列をパースする純粋関数。
 * マウスシーケンスを含まない文字列は空配列を返す。
 */
export function parseMouseSequence(input: string): MouseEvent[] {
  const events: MouseEvent[] = [];
  for (const match of input.matchAll(SGR_MOUSE_PATTERN)) {
    const rawButton = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    const terminator = match[4];
    const button = rawButton & 0x03;
    const shift = (rawButton & 0x04) !== 0;
    const alt = (rawButton & 0x08) !== 0;
    const ctrl = (rawButton & 0x10) !== 0;
    const isWheel = (rawButton & 0x40) !== 0;
    let kind: MouseEventKind;
    if (isWheel) {
      kind = button === 0 ? "wheel-up" : "wheel-down";
    } else {
      kind = terminator === "M" ? "press" : "release";
    }
    events.push({ kind, button: rawButton, x, y, ctrl, alt, shift });
  }
  return events;
}

/**
 * 端末のマウストラッキング (SGR モード) を有効にして、stdin に流れる
 * マウスイベントを購読するフック。
 *
 * - マウント時: `setRawMode(true)` の上で DEC private mode の有効化シーケンスを
 *   stdout に書き出す。stdout が TTY でないとき (テスト環境など) は書き出しを
 *   省略する (ink-testing-library の Stdout はフレームに積まれるため)。
 * - 入力の受け取りは Ink の `StdinContext.internal_eventEmitter` (`useInput`
 *   と同じチャネル) に乗る。パーサで SGR シーケンスを抽出し、
 *   `onWheelUp` / `onWheelDown` / `onEvent` にディスパッチする。
 * - 非マウスシーケンスを含むチャンクは `useInput` 側に素通ししてよい。
 *   SGR のシーケンス本体 (`\x1b[<...M/m`) は Ink の `parse-keypress` が
 *   既知の CSI に該当しないため「無名の入力」として落ち、既存のキーバインドを
 *   誤発火させない (意図的な副作用としてこれを前提にしている)。
 * - アンマウント時: 無効化シーケンスを書き出し、リスナを外す。
 */
export function useMouse(options: UseMouseOptions): void {
  const { stdin, setRawMode, isRawModeSupported, internal_eventEmitter } = useStdin();
  const { stdout } = useStdout();
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    if (!isRawModeSupported) return;
    setRawMode(true);
    const writeToStdout = (stdout as NodeJS.WriteStream | undefined)?.isTTY === true;
    if (writeToStdout && stdout) stdout.write(ENABLE_SEQ);

    const handler = (chunk: unknown): void => {
      const str =
        typeof chunk === "string"
          ? chunk
          : chunk instanceof Uint8Array
            ? Buffer.from(chunk).toString("utf8")
            : String(chunk);
      if (!str.includes("\x1b[<")) return;
      const events = parseMouseSequence(str);
      const cb = optsRef.current;
      for (const e of events) {
        cb.onEvent?.(e);
        if (e.kind === "wheel-up") cb.onWheelUp?.(e);
        if (e.kind === "wheel-down") cb.onWheelDown?.(e);
      }
    };
    internal_eventEmitter?.on("input", handler);

    return () => {
      internal_eventEmitter?.off("input", handler);
      if (writeToStdout && stdout) stdout.write(DISABLE_SEQ);
      setRawMode(false);
    };
  }, [isRawModeSupported, setRawMode, internal_eventEmitter, stdin, stdout]);
}
