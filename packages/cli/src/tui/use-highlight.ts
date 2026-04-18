import { useEffect } from "react";

/**
 * TUI から CDP `Overlay` に対してハイライト指示を出すための薄いインターフェース。
 *
 * `runTui` は `--headed` 指定時にこの実装を構築し、headless 時は `null` を
 * 渡す。`App` はこの 2 値分岐だけを意識すればよい。
 */
export interface HighlightController {
  /** 指定 backendNodeId をブラウザ画面でハイライトする (fire-and-forget)。 */
  highlight(backendNodeId: number): void;
  /** 現在のハイライトを消す (fire-and-forget)。 */
  clear(): void;
}

export interface UseHighlightOptions {
  /**
   * カーソル変更時に CDP コマンドを発行するまでの遅延 (ms)。
   * `j` 連打で CDP が氾濫するのを抑える。
   * @default 50
   */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 50;

/**
 * `backendNodeId` の変化を監視し、debounce 後に
 * `controller.highlight(backendNodeId)` を呼ぶ React フック。
 *
 * `controller` が `null` の場合 (headless モード) は完全に no-op。
 * アンマウント時は `controller.clear()` を呼んで残留ハイライトを消す。
 */
export function useHighlight(
  controller: HighlightController | null,
  backendNodeId: number,
  options?: UseHighlightOptions,
): void {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  useEffect(() => {
    if (controller === null) return;
    if (debounceMs <= 0) {
      controller.highlight(backendNodeId);
      return;
    }
    const timer = setTimeout(() => controller.highlight(backendNodeId), debounceMs);
    return () => clearTimeout(timer);
  }, [controller, backendNodeId, debounceMs]);

  useEffect(() => {
    if (controller === null) return;
    return () => controller.clear();
  }, [controller]);
}
