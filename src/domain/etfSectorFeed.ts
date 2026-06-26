/**
 * Client-side ETF sector-feed loader (Plan 071).
 *
 * Two-tier, privacy-preserving (mirrors the bundled bank-logo pattern):
 *  1. **Bundled snapshot** — load `public/etf-sector-feed.json` (injected at build
 *     from `private-assets/etf/…`) for the zero-network common case.
 *  2. **On-demand public pull** — for a ticker missing from the bundled snapshot,
 *     fetch the WHOLE public Pages feed once (a generic GET of a single static
 *     file at a fixed path — the request encodes NO per-ticker / holding-revealing
 *     params), cache the parsed feed locally with a weekly TTL.
 *
 * The feed is USER-AGNOSTIC public ETF facts only — no user id, no holdings ever
 * leave the device. This module NEVER does per-held-ticker authenticated queries.
 *
 * The feed bakes in Plan 070 **canonical** sector keys (mapped server-side in
 * `scripts/etf-feed/build_feed.py`), so this module stays dumb: it just exposes
 * `{ ticker → sectorWeights }` and lets `buildSectorBreakdown` attribute value.
 */

import type { CanonicalSectorKey } from "./canonicalSector";

export interface EtfSectorWeight {
  /** Canonical (Plan 070) sector key, already mapped server-side. */
  sector: CanonicalSectorKey | string;
  /** Share of the fund (0–1). */
  weight: number;
}

export interface EtfAssetClasses {
  stock: number;
  bond: number;
  cash: number;
  other: number;
}

export interface EtfFundEntry {
  asOf?: string;
  assetClasses?: EtfAssetClasses;
  /** Canonical-keyed weights; empty for bond / no-sector ETFs (→ 068 bucket). */
  sectorWeights: EtfSectorWeight[];
}

export interface EtfSectorFeed {
  schemaVersion: number;
  source?: string;
  generatedAt?: string;
  funds: Record<string, EtfFundEntry>;
}

const CACHE_KEY = "northstar.etfSectorFeed.v1";
const WEEKLY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedFeed {
  fetchedAt: number;
  feed: EtfSectorFeed;
}

/** A parsed feed plus a `Map` for O(1) per-ticker lookups (tickers upper-cased). */
export interface LoadedFeed {
  feed: EtfSectorFeed;
  byTicker: Map<string, EtfFundEntry>;
}

function indexFeed(feed: EtfSectorFeed): LoadedFeed {
  const byTicker = new Map<string, EtfFundEntry>();
  for (const [ticker, entry] of Object.entries(feed.funds ?? {})) {
    byTicker.set(normalizeTicker(ticker), entry);
  }
  return { feed, byTicker };
}

/** Normalize a ticker to the feed's key convention (trim + upper-case). */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/**
 * Validate + normalize an untrusted JSON blob into an `EtfSectorFeed`, or null
 * when it doesn't match the schema. Defensive: a malformed feed must degrade to
 * "no weights" (→ the 068 bucket), never throw into the analytics render.
 */
export function parseEtfSectorFeed(raw: unknown): EtfSectorFeed | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const fundsRaw = obj.funds;
  if (!fundsRaw || typeof fundsRaw !== "object") return null;

  const funds: Record<string, EtfFundEntry> = {};
  for (const [ticker, value] of Object.entries(fundsRaw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const weightsRaw = Array.isArray(entry.sectorWeights) ? entry.sectorWeights : [];
    const sectorWeights: EtfSectorWeight[] = [];
    for (const w of weightsRaw) {
      if (!w || typeof w !== "object") continue;
      const ww = w as Record<string, unknown>;
      const sector = typeof ww.sector === "string" ? ww.sector : null;
      const weight = typeof ww.weight === "number" && Number.isFinite(ww.weight) ? ww.weight : null;
      if (sector && weight !== null && weight > 0) sectorWeights.push({ sector, weight });
    }
    const ac = entry.assetClasses as Record<string, unknown> | undefined;
    const assetClasses: EtfAssetClasses | undefined = ac
      ? {
          stock: num(ac.stock),
          bond: num(ac.bond),
          cash: num(ac.cash),
          other: num(ac.other),
        }
      : undefined;
    funds[ticker] = {
      asOf: typeof entry.asOf === "string" ? entry.asOf : undefined,
      assetClasses,
      sectorWeights,
    };
  }

  return {
    schemaVersion: typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1,
    source: typeof obj.source === "string" ? obj.source : undefined,
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : undefined,
    funds,
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ─── Network / storage seams (overridable for tests) ─────────────────────────

type Fetcher = (url: string) => Promise<string>;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Default fetcher: bundled snapshot via a plain relative GET; the public feed via
 * the locked native bridge (Tauri) or the dev vite proxy. Same shape as the
 * SITCA/TWSE providers — a single fixed URL, no per-ticker params.
 */
async function defaultFetch(url: string): Promise<string> {
  // Bundled snapshot (relative path served from `public/`).
  if (url.startsWith("/")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`bundled ETF feed HTTP ${res.status}`);
    return res.text();
  }
  // Public Pages feed — route through the allowlisted bridge / proxy.
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("fetch_market_data", { url, responseType: "text" });
  }
  const res = await fetch(`/api/market-data?url=${encodeURIComponent(url)}&responseType=text`);
  if (!res.ok) throw new Error(`ETF feed HTTP ${res.status}`);
  return res.text();
}

