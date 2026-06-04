import type { AppSettings, DailyFxRate } from "./types";

export interface ConvertOptions {
  dailyRates?: DailyFxRate[];
  asOfDate?: string;
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  settings: AppSettings | undefined,
  options?: ConvertOptions,
): number | null {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (source === target) return amount;

  if (options?.dailyRates && options.dailyRates.length && options.asOfDate) {
    const asOf = options.asOfDate.slice(0, 10);
    const daily = pickDailyRate(options.dailyRates, source, target, asOf);
    if (daily !== null) return amount * daily;
    const inverseDaily = pickDailyRate(options.dailyRates, target, source, asOf);
    if (inverseDaily !== null) return amount / inverseDaily;
  }

  const rate = settings?.exchangeRates.find(
    (item) => item.from.toUpperCase() === source && item.to.toUpperCase() === target,
  );
  if (rate) return amount * rate.rate;
  const inverse = settings?.exchangeRates.find(
    (item) => item.from.toUpperCase() === target && item.to.toUpperCase() === source,
  );
  if (inverse) return amount / inverse.rate;
  return null;
}

function pickDailyRate(rates: DailyFxRate[], from: string, to: string, asOfDate: string): number | null {
  let best: DailyFxRate | null = null;
  for (const row of rates) {
    if (row.from !== from || row.to !== to) continue;
    if (row.date > asOfDate) continue;
    if (!best || row.date > best.date) best = row;
  }
  return best ? best.rate : null;
}

export function createFxConverter(
  settings: AppSettings | undefined,
  dailyRates: DailyFxRate[] | undefined,
) {
  const primary = settings?.primaryCurrency ?? "TWD";
  const rates = dailyRates ?? [];
  function toPrimary(amount: number, currency: string, asOfDate?: string) {
    return convertCurrency(amount, currency, primary, settings, {
      dailyRates: rates,
      asOfDate,
    }) ?? 0;
  }
  return { toPrimary, primaryCurrency: primary };
}

// Module-level flag, kept in sync by `usePrivacySync` (see state/uiPreferences).
// We deliberately keep it as a plain variable rather than a hook so formatters
// can be called from any context. Components must subscribe to the zustand
// store to trigger re-renders; this flag is read at format time.
let __privacyMaskOn = false;
const MASKED_TEXT = "＊＊＊＊＊＊";
const MASKED_PERCENT = "＊＊.＊＊%";

export function setPrivacyMaskOn(value: boolean) {
  __privacyMaskOn = value;
}

// Locale used by the compact formatters below. Kept in sync from i18n (see
// i18n.ts) using the same module-global pattern as the privacy mask so the
// formatters stay callable from any context without a hook.
let __compactLocale: "zh-TW" | "en" = "zh-TW";

export function setCompactLocale(locale: string) {
  __compactLocale = locale.startsWith("en") ? "en" : "zh-TW";
}

/**
 * Abbreviate a large value so KPI tiles never clip, regardless of magnitude.
 * Chinese UI → 萬 / 億 (10^4 / 10^8); English UI → Intl compact (K / M / B).
 * Values below the abbreviation threshold render in full. The caller is
 * expected to expose the exact value (e.g. a `title` tooltip) alongside.
 */
export function formatCompactNumber(amount: number): string {
  if (__privacyMaskOn) return MASKED_TEXT;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (__compactLocale === "en") {
    if (abs < 1000) return amount.toLocaleString("en", { maximumFractionDigits: 0 });
    return amount.toLocaleString("en", { notation: "compact", maximumFractionDigits: 2 });
  }
  // zh-TW: switch to 萬 (10^4) then 億 (10^8).
  if (abs < 10_000) return amount.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
  if (abs < 100_000_000) return `${sign}${trimUnit(abs / 10_000)}萬`;
  return `${sign}${trimUnit(abs / 100_000_000)}億`;
}

export function formatCompactMoney(amount: number, currency: string): string {
  if (__privacyMaskOn) return `${currency} ${MASKED_TEXT}`;
  return `${currency} ${formatCompactNumber(amount)}`;
}

// Keep up to two decimals but drop trailing zeros so "1485萬" not "1485.00萬"
// and "1.49億" reads cleanly.
function trimUnit(value: number): string {
  return value.toLocaleString(__compactLocale === "en" ? "en" : "zh-TW", { maximumFractionDigits: 2 });
}

export function isPrivacyMaskOn() {
  return __privacyMaskOn;
}

export function formatMoney(amount: number, currency: string) {
  if (__privacyMaskOn) return `${currency} ${MASKED_TEXT}`;
  return `${currency} ${amount.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
}

export function formatNumber(amount: number, options?: Intl.NumberFormatOptions) {
  if (__privacyMaskOn) return MASKED_TEXT;
  return amount.toLocaleString("zh-TW", { maximumFractionDigits: 0, ...options });
}

export function formatSignedMoney(amount: number, currency: string) {
  if (__privacyMaskOn) return `${currency} ${MASKED_TEXT}`;
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${currency} ${Math.abs(amount).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number, fractionDigits = 2) {
  if (__privacyMaskOn) return MASKED_PERCENT;
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatQuantity(amount: number) {
  if (__privacyMaskOn) return MASKED_TEXT;
  if (Number.isInteger(amount)) return amount.toLocaleString("zh-TW");
  // Up to 6 decimals (fractional shares / split-adjusted lots), trailing zeros
  // dropped so "10" never renders as "10.000000". See B18 precision policy.
  return amount.toLocaleString("zh-TW", { maximumFractionDigits: 6 });
}

export function formatPrice(value: number, fractionDigits?: number) {
  if (__privacyMaskOn) return MASKED_TEXT;
  // Default: 2–6 decimals. US fractional-share prices can carry up to 6
  // meaningful digits; normal prices still read as "100.00" because trailing
  // zeros beyond the 2-decimal minimum are dropped. Pass an explicit count to
  // pin a fixed number of decimals. See B18 precision policy.
  if (fractionDigits === undefined) {
    return value.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }
  return value.toLocaleString("zh-TW", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}
