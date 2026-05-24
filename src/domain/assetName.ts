import type { PortfolioAsset } from "./types";

export type NameLocalePreference = "auto" | "zh-Hant" | "en";

/**
 * Pick the asset display name following the user's locale preference.
 *
 * - `zh-Hant`: prefer `nameZh`, fall back to `name`, then `nameEn`.
 * - `en`: prefer `nameEn`, fall back to `name`, then `nameZh`.
 * - `auto`: use the runtime locale. Anything starting with `zh` picks Chinese,
 *   anything starting with `en` picks English, else fall back to `name`.
 */
export function resolveAssetName(
  asset: Pick<PortfolioAsset, "name" | "nameZh" | "nameEn" | "ticker"> | null | undefined,
  preference: NameLocalePreference,
  runtimeLocale: string = typeof navigator !== "undefined" ? navigator.language : "en",
): string {
  if (!asset) return "";
  const fallback = asset.name || asset.ticker || "";

  switch (preference) {
    case "zh-Hant":
      return asset.nameZh || fallback || asset.nameEn || "";
    case "en":
      return asset.nameEn || fallback || asset.nameZh || "";
    case "auto":
    default: {
      const tag = (runtimeLocale || "").toLowerCase();
      if (tag.startsWith("zh")) {
        return asset.nameZh || fallback || asset.nameEn || "";
      }
      if (tag.startsWith("en")) {
        return asset.nameEn || fallback || asset.nameZh || "";
      }
      return fallback || asset.nameZh || asset.nameEn || "";
    }
  }
}
