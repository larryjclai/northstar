import { describe, expect, it } from "vitest";
import {
  CANONICAL_SECTOR_KEYS,
  CANONICAL_SECTOR_LABELS,
  resolveCanonicalSectorLabel,
  toCanonicalSector,
  type CanonicalSectorKey,
} from "./canonicalSector";

// The exhaustive TWSE 產業別 code → canonical expectation table. Mirrors the plan
// and is the reviewable, finance-correctness-sensitive artifact.
const TWSE_EXPECTATIONS: Array<[string, CanonicalSectorKey]> = [
  // technology
  ["13", "technology"],
  ["24", "technology"],
  ["25", "technology"],
  ["26", "technology"],
  ["28", "technology"],
  ["29", "technology"],
  ["30", "technology"],
  ["31", "technology"],
  ["36", "technology"],
  // communication
  ["27", "communication"],
  // financials
  ["17", "financials"],
  // healthcare
  ["7", "healthcare"],
  ["22", "healthcare"],
  // materials
  ["1", "materials"],
  ["3", "materials"],
  ["8", "materials"],
  ["9", "materials"],
  ["10", "materials"],
  ["11", "materials"],
  ["21", "materials"],
  // industrials
  ["5", "industrials"],
  ["6", "industrials"],
  ["14", "industrials"],
  ["15", "industrials"],
  ["35", "industrials"],
  // consumer_cyclical
  ["4", "consumer_cyclical"],
  ["12", "consumer_cyclical"],
  ["16", "consumer_cyclical"],
  ["18", "consumer_cyclical"],
  ["32", "consumer_cyclical"],
  ["34", "consumer_cyclical"],
  ["37", "consumer_cyclical"],
  ["38", "consumer_cyclical"],
  // consumer_defensive
  ["2", "consumer_defensive"],
  ["33", "consumer_defensive"],
  // utilities
  ["23", "utilities"],
  // other
  ["19", "other"],
  ["20", "other"],
  ["80", "other"],
];

describe("toCanonicalSector — TWSE codes", () => {
  it.each(TWSE_EXPECTATIONS)("code %s → %s", (code, expected) => {
    expect(toCanonicalSector({ sector: code })).toBe(expected);
  });

  it("accepts zero-padded codes", () => {
    expect(toCanonicalSector({ sector: "01" })).toBe("materials"); // 水泥
    expect(toCanonicalSector({ sector: "07" })).toBe("healthcare");
  });

  it("asserts the documented judgment calls explicitly", () => {
    expect(toCanonicalSector({ sector: "7" })).toBe("healthcare"); // not materials
    expect(toCanonicalSector({ sector: "12" })).toBe("consumer_cyclical"); // not industrials
    expect(toCanonicalSector({ sector: "23" })).toBe("utilities"); // not energy
  });
});

describe("toCanonicalSector — Yahoo / yfinance GICS names", () => {
  const cases: Array<[string, CanonicalSectorKey]> = [
    ["Technology", "technology"],
    ["Information Technology", "technology"],
    ["information_technology", "technology"],
    ["Financial Services", "financials"],
    ["Financials", "financials"],
    ["Healthcare", "healthcare"],
    ["Health Care", "healthcare"],
    ["Consumer Cyclical", "consumer_cyclical"],
    ["Consumer Discretionary", "consumer_cyclical"],
    ["Consumer Defensive", "consumer_defensive"],
    ["Consumer Staples", "consumer_defensive"],
    ["Industrials", "industrials"],
    ["Energy", "energy"],
    ["Basic Materials", "materials"],
    ["Materials", "materials"],
    ["Real Estate", "real_estate"],
    ["realestate", "real_estate"],
    ["Utilities", "utilities"],
    ["Communication Services", "communication"],
  ];
  it.each(cases)("name %s → %s", (name, expected) => {
    expect(toCanonicalSector({ sector: name })).toBe(expected);
  });
});

describe("toCanonicalSector — cross-market alignment (the point)", () => {
  it("TW 半導體 (24) and US Technology both land in technology", () => {
    expect(toCanonicalSector({ sector: "24" })).toBe("technology");
    expect(toCanonicalSector({ sector: "Technology" })).toBe("technology");
  });
});

describe("toCanonicalSector — fallbacks", () => {
  it("uses industry as a backstop when sector is unclassifiable", () => {
    expect(toCanonicalSector({ sector: "Quantum Widgets", industry: "24" })).toBe("technology");
    expect(toCanonicalSector({ sector: null, industry: "Energy" })).toBe("energy");
  });

  it("passes a canonical key straight through (re-derive on read)", () => {
    expect(toCanonicalSector({ sector: "energy" })).toBe("energy");
    expect(toCanonicalSector({ sector: "real_estate" })).toBe("real_estate");
  });

  it("returns null for unknown / empty / null", () => {
    expect(toCanonicalSector({ sector: "Quantum Widgets" })).toBeNull();
    expect(toCanonicalSector({ sector: "999" })).toBeNull();
    expect(toCanonicalSector({ sector: "" })).toBeNull();
    expect(toCanonicalSector({ sector: null, industry: null })).toBeNull();
    expect(toCanonicalSector({})).toBeNull();
  });
});

describe("resolveCanonicalSectorLabel", () => {
  it("localizes every canonical key", () => {
    for (const key of CANONICAL_SECTOR_KEYS) {
      expect(resolveCanonicalSectorLabel(key, "zh-Hant")).toBe(CANONICAL_SECTOR_LABELS[key].zh);
      expect(resolveCanonicalSectorLabel(key, "en")).toBe(CANONICAL_SECTOR_LABELS[key].en);
    }
  });

  it("uses runtime locale for auto preference", () => {
    expect(resolveCanonicalSectorLabel("technology", "auto", "zh-TW")).toBe("資訊科技");
    expect(resolveCanonicalSectorLabel("technology", "auto", "en-US")).toBe("Technology");
  });

  it("passes unknown keys through and handles empties", () => {
    expect(resolveCanonicalSectorLabel("not_a_key", "zh-Hant")).toBe("not_a_key");
    expect(resolveCanonicalSectorLabel("", "zh-Hant")).toBeNull();
    expect(resolveCanonicalSectorLabel(null, "en")).toBeNull();
  });
});
