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

export interface LedgerInvariantInput {
  accountId: string;
  amount: number;
  currency: string;
  entryType: "income" | "expense" | "transfer";
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
  const account = accounts.find((row) => row.id === input.accountId && row.deletedAt === null);
  if (!account) throw new Error("找不到帳戶。");
  if (!Number.isFinite(input.amount) || Math.abs(input.amount) <= epsilon) throw new Error("金額必須大於 0。");
  if (input.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase()) {
    throw new Error(`交易幣別必須與帳戶幣別 ${account.currency} 一致。`);
  }
  if (input.entryType === "transfer" && !options.allowTransfer) {
    throw new Error("轉帳必須使用成對的轉帳功能建立。");
  }
  if (input.entryType === "income" && input.amount < 0) throw new Error("收入金額必須為正數。");
  if (input.entryType === "expense" && input.amount > 0) throw new Error("支出金額必須為負數。");
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

export function deriveAccountBalances(accounts: Account[], ledger: LedgerTransaction[]) {
  const totals = new Map<string, number>();
  for (const row of ledger) {
    if (row.deletedAt !== null || row.settlementStatus !== "settled") continue;
    totals.set(row.accountId, (totals.get(row.accountId) ?? 0) + row.amount);
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
    missingFxPairs,
    changedAccounts: accountDifferences.length,
    changedAssets: assetDifferences.length,
  };
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
