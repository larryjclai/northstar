export type CurrencyCode = "TWD" | "USD" | "JPY" | "EUR" | string;

export type AccountType =
  | "depository"
  | "cash"
  | "credit"
  | "loan"
  | "investment"
  | "other";

export type InvestmentAction =
  | "buy"
  | "sell"
  | "cashDividend"
  | "stockDividend"
  | "capitalReduction"
  | "stockSplit";

export type AssetType =
  | "equity"
  | "etf"
  | "mutual_fund"
  | "index"
  | "crypto"
  | "cash"
  | "other";

export const assetTypeLabels: Record<AssetType, string> = {
  equity: "股票",
  etf: "ETF",
  mutual_fund: "共同基金",
  index: "指數",
  crypto: "加密貨幣",
  cash: "現金",
  other: "其他",
};

export const gicsSectors = [
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
];

export interface SyncFields {
  id: string;
  spaceId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Account extends SyncFields {
  name: string;
  currency: CurrencyCode;
  openingBalance: number;
  balance: number;
  type: AccountType;
  creditLimit: number | null;
  creditLimitGroup: string;
  isSharedToHousehold: boolean;
  loanStartDate: string | null;
  annualInterestRate: number | null;
  loanTerm: number | null;
}

export interface LedgerTransaction extends SyncFields {
  accountId: string;
  date: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense" | "transfer";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  linkedInvestmentRecordId: string | null;
  groupId: string | null;
  isReviewed: boolean;
  receiptAttachmentId: string | null;
}

export interface PortfolioAsset extends SyncFields {
  ticker: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  currency: CurrencyCode;
  totalQuantity: number;
  averageCost: number;
  holdingSource: "manual" | "transactions";
  acquisitionDate: string | null;
  assetType: AssetType | null;
  sector: string | null;
  industry: string | null;
  /**
   * Brokerage / custodian that holds this asset.
   *
   * - For `holdingSource = "manual"` rows this is the snapshot owner; one
   *   manual row exists per (ticker, accountId) pair.
   * - For `holdingSource = "transactions"` rows this is null and ownership
   *   is derived from `InvestmentRecord.linkedAccountId`.
   */
  accountId: string | null;
  /**
   * For `holdingSource = "manual"` rows, the original snapshot quantity set
   * when the holding was created. Used as the base for recomputing
   * `totalQuantity` when sells are subsequently recorded against this asset.
   * Null for transaction-based assets and legacy manual holdings.
   */
  baseQuantity: number | null;
}

export interface InvestmentRecord extends SyncFields {
  assetId: string;
  linkedAccountId: string | null;
  date: string;
  action: InvestmentAction;
  price: number;
  quantity: number;
  fee: number;
  note: string;
  isReviewed: boolean;
  linkedLedgerTransactionId: string | null;
}

export type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "yearly";

export const recurringFrequencyLabels: Record<RecurringFrequency, string> = {
  weekly: "每週",
  biweekly: "每兩週",
  monthly: "每月",
  yearly: "每年",
};

export interface RecurringTransaction extends SyncFields {
  accountId: string;
  amount: number;
  currency: CurrencyCode;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  nextRunDate: string;
  isActive: boolean;
}

export interface HoldingPosition {
  assetId: string;
  ticker: string;
  name: string;
  currency: CurrencyCode;
  quantity: number;
  averageCost: number;
  marketPrice: number | null;
  marketValue: number;
  costBasis: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  /** Brokerage / custodian owning this slice. Null = aggregated / unspecified. */
  accountId: string | null;
}

export interface Lot {
  id: string;
  recordId: string;
  openedAt: string;
  quantity: number;
  costPerShare: number;
}

export interface RealizedLot {
  sourceRecordId: string;
  sellRecordId: string;
  quantity: number;
  costBasis: number;
  proceeds: number;
  realizedGain: number;
}

export interface AppSettings {
  primaryCurrency: CurrencyCode;
  categories: CategoryGroup[];
  merchants: string[];
  exchangeRates: ExchangeRate[];
}

export interface CategoryGroup {
  name: string;
  children: string[];
}

export interface ExchangeRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  updatedAt: string;
}

export interface DailyFxRate {
  from: CurrencyCode;
  to: CurrencyCode;
  date: string;
  rate: number;
  source: string;
  updatedAt: string;
}

export interface DailyPrice {
  ticker: string;
  date: string;
  close: number;
  currency: string;
  source: string;
  updatedAt: string;
}

export interface ManualPriceSnapshot {
  id: string;
  assetId: string;
  date: string;
  price: number;
  note: string;
  createdAt: string;
}

export type GoalKind = "fire" | "custom";

export type GoalDisplayMode = "today" | "nominal";

/**
 * One line item in the retirement spending breakdown. Mirrors the screenshot's
 * "Living NT$3,000/mo · Healthcare NT$300/mo" rows. `mustHave` flags items
 * that we shouldn't trim when projecting a lean / coast FIRE scenario.
 */
export interface SpendingItem {
  id: string;
  name: string;
  monthlyAmount: number;
  mustHave: boolean;
}

/**
 * Retirement income line (pensions, Social Security, 勞保). Reserved for v1.1
 * — the field exists today so backups round-trip even when the UI doesn't
 * surface it yet.
 */
export interface IncomeItem {
  id: string;
  name: string;
  monthlyAmount: number;
  startAge: number;
  endAge: number;
}

/**
 * Financial goal — currently the headline kind is FIRE (Financial
 * Independence, Retire Early). Pre-Phase-7 goals carried a single
 * `expectedAnnualReturn`; we now distinguish pre- vs post-retirement
 * returns so the projection can compound at growth rates during the
 * accumulation phase and a more conservative rate during drawdown.
 *
 * Legacy fields (`annualSpending`, `withdrawalRate`, `expectedAnnualReturn`,
 * `targetAmount`) are kept for backward compatibility: old backups load
 * cleanly, and we still use `withdrawalRate` for the Coast / Lean / Fat
 * FIRE callouts.
 */
export interface FinancialGoal extends SyncFields {
  kind: GoalKind;
  name: string;
  currency: CurrencyCode;
  // Legacy / fallback inputs:
  annualSpending: number;
  withdrawalRate: number;
  expectedAnnualReturn: number;
  monthlyContribution: number;
  /** Optional override; when null/0 we derive from annualSpending / withdrawalRate. */
  targetAmount: number | null;
  startDate: string;
  // Full retirement-projection inputs (all optional — projection helper
  // fills in defaults when these are null):
  currentAge: number | null;
  retirementAge: number | null;
  planThroughAge: number | null;
  preRetirementReturn: number | null;
  postRetirementReturn: number | null;
  inflationRate: number | null;
  annualFee: number | null;
  contributionGrowthRate: number | null;
  spendingItems: SpendingItem[];
  incomeItems: IncomeItem[];
  displayMode: GoalDisplayMode;
  /** Reserved for v1.1: which account ids feed this goal and at what weight. */
  accountShareMap: Record<string, number>;
}
