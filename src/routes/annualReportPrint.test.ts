import { describe, expect, it } from "vitest";
import { annualPrintButtonState, buildAnnualPrintHeaderMeta } from "./annualReportPrint";

describe("annualPrintButtonState", () => {
  it("disables with the mask message when the privacy mask is on", () => {
    // This is the exact predicate the route's button `disabled`/`title` read,
    // so it's the substantive assertion behind the plan's "disabled when the
    // privacy mask is on" requirement.
    const state = annualPrintButtonState({ privacyMode: true, hasRows: true });
    expect(state.disabled).toBe(true);
    expect(state.title).toContain("隱私遮罩");
  });

  it("keeps the mask message even when there is also no data", () => {
    const state = annualPrintButtonState({ privacyMode: true, hasRows: false });
    expect(state.disabled).toBe(true);
    expect(state.title).toContain("隱私遮罩");
  });

  it("disables with the no-data message when there are no rows", () => {
    const state = annualPrintButtonState({ privacyMode: false, hasRows: false });
    expect(state.disabled).toBe(true);
    expect(state.title).toContain("尚無資料");
  });

  it("enables when the mask is off and there is data", () => {
    const state = annualPrintButtonState({ privacyMode: false, hasRows: true });
    expect(state.disabled).toBe(false);
    expect(state.title).toContain("PDF");
  });
});

describe("buildAnnualPrintHeaderMeta", () => {
  it("returns a null range and a generated label when there are no years", () => {
    const meta = buildAnnualPrintHeaderMeta([], "2026-07-13");
    expect(meta.rangeLabel).toBeNull();
    expect(meta.generatedLabel).toBe("產生於 2026-07-13");
  });

  it("collapses a single year to just that year", () => {
    const meta = buildAnnualPrintHeaderMeta(["2024"], "2026-07-13");
    expect(meta.rangeLabel).toBe("2024");
  });

  it("spans min–max regardless of input order", () => {
    const meta = buildAnnualPrintHeaderMeta(["2024", "2019", "2022"], "2026-07-13");
    expect(meta.rangeLabel).toBe("2019–2024");
  });
});
