export type { ICDPClient } from "./cdp-client.js";
export type { A11yNode } from "./types.js";
export type { GetFullAXTreeResult, RawAXNode, RawAXProperty, RawAXValue } from "./ax-protocol.js";
export { flattenAXTree, type FlattenOptions } from "./flatten.js";
export { buildSpeechText, type SpeechInput } from "./speech.js";
export { extractA11yTree } from "./extract.js";
export { waitForNetworkIdle, type NetworkIdleOptions } from "./wait-for-network-idle.js";
export { waitForAXStable, type AXStableOptions } from "./wait-for-ax-stable.js";
export {
  subscribeAXTreeUpdates,
  type AXUpdateCause,
  type AXUpdateOptions,
  type AXUpdateSubscription,
} from "./subscribe-ax-updates.js";
export {
  diffLiveRegions,
  type LiveChange,
  type LiveChangeKind,
  type LivePoliteness,
} from "./aria-live-diff.js";
export {
  delay,
  waitForFunction,
  waitForSelector,
  type WaitConditionOptions,
} from "./wait-conditions.js";
export { cycleKind, filterByKind, findNext, matchesKind, type NodeKind } from "./node-kind.js";
export {
  clearHighlight,
  disableOverlay,
  enableOverlay,
  highlightNode,
  scrollIntoView,
  type HighlightConfig,
  type RGBA,
} from "./highlight.js";
export { clickNode, focusNode } from "./actions.js";
