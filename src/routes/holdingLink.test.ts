import { describe, expect, it } from "vitest";
import { holdingDetailLink } from "./holdingLink";

describe("holdingDetailLink", () => {
  it("routes ticker-bearing holdings through /holdings/$ticker", () => {
    expect(holdingDetailLink({ ticker: "0050.TW", assetId: "asset_1" })).toEqual({
      to: "/holdings/$ticker",
      params: { ticker: "0050.TW" },
    });
  });

  it("routes custom (empty-ticker) assets through /holdings/id/$assetId", () => {
    // Regression: /holdings/$ticker with ticker "" resolves to /holdings/ and
    // matches no route — custom assets were unreachable (404) from the 持倉 list.
    expect(holdingDetailLink({ ticker: "", assetId: "asset_custom" })).toEqual({
      to: "/holdings/id/$assetId",
      params: { assetId: "asset_custom" },
    });
  });

  it("treats a whitespace-only ticker as empty", () => {
    expect(holdingDetailLink({ ticker: "  ", assetId: "asset_custom" })).toEqual({
      to: "/holdings/id/$assetId",
      params: { assetId: "asset_custom" },
    });
  });
});
