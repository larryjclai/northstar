import type { Account, LedgerTransaction, PortfolioAsset } from "./types";

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

export interface NetWorthBreakdown {
  /** Liquid asset accounts at positive balance (+ any overpaid credit/loan). */
  liquidCash: number;
  /** Holdings market value (passed in from the portfolio layer). */
  investments: number;
  /** Non-liquid / alternative assets at positive balance. */
  alternativeAssets: number;
  /** All negative balances as a positive magnitude: loans, card debt, overdrafts. */
  liabilities: number;
  /** liquidCash + investments + alternativeAssets. */
  totalAssets: number;
  /** totalAssets − liabilities. Equals Σ(signed account balances) + investments. */
  netWorth: number;
}

/**
 * A strict, reconciling partition of net worth so the KPI tiles always satisfy
 * 資產 − 負債 = 淨值. Every account contributes to exactly one side based on the
 * sign of its balance:
 *
 *   - positive balance → an asset (liquidCash, or alternativeAssets for 實體資產)
 *   - negative balance → a liability (overdraft, card debt, loan)
 *
 * Overpaid credit cards / loans (a positive balance on a liability account) are
 * counted as liquid assets rather than vanishing — the old per-metric
 * `Math.max(0, …)` clamps broke reconciliation against the signed net-worth sum.
 */
export function buildNetWorthBreakdown(
  accounts: Account[],
  investmentsValue: number,
  toPrimary: (amount: number, currency: string) => number,
): NetWorthBreakdown {
  let liquidCash = 0;
  let alternativeAssets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (account.deletedAt !== null) continue;
    const value = toPrimary(account.balance, account.currency);
    if (account.type === "alternative") {
      if (value >= 0) alternativeAssets += value;
      else liabilities += -value;
    } else if (value >= 0) {
      liquidCash += value;
    } else {
      liabilities += -value;
    }
  }
  const totalAssets = liquidCash + alternativeAssets + investmentsValue;
  return {
    liquidCash,
    investments: investmentsValue,
    alternativeAssets,
    liabilities,
    totalAssets,
    netWorth: totalAssets - liabilities,
  };
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

/** The most recent date on or before `today` that falls on `day` of month. */
function lastDayOfMonthOnOrBefore(today: string, day: number): string {
  const [y, m, d] = today.slice(0, 10).split("-").map(Number);
  const dayThis = Math.min(day, daysInMonthUtc(y, m - 1));
  if (d >= dayThis) return new Date(Date.UTC(y, m - 1, dayThis)).toISOString().slice(0, 10);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 11 : m - 2;
  return new Date(Date.UTC(py, pm, Math.min(day, daysInMonthUtc(py, pm)))).toISOString().slice(0, 10);
}

/** The first date strictly after `afterDate` that falls on `day` of month. */
function nextDayOfMonthStrictlyAfter(afterDate: string, day: number): string {
  const [y, m, d] = afterDate.slice(0, 10).split("-").map(Number);
  const dayThis = Math.min(day, daysInMonthUtc(y, m - 1));
  if (d < dayThis) return new Date(Date.UTC(y, m - 1, dayThis)).toISOString().slice(0, 10);
  const ny = m === 12 ? y + 1 : y;
  const nm = m % 12;
  return new Date(Date.UTC(ny, nm, Math.min(day, daysInMonthUtc(ny, nm)))).toISOString().slice(0, 10);
}

/**
 * Upcoming credit-card payments: for each credit account with a payment-due
 * day and statement day, finds the most recently closed statement. If it's
 * not paid yet, returns a reminder.
 */
