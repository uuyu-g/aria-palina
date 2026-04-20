import type { MinimalCDPSession } from "./playwright-cdp-adapter.js";

export interface BrowserHandle {
  newCDPSessionForUrl(url: string): Promise<MinimalCDPSession>;
  close(): Promise<void>;
}

export interface BrowserFactoryOptions {
  headed: boolean;
  persist: boolean;
  userDataDir: string | undefined;
}

export type BrowserFactory = (opts: BrowserFactoryOptions) => Promise<BrowserHandle>;
