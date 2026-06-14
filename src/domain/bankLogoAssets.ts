/**
 * Optional bundled bank / broker logo assets, keyed by the brand `domain` from
 * `bankBrands.ts`. Public source builds do not include the actual logo files;
 * official release builds may inject them privately into `public/bank/` before
 * packaging. Missing files are fine — `BankLogo` falls back to the normal
 * account marker when an asset cannot be loaded.
 *
 * ── How to add a logo ───────────────────────────────────────────────────────
 * 1. Put release-only files in `private-assets/bank/` using the filenames below.
 * 2. `npm run build` runs `scripts/inject-private-assets.mjs`, which copies the
 *    private files into `public/bank/` when present.
 * 3. The domain keys must match the `domain` values in `bankBrands.ts`
 *    (BRAND_RULES). `getBankLogoAsset` resolves an account → brand → asset.
 *
 * Until a brand has an entry here, the account simply shows your chosen icon /
 * colour marker (the logo overlay renders nothing).
 */
export const BANK_LOGO_ASSETS: Record<string, string> = {
  "firstbank.com.tw": "/bank/007_ileo.svg",
  "fubon.com": "/bank/012.svg",
  "cathaybk.com.tw": "/bank/013.svg",
  "dahu.sinopac.com": "/bank/807_da.svg",
  "bank.sinopac.com": "/bank/807.svg",
  "esunbank.com": "/bank/808.svg",
  "taishinbank.com.tw": "/bank/812.svg",
  "richart.tw": "/bank/812_R.svg",
  "nextbank.com.tw": "/bank/823.svg",
  "linebank.com.tw": "/bank/824.svg",
  "crypto.com": "/bank/cryptocom.svg",
  "firstrade.com": "/bank/ft.svg",
  "kgi.com": "/bank/kgi.svg",
};

/** Bundled logo asset URL for a brand domain, or null when none is bundled. */
export function getBankLogoAsset(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return BANK_LOGO_ASSETS[domain] ?? null;
}
