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
  return amount.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
}

export function formatPrice(value: number, fractionDigits = 2) {
  if (__privacyMaskOn) return MASKED_TEXT;
  return value.toLocaleString("zh-TW", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}
