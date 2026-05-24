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
}

export interface LedgerTransaction extends SyncFields {
  accountId: string;
  date: string;
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
  /**
   * Brokerage / custodian that holds this asset.
   *
   * - For `holdingSource = "manual"` rows this is the snapshot owner; one
   *   manual row exists per (ticker, accountId) pair.
   * - For `holdingSource = "transactions"` rows this is null and ownership
   *   is derived from `InvestmentRecord.linkedAccountId`.
   */
  accountId: string | null;
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

export type GoalKind = "fire" | "custom";

/**
 * Financial goal — the first kind we support is FIRE (Financial Independence,
 * Retire Early). `annualSpending` × (1 / withdrawalRate) is the classic
 * "25× rule" target if `targetAmount` is not overridden.
 */
export interface FinancialGoal extends SyncFields {
  kind: GoalKind;
  name: string;
  currency: CurrencyCode;
  annualSpending: number;
  withdrawalRate: number;
  expectedAnnualReturn: number;
  monthlyContribution: number;
  /** Optional override; when null/0 we derive from annualSpending / withdrawalRate. */
  targetAmount: number | null;
  startDate: string;
}
