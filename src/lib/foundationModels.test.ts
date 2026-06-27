import { describe, expect, it } from "vitest";
import { buildOnDeviceCtx } from "./foundationModels";
import type { QuickAddContext } from "../domain/quickAdd";

describe("buildOnDeviceCtx", () => {
  it("passes the category list through to the on-device context", () => {
    const ctx: QuickAddContext = {
      accounts: [{ id: "a1", name: "信用卡" }],
      categories: ["飲食", "交通", "居住"],
      nowDatetimeLocal: "2026-06-27T10:00",
    };
    expect(buildOnDeviceCtx(ctx).categories).toEqual(["飲食", "交通", "居住"]);
  });

  it("defaults to an empty list when no categories are provided", () => {
    const ctx: QuickAddContext = {
      accounts: [{ id: "a1", name: "信用卡" }],
      nowDatetimeLocal: "2026-06-27T10:00",
    };
    expect(buildOnDeviceCtx(ctx).categories).toEqual([]);
  });
});
