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
    }) ?? amount;
  }
  return { toPrimary, primaryCurrency: primary };
}

export function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
}
