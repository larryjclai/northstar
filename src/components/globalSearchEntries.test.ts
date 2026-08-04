import { describe, expect, it } from "vitest";
import { buildHoldingSearchEntries } from "./GlobalSearch";

describe("buildHoldingSearchEntries", () => {
  it("dedupes ticker-bearing assets to one entry per ticker", () => {
    const entries = buildHoldingSearchEntries([
      { id: "asset_1", ticker: "0050.TW", name: "元大台灣50" },
      { id: "asset_2", ticker: "0050.TW", name: "元大台灣50" },
      { id: "asset_3", ticker: "VT", name: "Vanguard Total World" },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      key: "ticker:0050.TW",
      ticker: "0050.TW",
      assetId: "asset_1",
      name: "元大台灣50",
    });
  });

  it("includes custom (no-ticker) assets one entry each, searchable by name", () => {
    // Regression: these used to be skipped entirely — custom assets were
    // unreachable from ⌘K search.
    const entries = buildHoldingSearchEntries([
      { id: "asset_a", ticker: "", name: "老家不動產" },
      { id: "asset_b", ticker: "  ", name: "未上市股權" },
    ]);
    expect(entries).toEqual([
      { key: "asset:asset_a", ticker: "", assetId: "asset_a", name: "老家不動產" },
      { key: "asset:asset_b", ticker: "", assetId: "asset_b", name: "未上市股權" },
    ]);
  });

  it("keeps two same-name custom assets as distinct entries", () => {
    const entries = buildHoldingSearchEntries([
      { id: "asset_a", ticker: "", name: "房產" },
      { id: "asset_b", ticker: "", name: "房產" },
    ]);
    expect(entries.map((e) => e.assetId)).toEqual(["asset_a", "asset_b"]);
  });

  it("falls back to a generic label when a custom asset has no name", () => {
    const entries = buildHoldingSearchEntries([{ id: "asset_a", ticker: "", name: "" }]);
    expect(entries[0].name).toBe("自訂資產");
  });
});
