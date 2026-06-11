import { describe, expect, it } from "vitest";
import { resolveSectorLabel } from "./sectorLabels";

describe("resolveSectorLabel", () => {
  it("maps TWSE numeric industry codes by locale", () => {
    expect(resolveSectorLabel("24", "zh-Hant")).toBe("半導體業");
    expect(resolveSectorLabel("24", "en")).toBe("Semiconductor");
    // Zero-padded codes resolve the same.
    expect(resolveSectorLabel("01", "zh-Hant")).toBe("水泥工業");
    expect(resolveSectorLabel("17", "en")).toBe("Finance & Insurance");
  });

  it("translates English GICS sectors to Chinese under a zh locale", () => {
    expect(resolveSectorLabel("Technology", "zh-Hant")).toBe("資訊科技");
    expect(resolveSectorLabel("Technology", "en")).toBe("Technology");
    expect(resolveSectorLabel("Financial Services", "zh-Hant")).toBe("金融服務");
  });

  it("uses runtime locale for auto preference", () => {
    expect(resolveSectorLabel("24", "auto", "zh-TW")).toBe("半導體業");
    expect(resolveSectorLabel("24", "auto", "en-US")).toBe("Semiconductor");
  });

  it("passes through unknown values and handles empties", () => {
    expect(resolveSectorLabel("Quantum Widgets", "zh-Hant")).toBe("Quantum Widgets");
    expect(resolveSectorLabel("999", "zh-Hant")).toBe("999");
    expect(resolveSectorLabel("", "zh-Hant")).toBeNull();
    expect(resolveSectorLabel(null, "en")).toBeNull();
  });
});