export function buildCreditCardReminders(
  accounts: Account[],
  today: string,
  toPrimary: (amount: number, currency: string) => number,
): CreditCardReminder[] {
  const reminders: CreditCardReminder[] = [];
  const todayStr = today.slice(0, 10);
  
  for (const account of accounts) {
    if (account.deletedAt !== null || account.type !== "credit" || !account.paymentDueDay || !account.statementDay) continue;
    const owed = Math.max(0, -account.balance);
    if (owed <= 0) continue; // If the whole account is fully paid off, no reminder needed.
    
    // Find the most recently closed statement's date
    const lastStatementClose = lastDayOfMonthOnOrBefore(todayStr, account.statementDay);
    // Find the due date for that specific statement
    const dueDate = nextDayOfMonthStrictlyAfter(lastStatementClose, account.paymentDueDay);
    
    // If the due date for the most recently closed statement is already marked as paid,
    // they don't owe anything for it. (New purchases belong to the NEXT statement which hasn't closed yet).
    if (account.creditPaymentPaidUntil && account.creditPaymentPaidUntil >= dueDate) continue;
    
    const daysUntilDue = Math.round((Date.parse(dueDate) - Date.parse(todayStr)) / 86400000);
    
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

export interface CreditBalanceDisplay {
  state: "owed" | "credit" | "zero";
  magnitude: number;
  label: string;
}
/** Interpret a credit-card account's signed balance for display. Negative
 *  balance = owed (未繳); positive = overpaid/prepaid (溢繳); ~0 = settled. */
export function creditBalanceLabel(balance: number): CreditBalanceDisplay {
  if (balance < -0.005) return { state: "owed", magnitude: -balance, label: "未繳" };
  if (balance > 0.005) return { state: "credit", magnitude: balance, label: "溢繳" };
  return { state: "zero", magnitude: 0, label: "已結清" };
}

/** Debug helper: every ledger row that contributes to `accountId`'s balance,
 *  with the contributed delta. Mirrors deriveAccountBalances' per-row logic so
 *  an operator can see exactly what sums to a surprising balance. Pure; no I/O. */
export function explainAccountBalance(
  accountId: string,
  openingBalance: number,
  ledger: Array<Pick<LedgerTransaction, "id" | "date" | "name" | "amount" | "accountId" | "counterAccountId" | "settlementStatus" | "deletedAt">>,
): { opening: number; contributions: Array<{ id: string; date: string; name: string; delta: number; via: "main" | "counter" }>; total: number } {
  const contributions: Array<{ id: string; date: string; name: string; delta: number; via: "main" | "counter" }> = [];
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    if (row.counterAccountId) {
      if (row.counterAccountId === accountId) contributions.push({ id: row.id, date: row.date, name: row.name, delta: -row.amount, via: "counter" });
      if (row.settlementStatus === "settled" && row.accountId === accountId) contributions.push({ id: row.id, date: row.date, name: row.name, delta: row.amount, via: "main" });
    } else if (row.settlementStatus === "settled" && row.accountId === accountId) {
      contributions.push({ id: row.id, date: row.date, name: row.name, delta: row.amount, via: "main" });
    }
  }
  const total = openingBalance + contributions.reduce((s, c) => s + c.delta, 0);
  return { opening: openingBalance, contributions, total };
}

export interface OutstandingSettlementItem {
  id: string;
  kind: "receivable" | "payable";
  name: string;
  counterparty: string;
  date: string;
  amount: number;
  currency: string;
}

export interface OutstandingSettlements {
  receivableTotal: number;
  payableTotal: number;
  receivableCount: number;
  payableCount: number;
  items: OutstandingSettlementItem[];
}

/**
 * Unsettled accounts receivable / payable. AR (`receivable`) is money owed to
 * you; AP (`payable`) is money you owe. Both are stored as ledger rows whose
 * `settlementStatus` is not yet `settled`. Totals are in the primary currency;
 * items are sorted oldest-first so the most overdue surfaces at the top.
 */
export function buildOutstandingSettlements(
  ledger: LedgerTransaction[],
  toPrimary: (amount: number, currency: string) => number,
): OutstandingSettlements {
  const items: OutstandingSettlementItem[] = [];
  let receivableTotal = 0;
  let payableTotal = 0;
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    if (row.settlementStatus !== "receivable" && row.settlementStatus !== "payable") continue;
    const amount = Math.abs(row.amount);
    const primary = toPrimary(amount, row.currency);
    if (row.settlementStatus === "receivable") receivableTotal += primary;
    else payableTotal += primary;
    items.push({
      id: row.id,
      kind: row.settlementStatus,
      name: row.name || row.merchant || row.category || (row.settlementStatus === "receivable" ? "應收款項" : "應付款項"),
      counterparty: row.merchant,
      date: row.date,
      amount,
      currency: row.currency,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return {
    receivableTotal,
    payableTotal,
    receivableCount: items.filter((i) => i.kind === "receivable").length,
    payableCount: items.filter((i) => i.kind === "payable").length,
    items,
  };
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

