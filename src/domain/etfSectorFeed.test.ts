import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetEtfSectorFeedMemo,
  loadEtfSectorFeed,
  parseEtfSectorFeed,
  sectorWeightsFor,
  type EtfSectorFeed,
} from "./etfSectorFeed";
import {
  buildSectorBreakdown,
  type BreakdownEntry,
  type AnalyticsPosition,
} from "./portfolioAnalytics";
import { resolveCanonicalSectorLabel } from "./canonicalSector";

// A trimmed real sample captured from scripts/etf-feed/build_feed.py (canonical
// keys, already mapped through plan 070). VOO = equity (11 sectors), BND = bond
// (empty sectorWeights, stock≈0) → must fall through to the 068 bucket.
const SAMPLE: EtfSectorFeed = {
  schemaVersion: 1,
  source: "yahoo/yfinance@1.2.0",
  generatedAt: "2026-06-26T08:13:38Z",
  funds: {
    VOO: {
      asOf: "2026-06-26T08:13:37Z",
      assetClasses: { stock: 0.9963, bond: 0, cash: 0.0019, other: 0.0018 },
      sectorWeights: [
        { sector: "technology", weight: 0.3913 },
        { sector: "financials", weight: 0.1092 },
        { sector: "communication", weight: 0.1066 },
        { sector: "healthcare", weight: 0.0832 },
      ],
    },
    BND: {
      asOf: "2026-06-26T08:13:37Z",
      assetClasses: { stock: 0, bond: 0.998, cash: 0.002, other: 0 },
      sectorWeights: [],
    },
  },
};

describe("parseEtfSectorFeed", () => {
  it("parses a well-formed feed into canonical-keyed weights", () => {
    const feed = parseEtfSectorFeed(SAMPLE);
    expect(feed).not.toBeNull();
    expect(feed!.funds.VOO.sectorWeights[0]).toEqual({ sector: "technology", weight: 0.3913 });
    expect(feed!.funds.BND.sectorWeights).toEqual([]);
  });

  it("drops malformed weight rows and non-positive weights", () => {
    const feed = parseEtfSectorFeed({
      funds: {
        X: {
          sectorWeights: [
            { sector: "technology", weight: 0.5 },
            { sector: "energy", weight: 0 }, // dropped (non-positive)
            { sector: 123, weight: 0.2 }, // dropped (bad sector)
            { weight: 0.1 }, // dropped (no sector)
          ],
        },
      },
    });
    expect(feed!.funds.X.sectorWeights).toEqual([{ sector: "technology", weight: 0.5 }]);
  });

  it("returns null for non-feed input", () => {
    expect(parseEtfSectorFeed(null)).toBeNull();
    expect(parseEtfSectorFeed({})).toBeNull();
    expect(parseEtfSectorFeed({ funds: 7 })).toBeNull();
  });
});

describe("sectorWeightsFor", () => {
  const loaded = {
    feed: SAMPLE,
    byTicker: new Map(Object.entries(SAMPLE.funds).map(([t, e]) => [t.toUpperCase(), e])),
  };

  it("returns canonical weights for an equity ETF (case-insensitive ticker)", () => {
    expect(sectorWeightsFor(loaded, "voo")).toHaveLength(4);
    expect(sectorWeightsFor(loaded, "VOO")![0].sector).toBe("technology");
  });

  it("returns null for a bond ETF (empty weights) → caller uses the 068 bucket", () => {
    expect(sectorWeightsFor(loaded, "BND")).toBeNull();
  });

  it("returns null for an unknown ticker or empty input", () => {
    expect(sectorWeightsFor(loaded, "NOPE")).toBeNull();
    expect(sectorWeightsFor(loaded, null)).toBeNull();
  });
});