function readCache(): CachedFeed | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFeed;
    if (!parsed || typeof parsed.fetchedAt !== "number" || !parsed.feed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(feed: EtfSectorFeed): void {
  try {
    const payload: CachedFeed = { fetchedAt: Date.now(), feed };
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // jsdom / private-mode / quota — caching is best-effort.
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

let memoized: Promise<LoadedFeed> | null = null;

/**
 * Load the merged feed: bundled snapshot ∪ (cached-or-freshly-pulled public feed).
 * Bundled entries win on conflict (release-pinned, no network). Memoized for the
 * session; pass `forceReload` to bypass.
 */
export async function loadEtfSectorFeed(opts?: {
  fetcher?: Fetcher;
  bundledPath?: string;
  publicUrl?: string;
  /** Skip the on-demand public pull (e.g. demo mode / offline) — bundled only. */
  bundledOnly?: boolean;
  forceReload?: boolean;
}): Promise<LoadedFeed> {
  if (memoized && !opts?.forceReload && !opts?.fetcher) return memoized;

  const run = async (): Promise<LoadedFeed> => {
    const { BUNDLED_ETF_FEED_PATH, PUBLIC_ETF_FEED_URL } = await import("./etfSectorAssets");
    const fetcher = opts?.fetcher ?? defaultFetch;
    const bundledPath = opts?.bundledPath ?? BUNDLED_ETF_FEED_PATH;
    const publicUrl = opts?.publicUrl ?? PUBLIC_ETF_FEED_URL;

    const merged: Record<string, EtfFundEntry> = {};

    // 1) Public feed — prefer a fresh-enough cache; else pull once (best-effort).
    if (!opts?.bundledOnly) {
      const cached = readCache();
      if (cached && Date.now() - cached.fetchedAt < WEEKLY_TTL_MS) {
        Object.assign(merged, cached.feed.funds ?? {});
      } else {
        try {
          const text = await fetcher(publicUrl);
          const feed = parseEtfSectorFeed(JSON.parse(text));
          if (feed) {
            Object.assign(merged, feed.funds);
            writeCache(feed);
          } else if (cached) {
            Object.assign(merged, cached.feed.funds ?? {}); // stale beats nothing
          }
        } catch {
          if (cached) Object.assign(merged, cached.feed.funds ?? {}); // offline → stale cache
        }
      }
    }

    // 2) Bundled snapshot — overlays (release-pinned facts win, zero-network).
    try {
      const text = await fetcher(bundledPath);
      const feed = parseEtfSectorFeed(JSON.parse(text));
      if (feed) Object.assign(merged, feed.funds);
    } catch {
      // No bundled snapshot in this build — fine, public/cache covers it.
    }

    return indexFeed({ schemaVersion: 1, funds: merged });
  };

  const promise = run();
  if (!opts?.forceReload && !opts?.fetcher) memoized = promise;
  return promise;
}

/** Reset the session memo (tests). */
export function __resetEtfSectorFeedMemo(): void {
  memoized = null;
}

/**
 * Canonical sector weights for a ticker from a loaded feed, or null when absent
 * or bond/no-sector (empty weights) — both cases tell the caller to use the 068
 * bucket. Pure (no I/O), so it's trivially testable.
 */
export function sectorWeightsFor(
  loaded: LoadedFeed,
  ticker: string | null | undefined,
): EtfSectorWeight[] | null {
  if (!ticker) return null;
  const entry = loaded.byTicker.get(normalizeTicker(ticker));
  if (!entry || entry.sectorWeights.length === 0) return null;
  return entry.sectorWeights;
}
