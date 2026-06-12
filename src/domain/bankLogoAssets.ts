/**
 * Bundled bank / broker logo assets, keyed by the brand `domain` from
 * `bankBrands.ts`. Logos ship *with the app* (no third-party request, no
 * privacy leak, always crisp) — the trade-off is a slightly larger bundle for
 * each logo you include.
 *
 * ── How to add a logo ───────────────────────────────────────────────────────
 * 1. Drop the image in `src/assets/banks/` (PNG/SVG/WebP; ~128px+ square looks
 *    best on account markers). Prefer SVG when available — it stays crisp at any
 *    size and is tiny.
 * 2. Import it and map it under the matching brand domain below, e.g.:
 *
 *      import esunbank from "../assets/banks/esunbank.svg";
 *      // ...
 *      export const BANK_LOGO_ASSETS: Record<string, string> = {
 *        "esunbank.com": esunbank,
 *        "cathaybk.com.tw": cathay,
 *      };
 *
 *    The domain keys must match the `domain` values in `bankBrands.ts`
 *    (BRAND_RULES). `getBankLogoAsset` resolves an account → brand → asset.
 *
 * Until a brand has an entry here, the account simply shows your chosen icon /
 * colour marker (the logo overlay renders nothing).
 */
export const BANK_LOGO_ASSETS: Record<string, string> = {
  // Add brand-domain → imported asset entries here.
};

/** Bundled logo asset URL for a brand domain, or null when none is bundled. */
export function getBankLogoAsset(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return BANK_LOGO_ASSETS[domain] ?? null;
}
