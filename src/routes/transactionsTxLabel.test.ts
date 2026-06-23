import { describe, expect, it } from "vitest";
import { isImportOpeningLot, txTypeLabel } from "./transactionsTxLabel";

describe("isImportOpeningLot", () => {
  it("flags a cashless opening lot", () => {
    expect(isImportOpeningLot({ cashless: true, id: "anything", assetId: "a1" })).toBe(true);
  });

  it("flags a record whose id matches the inv_open_<assetId> fallback", () => {
    expect(isImportOpeningLot({ cashless: false, id: "inv_open_a1", assetId: "a1" })).toBe(true);
  });

  it("does not flag a normal buy/sell record", () => {
    expect(isImportOpeningLot({ cashless: false, id: "rec_1", assetId: "a1" })).toBe(false);
  });
});

describe("txTypeLabel", () => {
  it("labels a cashless opening lot 「匯入」 even though its actionKey is buy", () => {
    expect(txTypeLabel({ actionKey: "buy", isOpeningLot: true })).toBe("匯入");
  });

  it("labels a normal buy 「買」", () => {
    expect(txTypeLabel({ actionKey: "buy", isOpeningLot: false })).toBe("買");
  });

  it("leaves sell and dividend short labels unchanged", () => {
    expect(txTypeLabel({ actionKey: "sell", isOpeningLot: false })).toBe("賣");
    expect(txTypeLabel({ actionKey: "cashDividend", isOpeningLot: false })).toBe("息");
  });
});
