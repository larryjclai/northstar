import { describe, expect, it } from "vitest";
import { parseCsvTable } from "./csv";
import {
  applyManualPriceMapping,
  autoDetectManualPriceFields,
  emptyManualPriceMapping,
  missingManualPriceFields,
  type ManualPriceImportMapping,
} from "./manualPriceImport";

const ASSET_ID = "custom-1";

// A typical valuation export: Chinese headers, ISO dates, a notes column.
const NAV_CSV = ["日期,淨值,備註", "2026-06-01,1234.5,Q2 估值", "2026-06-15,1300,"].join("\n");

function mappingFor(headers: string[]): ManualPriceImportMapping {
  return { ...emptyManualPriceMapping(), fields: autoDetectManualPriceFields(headers) };
}

describe("autoDetectManualPriceFields", () => {
  it("maps Chinese valuation headers to canonical fields", () => {
    const { headers } = parseCsvTable(NAV_CSV, ",");
    const fields = autoDetectManualPriceFields(headers);
    expect(fields.date).toBe("日期");
    expect(fields.price).toBe("淨值");
    expect(fields.note).toBe("備註");
  });

  it("maps English headers (date / price / note)", () => {
    const fields = autoDetectManualPriceFields(["Date", "Price", "Note"]);
    expect(fields.date).toBe("Date");
    expect(fields.price).toBe("Price");
    expect(fields.note).toBe("Note");
  });
});

describe("missingManualPriceFields", () => {
  it("flags date + price when nothing is mapped", () => {
    const missing = missingManualPriceFields(emptyManualPriceMapping());
    expect(missing).toContain("date");
    expect(missing).toContain("price");
    expect(missing).not.toContain("note");
  });

  it("is empty once date + price are mapped", () => {
    const { headers } = parseCsvTable(NAV_CSV, ",");
    expect(missingManualPriceFields(mappingFor(headers))).toHaveLength(0);
  });
});

describe("applyManualPriceMapping", () => {
  it("turns well-formed rows into drafts for the target asset", () => {
    const { headers, rows } = parseCsvTable(NAV_CSV, ",");
    const preview = applyManualPriceMapping(rows, mappingFor(headers), ASSET_ID);
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid).toHaveLength(2);
    expect(preview.valid[0].value).toEqual({
      assetId: ASSET_ID,
      date: "2026-06-01",
      price: 1234.5,
      note: "Q2 估值",
    });
    expect(preview.valid[1].value).toEqual({
      assetId: ASSET_ID,
      date: "2026-06-15",
      price: 1300,
      note: "",
    });
  });

  it("strips thousands separators and currency symbols from price", () => {
    const { headers, rows } = parseCsvTable(
      ["日期,淨值", '2026-06-01,"$1,234.50"'].join("\n"),
      ",",
    );
    const preview = applyManualPriceMapping(rows, mappingFor(headers), ASSET_ID);
    expect(preview.valid[0].value.price).toBe(1234.5);
  });

  it("rejects a row with an unparseable date", () => {
    const { headers, rows } = parseCsvTable(["日期,淨值", "not-a-date,100"].join("\n"), ",");
    const preview = applyManualPriceMapping(rows, mappingFor(headers), ASSET_ID);
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0].reason).toMatch(/日期/);
  });

  it("rejects a row with a non-numeric price", () => {
    const { headers, rows } = parseCsvTable(["日期,淨值", "2026-06-01,abc"].join("\n"), ",");
    const preview = applyManualPriceMapping(rows, mappingFor(headers), ASSET_ID);
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid[0].reason).toMatch(/數字/);
  });

  it("rejects a row with a negative or zero price", () => {
    const { headers, rows } = parseCsvTable(
      ["日期,淨值", "2026-06-01,-5", "2026-06-02,0"].join("\n"),
      ",",
    );
    const preview = applyManualPriceMapping(rows, mappingFor(headers), ASSET_ID);
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toHaveLength(2);
    expect(preview.invalid[0].reason).toMatch(/大於 0/);
  });

  it("returns empty drafts (no crash) for empty input", () => {
    const preview = applyManualPriceMapping([], emptyManualPriceMapping(), ASSET_ID);
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toHaveLength(0);
  });
});
