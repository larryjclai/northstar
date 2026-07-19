import type {
  Account,
  AppSettings,
  DailyFxRate,
  InvestmentRecord,
  LedgerTransaction,
  PortfolioAsset,
  RecalculationDifference,
  RecalculationReport,
} from "./types";
import { convertCurrency } from "./currency";

const epsilon = 0.000001;

/**
 * A ledger row that should be excluded from income/expense (and category /
 * merchant) aggregations because it represents a neutral money movement, not
 * real spending or earning: transfers between own accounts, and 代墊
 * pass-through receivable/payable rows (those with a `counterAccountId`, which
 * net to zero across their two legs).
 */
export function isNeutralLedgerRow(row: Pick<LedgerTransaction, "entryType" | "counterAccountId">): boolean {
  return row.entryType === "transfer" || row.counterAccountId != null;
}

export interface LedgerInvariantInput {
  accountId: string;
  amount: number;
  currency: string;
  entryType: "income" | "expense" | "transfer";
  /** Set when this row is a refund (退款) against an existing expense row. */
  refundOfLedgerId?: string | null;
}

export interface TransferInvariantInput {
  sourceAccountId: string;
  destinationAccountId: string;
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount?: number;
}

export function assertLedgerInvariants(
  input: LedgerInvariantInput,
  accounts: Account[],
  options: { allowTransfer?: boolean } = {},
) {
  if (!Number.isFinite(input.amount) || Math.abs(input.amount) <= epsilon) throw new Error("金額必須大於 0。");
  // Receivable/payable rows may be created before the settle account is known
  // (the counterparty hasn't said which account they'll pay into yet), so an
  // empty accountId is allowed — the account is chosen at settle time. When an
  // accountId IS provided it must exist and match the transaction currency.
  if (input.accountId) {
    const account = accounts.find((row) => row.id === input.accountId && row.deletedAt === null);
    if (!account) throw new Error("找不到帳戶。");
    if (input.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase()) {
      throw new Error(`交易幣別必須與帳戶幣別 ${account.currency} 一致。`);
    }
  }
  if (input.entryType === "transfer" && !options.allowTransfer) {
    throw new Error("轉帳必須使用成對的轉帳功能建立。");
  }
  if (input.entryType === "income" && input.amount < 0) throw new Error("收入金額必須為正數。");
  // Refund rows are positive-amount expenses: the inflow offsets the original
  // category's spend instead of inflating income. Everything else keeps the
  // expense-negative invariant.
  if (input.entryType === "expense" && input.refundOfLedgerId) {
    if (input.amount < 0) throw new Error("退款金額必須為正數。");
  } else if (input.entryType === "expense" && input.amount > 0) {
    throw new Error("支出金額必須為負數。");
  }
}

export function assertTransferInvariants(input: TransferInvariantInput, accounts: Account[]) {
  if (input.sourceAccountId === input.destinationAccountId) throw new Error("來源與目標帳戶不可相同。");
  if (!Number.isFinite(input.sourceAmount) || input.sourceAmount <= epsilon) throw new Error("轉帳金額必須大於 0。");
  const source = accounts.find((row) => row.id === input.sourceAccountId && row.deletedAt === null);
  const destination = accounts.find((row) => row.id === input.destinationAccountId && row.deletedAt === null);
  if (!source || !destination) throw new Error("找不到轉帳帳戶。");
  if (source.currency.toUpperCase() !== input.sourceCurrency.toUpperCase()) throw new Error("來源帳戶幣別不一致。");
  if (destination.currency.toUpperCase() !== input.destinationCurrency.toUpperCase()) throw new Error("目標帳戶幣別不一致。");
  if (
    input.sourceCurrency.toUpperCase() === input.destinationCurrency.toUpperCase() &&
    input.destinationAmount !== undefined &&
    Math.abs(input.destinationAmount - input.sourceAmount) > epsilon
  ) {
    throw new Error("同幣別轉帳兩端金額必須平衡。");
  }
  if (input.sourceCurrency.toUpperCase() !== input.destinationCurrency.toUpperCase()) {
    if (!Number.isFinite(input.destinationAmount) || (input.destinationAmount ?? 0) <= epsilon) {
      throw new Error("跨幣別轉帳必須填寫入帳金額。");
    }
  }
}

/**
 * Signed contribution of one ledger row to a given account's balance.
 *
 * Reimbursement (代墊) rows carry a `counterAccountId` and behave as a
 * pass-through: the counter leg (`-amount`) hits `counterAccountId` immediately
 * (on creation, regardless of settlement), while the main leg (`+amount`) hits
 * `accountId` only once settled. A normal row contributes `amount` to its
 * `accountId` only when settled. Deleted rows contribute nothing.
 */
export function accountBalanceDelta(row: LedgerTransaction, accountId: string): number {
  if (row.deletedAt !== null) return 0;
  let delta = 0;
  if (row.counterAccountId) {
    if (row.counterAccountId === accountId) delta -= row.amount; // counter leg, always
    if (row.settlementStatus === "settled" && row.accountId === accountId) delta += row.amount; // main leg on settle
  } else if (row.settlementStatus === "settled" && row.accountId === accountId) {
    delta += row.amount;
  }
  return delta;
}

