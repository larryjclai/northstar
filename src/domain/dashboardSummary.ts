import type { Account, PortfolioAsset } from "./types";

export interface DashboardQuote {
  symbol: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface HoldingSummaryRow {
  asset: PortfolioAsset;
  currency: string;
  marketValue: number;
  marketValuePrimary: number;
  dayChange: number | null;
  dayChangePrimary: number | null;
  dayChangePercent: number | null;
  hasQuote: boolean;
}

export function calculateAvailableCash(accounts: Account[], toPrimary: (amount: number, currency: string) => number) {
  return accounts.reduce((sum, account) => {
    if (account.deletedAt !== null) return sum;
    if (account.type === "loan" || account.type === "credit" || account.type === "alternative") return sum;
    return sum + toPrimary(Math.max(0, account.balance), account.currency);
  }, 0);
}

// Non-liquid / alternative assets (property, metals, vehicles…) tracked as
// accounts with a manually-maintained market value. Counted toward net worth
// but kept out of the liquid-cash figure.
export function calculateAlternativeAssets(accounts: Account[], toPrimary: (amount: number, currency: string) => number) {
  return accounts.reduce((sum, account) => {
    if (account.deletedAt !== null) return sum;
    if (account.type !== "alternative") return sum;
    return sum + toPrimary(account.balance, account.currency);
  }, 0);
}

export function calculateLiabilities(accounts: Account[], toPrimary: (amount: number, currency: string) => number) {
  return accounts.reduce((sum, account) => {
    if (account.deletedAt !== null) return sum;
    if (account.type === "loan") return sum + toPrimary(Math.abs(account.balance), account.currency);
    if (account.type === "credit") return sum + toPrimary(Math.max(0, -account.balance), account.currency);
    return sum;
  }, 0);
}

export interface CreditCardReminder {
  accountId: string;
  name: string;
  dueDate: string;
  daysUntilDue: number;
  outstanding: number;
  currency: string;
}

function daysInMonthUtc(year: number, zeroBasedMonth: number) {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}

/** The next date on or after `today` (YYYY-MM-DD) that falls on `day` of month. */
function nextDayOfMonthOnOrAfter(today: string, day: number): string {
  const [y, m, d] = today.slice(0, 10).split("-").map(Number); // m is 1-based
  const dayThis = Math.min(day, daysInMonthUtc(y, m - 1));
  if (d <= dayThis) return new Date(Date.UTC(y, m - 1, dayThis)).toISOString().slice(0, 10);
  const ny = m === 12 ? y + 1 : y;
  const nm = m % 12; // next month, 0-based
  return new Date(Date.UTC(ny, nm, Math.min(day, daysInMonthUtc(ny, nm)))).toISOString().slice(0, 10);
}

/**
 * Upcoming credit-card payments: for each credit account with a payment-due
 * day and an outstanding balance, the next due date and amount owed (in the
 * primary currency). Sorted soonest-first.
 */
export function buildCreditCardReminders(
  accounts: Account[],
  today: string,
  toPrimary: (amount: number, currency: string) => number,
): CreditCardReminder[] {
  const reminders: CreditCardReminder[] = [];
  for (const account of accounts) {
    if (account.deletedAt !== null || account.type !== "credit" || !account.paymentDueDay) continue;
    const owed = Math.max(0, -account.balance);
    if (owed <= 0) continue;
    const dueDate = nextDayOfMonthOnOrAfter(today, account.paymentDueDay);
    const daysUntilDue = Math.round((Date.parse(dueDate) - Date.parse(today.slice(0, 10))) / 86400000);
    reminders.push({
      accountId: account.id,
      name: account.name,
      dueDate,
      daysUntilDue,
      outstanding: toPrimary(owed, account.currency),
      currency: account.currency,
    });
  }
  return reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function buildTopHoldingSummaries(
  assets: PortfolioAsset[],
  quotes: DashboardQuote[],
  toPrimary: (amount: number, currency: string) => number,
  limit = 5,
) {
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  return assets
    .filter((asset) => asset.deletedAt === null && asset.totalQuantity > 0)
    .map((asset): HoldingSummaryRow => {
      const quote = quoteBySymbol.get(asset.ticker.toUpperCase());
      const currency = quote?.currency ?? asset.currency;
      const marketValue = (quote?.price ?? asset.averageCost) * asset.totalQuantity;
      const dayChange = quote ? quote.change * asset.totalQuantity : null;
      return {
        asset,
        currency,
        marketValue,
        marketValuePrimary: toPrimary(marketValue, currency),
        dayChange,
        dayChangePrimary: dayChange === null ? null : toPrimary(dayChange, currency),
        dayChangePercent: quote?.changePercent ?? null,
        hasQuote: Boolean(quote),
      };
    })
    .sort((a, b) => b.marketValuePrimary - a.marketValuePrimary)
    .slice(0, limit);
}