describe("loadEtfSectorFeed (bundled + public, injectable seams)", () => {
  beforeEach(() => {
    __resetEtfSectorFeedMemo();
    vi.unstubAllGlobals();
  });

  it("merges bundled snapshot over the public feed (bundled wins)", async () => {
    const publicFeed: EtfSectorFeed = {
      schemaVersion: 1,
      funds: { VTI: { sectorWeights: [{ sector: "technology", weight: 0.3 }] } },
    };
    const bundled: EtfSectorFeed = {
      schemaVersion: 1,
      funds: { VOO: { sectorWeights: [{ sector: "energy", weight: 0.9 }] } },
    };
    const fetcher = async (url: string) =>
      JSON.stringify(url.startsWith("/") ? bundled : publicFeed);
    const loaded = await loadEtfSectorFeed({ fetcher, forceReload: true });
    expect(sectorWeightsFor(loaded, "VOO")).not.toBeNull(); // bundled
    expect(sectorWeightsFor(loaded, "VTI")).not.toBeNull(); // public on-demand
  });

  it("bundledOnly skips the public pull entirely (no network for the long tail)", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return JSON.stringify(SAMPLE);
    };
    await loadEtfSectorFeed({ fetcher, bundledOnly: true, forceReload: true });
    expect(calls.every((u) => u.startsWith("/"))).toBe(true); // only the bundled relative path
  });

  it("degrades to an empty feed when nothing loads (analytics → bucket)", async () => {
    const fetcher = async () => {
      throw new Error("offline");
    };
    const loaded = await loadEtfSectorFeed({ fetcher, bundledOnly: true, forceReload: true });
    expect(sectorWeightsFor(loaded, "VOO")).toBeNull();
  });
});

describe("feed weights → buildSectorBreakdown (068 weighted split lights up)", () => {
  const sectorOpts = {
    sectorLabelOf: (raw: string | null | undefined) => raw ?? null,
    canonicalLabelOf: (key: string | null | undefined) =>
      resolveCanonicalSectorLabel(key, "zh-Hant"),
    etfBucket: "ETF / 基金",
    unknownLabel: "未知",
    otherLabel: "其他",
  };
  const pos = (p: Partial<AnalyticsPosition>): AnalyticsPosition => ({
    assetId: p.assetId ?? "a",
    ticker: p.ticker ?? "VOO",
    quantity: 1,
    currency: "USD",
    isManual: false,
    ...p,
  });

  it("splits an equity ETF by the feed's canonical weights; Σ = position value, 其他 remainder", () => {
    const loaded = {
      feed: SAMPLE,
      byTicker: new Map(Object.entries(SAMPLE.funds).map(([t, e]) => [t.toUpperCase(), e])),
    };
    const entries: BreakdownEntry[] = [
      {
        position: pos({
          ticker: "VOO",
          assetType: "etf",
          sectorWeights: sectorWeightsFor(loaded, "VOO"),
        }),
        value: 1000,
      },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    const byLabel = new Map(b.buckets.map((x) => [x.label, x.value]));
    // Coverage 0.6903 < 1 → 30.97% remainder to 其他; Σ stays = value.
    expect(byLabel.get("資訊科技")).toBeCloseTo(391.3);
    expect(byLabel.get("金融")).toBeCloseTo(109.2);
    expect(byLabel.get("其他")).toBeCloseTo(309.7, 1); // 1000 × (1 − 0.6903)
    expect(b.total).toBeCloseTo(1000);
    expect(b.buckets.reduce((s, x) => s + x.value, 0)).toBeCloseTo(1000);
  });

  it("a bond ETF (empty feed weights) falls through to the 068 ETF/fund bucket", () => {
    const loaded = {
      feed: SAMPLE,
      byTicker: new Map(Object.entries(SAMPLE.funds).map(([t, e]) => [t.toUpperCase(), e])),
    };
    const entries: BreakdownEntry[] = [
      {
        position: pos({
          ticker: "BND",
          assetType: "etf",
          sectorWeights: sectorWeightsFor(loaded, "BND"),
        }),
        value: 500,
      },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    expect(b.buckets.map((x) => x.label)).toEqual(["ETF / 基金"]);
    expect(b.buckets[0].value).toBeCloseTo(500);
  });

  it("a manual (069) locked tag beats the fetched feed weights", () => {
    const loaded = {
      feed: SAMPLE,
      byTicker: new Map(Object.entries(SAMPLE.funds).map(([t, e]) => [t.toUpperCase(), e])),
    };
    const entries: BreakdownEntry[] = [
      {
        position: pos({
          ticker: "VOO",
          assetType: "etf",
          sector: "energy", // manual tag
          classificationLocked: true,
          sectorWeights: sectorWeightsFor(loaded, "VOO"),
        }),
        value: 800,
      },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    // The locked energy tag wins outright — the whole value lands in 能源, not split.
    expect(b.buckets.map((x) => x.label)).toEqual(["能源"]);
    expect(b.buckets[0].value).toBeCloseTo(800);
  });
});