export function deriveAccountBalances(accounts: Account[], ledger: LedgerTransaction[]) {
  const totals = new Map<string, number>();
  const add = (accountId: string, value: number) => totals.set(accountId, (totals.get(accountId) ?? 0) + value);
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    if (row.counterAccountId) {
      // 代墊 pass-through: counter leg posts immediately, main leg on settle.
      add(row.counterAccountId, -row.amount);
      if (row.settlementStatus === "settled") add(row.accountId, row.amount);
    } else if (row.settlementStatus === "settled") {
      add(row.accountId, row.amount);
    }
  }
  return accounts.map((account) =>
    account.deletedAt === null
      ? { ...account, balance: account.openingBalance + (totals.get(account.id) ?? 0) }
      : account,
  );
}

export function buildRecalculationReport(
  beforeAccounts: Account[],
  afterAccounts: Account[],
  beforeAssets: PortfolioAsset[],
  afterAssets: PortfolioAsset[],
  ledger: LedgerTransaction[],
  investments: InvestmentRecord[],
  missingFxPairs: string[] = [],
): RecalculationReport {
  const accountIds = new Set(afterAccounts.filter((row) => row.deletedAt === null).map((row) => row.id));
  const assetIds = new Set(afterAssets.filter((row) => row.deletedAt === null).map((row) => row.id));
  const accountDifferences = differences(beforeAccounts, afterAccounts, (row) => row.balance, (row) => row.name);
  const assetDifferences = differences(beforeAssets, afterAssets, (row) => row.totalQuantity, (row) => row.ticker);
  const transferGroups = new Map<string, LedgerTransaction[]>();
  for (const row of ledger) {
    if (row.deletedAt !== null || row.entryType !== "transfer" || !row.groupId) continue;
    transferGroups.set(row.groupId, [...(transferGroups.get(row.groupId) ?? []), row]);
  }
  return {
    accountDifferences,
    assetDifferences,
    orphanLedgerIds: ledger.filter((row) => row.deletedAt === null && !accountIds.has(row.accountId)).map((row) => row.id),
    orphanInvestmentIds: investments
      .filter((row) => row.deletedAt === null && (!assetIds.has(row.assetId) || !row.linkedAccountId || !accountIds.has(row.linkedAccountId)))
      .map((row) => row.id),
    incompleteTransferGroupIds: [...transferGroups.entries()]
      .filter(([, rows]) => rows.filter((row) => row.entryType === "transfer").length !== 2)
      .map(([groupId]) => groupId),
    incompleteSplitGroupIds: incompleteSplitGroupIds(ledger),
    incompleteDripGroupIds: incompleteDripGroupIds(investments),
    missingFxPairs,
    changedAccounts: accountDifferences.length,
    changedAssets: assetDifferences.length,
  };
}

/**
 * 多類別拆分/分帳 partial-group guard (mirrors incompleteTransferGroupIds): a
 * split needs ≥ 2 active user legs (category+share combined), so a groupId
 * whose active user-leg count is exactly 1 signals a half-arrived sync or
 * half-deleted split. System legs (手續費/轉帳 — legKind null) are never
 * counted, so fee pairs and transfers can never be reported here.
 */
export function incompleteSplitGroupIds(ledger: LedgerTransaction[]): string[] {
  const counts = new Map<string, number>();
  for (const row of ledger) {
    if (row.deletedAt !== null || (row.legKind !== "category" && row.legKind !== "share") || !row.groupId) continue;
    counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count === 1).map(([groupId]) => groupId);
}

/** DRIP partial-group guard: a DRIP posting is exactly 2 InvestmentRecords
 *  sharing a dripGroupId; a lone active leg = half-arrived sync. */
export function incompleteDripGroupIds(investments: InvestmentRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const row of investments) {
    if (row.deletedAt !== null || !row.dripGroupId) continue;
    counts.set(row.dripGroupId, (counts.get(row.dripGroupId) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count !== 2).map(([groupId]) => groupId);
}

export function findMissingFxPairs(
  accounts: Account[],
  ledger: LedgerTransaction[],
  assets: PortfolioAsset[],
  settings: AppSettings,
  dailyRates: DailyFxRate[],
) {
  const primary = settings.primaryCurrency.toUpperCase();
  const pairs = new Set<string>();
  const inspect = (currency: string, asOfDate?: string) => {
    const source = currency.toUpperCase();
    if (source === primary) return;
    if (convertCurrency(1, source, primary, settings, { dailyRates, asOfDate }) === null) {
      pairs.add(`${source}/${primary}`);
    }
  };
  accounts.filter((row) => row.deletedAt === null).forEach((row) => inspect(row.currency));
  ledger.filter((row) => row.deletedAt === null).forEach((row) => inspect(row.currency, row.date));
  assets.filter((row) => row.deletedAt === null).forEach((row) => inspect(row.currency));
  return [...pairs].sort();
}

function differences<T extends { id: string }>(
  before: T[],
  after: T[],
  value: (row: T) => number,
  label: (row: T) => string,
): RecalculationDifference[] {
  const previous = new Map(before.map((row) => [row.id, row]));
  return after.flatMap((row) => {
    const old = previous.get(row.id);
    if (!old || Math.abs(value(old) - value(row)) <= epsilon) return [];
    return [{ id: row.id, label: label(row), before: value(old), after: value(row) }];
  });
}
