import { expect, it } from "vitest";
import type { AppSettings, CategoryGroup } from "../domain";
import { describeEachRepo } from "./repositories.testHarness";

function settingsWith(categories: CategoryGroup[], overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    primaryCurrency: "TWD",
    categories,
    merchants: [],
    exchangeRates: [],
    ...overrides,
  };
}

describeEachRepo("settings categories", (makeRepo) => {
  it("kind round-trips", async () => {
    const repo = await makeRepo();
    await repo.updateAppSettings(
      settingsWith([{ name: "薪資", children: [], kind: "income" }]),
    );
    const settings = await repo.getAppSettings();
    const category = settings.categories.find((c) => c.name === "薪資");
    expect(category?.kind).toBe("income");
  });

  it("rollover + rolloverStart round-trip", async () => {
    const repo = await makeRepo();
    await repo.updateAppSettings(
      settingsWith([
        { name: "居住", children: [], rollover: true, rolloverStart: "2026-07" },
      ]),
    );
    const settings = await repo.getAppSettings();
    const category = settings.categories.find((c) => c.name === "居住");
    expect(category?.rollover).toBe(true);
    expect(category?.rolloverStart).toBe("2026-07");
  });

  it("invalid kind is dropped, not stored", async () => {
    const repo = await makeRepo();
    await repo.updateAppSettings(
      settingsWith([
        { name: "雜項", children: [], kind: "banana" as never },
      ]),
    );
    const settings = await repo.getAppSettings();
    const category = settings.categories.find((c) => c.name === "雜項");
    expect(category?.kind).toBeUndefined();
  });

  it("absent fields stay absent", async () => {
    const repo = await makeRepo();
    await repo.updateAppSettings(
      settingsWith([{ name: "交通", children: [] }]),
    );
    const settings = await repo.getAppSettings();
    const category = settings.categories.find((c) => c.name === "交通");
    expect(category?.kind).toBeUndefined();
    expect(category?.rollover).toBeUndefined();
    expect(category?.rolloverStart).toBeUndefined();
  });

  it("second save of an unrelated field preserves kind/rollover", async () => {
    const repo = await makeRepo();
    await repo.updateAppSettings(
      settingsWith([
        { name: "薪資", children: [], kind: "income", rollover: true, rolloverStart: "2026-07" },
      ]),
    );
    const afterFirstSave = await repo.getAppSettings();

    await repo.updateAppSettings(
      settingsWith(afterFirstSave.categories, { primaryCurrency: "USD" }),
    );
    const settings = await repo.getAppSettings();
    const category = settings.categories.find((c) => c.name === "薪資");
    expect(settings.primaryCurrency).toBe("USD");
    expect(category?.kind).toBe("income");
    expect(category?.rollover).toBe(true);
    expect(category?.rolloverStart).toBe("2026-07");
  });
});
