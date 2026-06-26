/**
 * Bundled ETF sector-feed snapshot accessor (Plan 071).
 *
 * Mirrors the bundled bank-logo pattern (`bankLogoAssets.ts` + `public/bank/*`):
 * official builds inject a small common-ETF snapshot into `public/` at build time
 * (`scripts/inject-private-assets.mjs` copies `private-assets/etf/etf-sector-feed.json`
 * → `public/etf-sector-feed.json`). The snapshot lets the weighted sector split light
 * up for the common case with **zero network**. Missing file is fine — the client
 * falls back to the on-demand public feed pull (see `etfSectorFeed.ts`).
 *
 * The snapshot is a USER-AGNOSTIC public reference file (public ETF facts only,
 * keyed by public ticker) — never a user id, never holdings. Keep it that way.
 */

/** Path of the bundled snapshot (served from `public/` at the app root). */
export const BUNDLED_ETF_FEED_PATH = "/etf-sector-feed.json";

/**
 * Public Pages feed for the long-tail on-demand pull (a single static file, whole
 * file at a fixed path — the request carries NO per-ticker / holding-revealing
 * params). Host + path are the exact pair allowlisted in the native bridge
 * (`src-tauri/src/lib.rs`) and the vite proxy.
 */
export const PUBLIC_ETF_FEED_URL = "https://larryjclai.github.io/northstar/etf-sector-feed.json";
