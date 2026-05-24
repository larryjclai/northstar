import { describe, expect, it } from "vitest";
import { resolveAssetName } from "./assetName";

const asset = {
  ticker: "2330.TW",
  name: "TSMC",
  nameZh: "台積電",
  nameEn: "Taiwan Semiconductor Manufacturing",
};

describe("resolveAssetName", () => {
  it("prefers zh name when preference is zh-Hant", () => {
    expect(resolveAssetName(asset, "zh-Hant")).toBe("台積電");
  });

  it("prefers en name when preference is en", () => {
    expect(resolveAssetName(asset, "en")).toBe("Taiwan Semiconductor Manufacturing");
  });

  it("uses zh under auto when runtime locale starts with zh", () => {
    expect(resolveAssetName(asset, "auto", "zh-TW")).toBe("台積電");
  });

  it("uses en under auto when runtime locale starts with en", () => {
    expect(resolveAssetName(asset, "auto", "en-US")).toBe("Taiwan Semiconductor Manufacturing");
  });

  it("falls back to default name when preferred translation is missing", () => {
    const partial = { ticker: "QQQ", name: "Invesco QQQ", nameZh: null, nameEn: null };
    expect(resolveAssetName(partial, "zh-Hant")).toBe("Invesco QQQ");
    expect(resolveAssetName(partial, "en")).toBe("Invesco QQQ");
  });

  it("falls back to ticker when nothing else is available", () => {
    const empty = { ticker: "FOO", name: "", nameZh: null, nameEn: null };
    expect(resolveAssetName(empty, "zh-Hant")).toBe("FOO");
  });

  it("returns empty string for null asset", () => {
    expect(resolveAssetName(null, "auto")).toBe("");
  });
});
