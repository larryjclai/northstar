export type CurrencyCode = "TWD" | "USD" | "JPY" | "EUR" | string;

export type AccountType =
  | "depository"
  | "cash"
  | "credit"
  | "loan"
  | "investment"
  | "alternative"
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
  | "custom"
  | "other";

export const assetTypeLabels: Record<AssetType, string> = {
  equity: "股票",
  etf: "ETF",
  mutual_fund: "共同基金",
  index: "指數",
  crypto: "加密貨幣",
  cash: "現金",
  custom: "自訂資產",
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

export type BookKind = "personal" | "company";

/**
 * 帳本 (Book) — a partition of accounts, e.g. 個人帳 vs 公司帳. `Account.bookId`
 * is the only join point (plan 188 / docs/ledger-books-plan.md §2a);
 * `LedgerTransaction` carries no book field of its own — it inherits its book
 * transitively through `accountId`. Every space always has at least one book
 * (the default 「個人帳」, kind "personal") — repositories guarantee this via
 * an idempotent backfill, so `Account.bookId` is never null at rest.
 */
export interface Book extends SyncFields {
  name: string;
  kind: BookKind;
  /** Whether this book's accounts count toward the 總覽 (personal) net-worth KPIs. */
  includeInPersonalNetWorth: boolean;
  /** Whether this book's accounts feed the FIRE / runway projections. */
  includeInFireMetrics: boolean;
  color: string | null;
}

/**
 * 客戶主檔 (Client master) — plan 190 §"客戶主檔". First-class record, one per
 * business counterparty a company book issues invoices to. Auto-filled via
 * the existing merchant-autocomplete pattern (see `chooseMerchant` /
 * `MerchantAutocomplete` in `QuickAdd.tsx`) — plan 191's UI concern, not this
 * plan's.
 */
export interface Client extends SyncFields {
  bookId: string;
  name: string;
  /** 統一編號 (統編). Empty string when the client has none on file. */
  taxId: string;
  /** Default payment terms in days, or null if not set. */
  defaultPaymentTerms: number | null;
}

/**
 * 發票 (Invoice) — plan 190 §"Invoice metadata storage". Additive metadata
 * that points AT its receivable ledger row via `linkedLedgerTransactionId`
 * (same foreign-key shape as `linkedInvestmentRecordId` for DRIP) rather than
 * the ledger row pointing "up". `LedgerTransaction` gains no new field for
 * this (locked decision — see plan 190) — the linked row's own `amount` is
 * the 含稅 total, which must match this row's `amount`.
 *
 * `taxExclusiveAmount`/`taxAmount` are Model A (plan 190 §"Tax model"): the
 * ledger row itself carries no tax split, only this row does.
 *
 * `settledAt` is stamped explicitly by the settle flow (`stampInvoiceSettled`)
 * — never derived from the linked row's `updatedAt`, which a later unrelated
 * edit would bump and silently corrupt any settled-date-based metric.
 */
export interface Invoice extends SyncFields {
  bookId: string;
  clientId: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  /** 含稅 total — matches the linked receivable ledger row's `amount`. */
  amount: number;
  /** 未稅額. */
  taxExclusiveAmount: number;
  /** 稅額. */
  taxAmount: number;
  /** Stamped when the linked ledger row settles; cleared if reverted. */
  settledAt: string | null;
  linkedLedgerTransactionId: string | null;
}

export interface Account extends SyncFields {
  name: string;
  currency: CurrencyCode;
  openingBalance: number;
  balance: number;
  type: AccountType;
  /** 帳本 (Book) this account belongs to. See `Book`. Backfilled to the
   *  default 個人帳 for any pre-books account — never null at rest. */
  bookId: string;
  creditLimit: number | null;
  creditLimitGroup: string;
  /** Credit cards: statement closing day of month (1-31). Null for non-credit. */
  statementDay: number | null;
  /** Credit cards: payment due day of month (1-31). Null for non-credit. */
  paymentDueDay: number | null;
  /** Credit cards: if set, suppress the payment reminder until this due date passes. */
  creditPaymentPaidUntil: string | null;
  isSharedToHousehold: boolean;
  loanStartDate: string | null;
  annualInterestRate: number | null;
  loanTerm: number | null;
  /** Optional emoji or icon-name used to personalize the account row. */
  iconName: string | null;
  /** Optional accent color (hex or token) for the account marker. */
  color: string | null;
  /** Optional manual bank/broker brand override for logo rendering. */
  bankBrandDomain?: string | null;
  /** Optional user-defined subgroup within the built-in account type group. */
  customGroup?: string;
}

export interface LedgerTransaction extends SyncFields {
  accountId: string;
  /**
   * Reimbursement (代墊) counter account for receivable/payable rows. When set,
   * the row is a pass-through: the counter leg (`-amount`) hits this account
   * immediately on creation, the main leg (`+amount` to `accountId`) hits only
   * on settle, and the row is excluded from income/expense entirely (net zero).
   *
   * - 應收 (receivable): `accountId` = 收款帳戶 (lands on settle),
   *   `counterAccountId` = 付款帳戶 (paid out now).
   * - 應付 (payable): `accountId` = 付款帳戶 (paid on settle),
   *   `counterAccountId` = 收款帳戶 (received now).
   *
   * Null = legacy single-account behavior (counts as income/expense on settle).
   */
  counterAccountId: string | null;
  date: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  /** Original foreign-currency amount when the entry was recorded in a currency
   * different from the account's currency. `amount` always stores the value
   * converted to the account's currency for balance calculations. */
  originalAmount: number | null;
  originalCurrency: string | null;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense" | "transfer";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  linkedInvestmentRecordId: string | null;
  groupId: string | null;
  /**
   * 多類別拆分 leg discriminator: "category" marks a user-created split leg
   * (one purchase → N sibling rows sharing a `groupId`, each with its own
   * category + amount). "share" marks a 分帳 participant's portion (reuses the
   * 代墊 `counterAccountId` machinery to post an 應收/應付 balance). Null/absent
   * = 一般列或系統腿（手續費/轉帳/分期）— those also share `groupId`s but are
   * not user splits. Optional so pre-split rows and fixtures stay valid.
   */
  legKind?: "category" | "share" | null;
  /**
   * Installment plan id shared by every period of one 分期 purchase. Unlike
   * `groupId` (fee/transfer legs that cascade-delete together), installment
   * rows can be deleted individually or scoped to "this and later periods"
   * via `deleteInstallmentPlan`. Optional (like recurringOccurrenceKey) so
   * pre-installment rows and fixtures stay valid.
   */
  installmentGroupId?: string | null;
  /** 1-based period number within the installment plan. */
  installmentIndex?: number | null;
  /** Total number of periods in the installment plan. */
  installmentTotal?: number | null;
  /**
   * Id of the original expense row this refund offsets (退款/沖銷). Refund
   * rows are positive-amount expenses so they net against the original
   * category's spend instead of inflating income (see assertLedgerInvariants).
   */
  refundOfLedgerId?: string | null;
  isReviewed: boolean;
  receiptAttachmentId: string | null;
  recurringRuleId: string | null;
  /** Stable key for a recurring-rule occurrence, used to deduplicate sync. */
  recurringOccurrenceKey?: string | null;
  /** Optional posting date for credit-card charges that bill to a later
   *  statement than their purchase `date`. Null = posts on `date`. The account
   *  balance is unaffected; only statement bucketing uses this. */
  postDate?: string | null;
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
   * Canonical (coarse) GICS-11 sector key derived from `sector`/`industry` via
   * `toCanonicalSector` (plan 070). Persisted so the cross-market sector
   * breakdown can group TW (TWSE code) and US/intl (Yahoo GICS) holdings into one
   * coherent taxonomy, while `industry` keeps the fine source detail for a
   * drill-down. Optional/nullable for backward-compat: old rows have a null
   * column and derive it on read.
   */
  sectorCanonical?: string | null;
  /**
   * Set true when the user hand-edits the classification (類型/產業/行業) in the
   * holding edit modal. The 回補分類 (backfill) action skips locked rows so it
   * never overwrites a manual classification. Absent/false ⇒ unlocked (the
   * default; auto-backfill may classify it). Optional for backward-compat:
   * pre-existing rows load unlocked.
   */
  classificationLocked?: boolean;
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
  /**
   * When true, this record does NOT post a cash/交割 ledger leg. Used for the
   * "opening balance" lot that backs a manual holding (an already-held position
   * being recorded, not a purchase happening now). Still participates fully in
   * moving-average cost, realized/unrealized P/L, XIRR cashflows, and the
   * net-worth trend — it only suppresses the ledger cash movement.
   */
  cashless: boolean;
  /**
   * Links the two legs of a 股息再投入 (DRIP) entry — a `cashDividend` leg and a
   * `buy` leg created together by `createDividendReinvestment`. Both legs share
   * one id so edit/delete treats the pair as a unit (deleting either removes
   * both). Null/absent for every non-DRIP record. Optional so legacy persisted
   * and synced rows (written before DRIP existed) deserialize cleanly; readers
   * coalesce a missing value to null. See docs/drip-plan.md.
   */
  dripGroupId?: string | null;
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
  /** Reimbursement (代墊) counter account, carried into each posted occurrence.
   * See `LedgerTransaction.counterAccountId`. Null for normal rules. */
  counterAccountId: string | null;
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

export type RecurringInvestmentMode = "fixedAmount" | "fixedShares";

export const recurringInvestmentModeLabels: Record<RecurringInvestmentMode, string> = {
  fixedAmount: "定期定額",
  fixedShares: "定期定股",
};

/**
 * A scheduled investment plan — the investing counterpart of
 * `RecurringTransaction`. "Post" materializes a buy `InvestmentRecord` and the
 * matching cash settlement (交割款) drawn from `accountId`. Like recurring
 * ledger rules it is surfaced as a reminder; posting is a manual one-tap so the
 * user can confirm the reference price first.
 */
export interface RecurringInvestment extends SyncFields {
  /** Cash / settlement account the 交割款 is drawn from. */
  accountId: string;
  ticker: string;
  name: string;
  currency: CurrencyCode;
  mode: RecurringInvestmentMode;
  /** fixedAmount: cash invested each period. */
  amount: number;
  /** fixedShares: shares purchased each period. */
  quantity: number;
  /** Reference price used to derive the missing side at post time. */
  price: number;
  fee: number;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  nextRunDate: string;
  isActive: boolean;
  note: string;
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
  /**
   * Taiwan broker fee + securities tax config.
   * Optional so old saved data (undefined) loads cleanly — callers should
   * fall back to DEFAULT_TW_FEES from tradingFees.ts when this is absent.
   */
  tradingFees?: import("./tradingFees").TradingFeeConfig;
}

export interface CategoryGroup {
  name: string;
  children: string[];
  budget?: number | null;
  color?: string;
  iconName?: string;
  /**
   * Opt-in monthly budget rollover (carry unspent budget forward; overspend
   * carries a negative balance). Optional so old saved data loads unchanged;
   * absent/false → no carry, behaviour identical to a single per-month budget.
   */
  rollover?: boolean;
  /**
   * When rollover is on, the YYYY-MM month from which carry accumulation starts.
   * The 「清除結轉」 action sets this to the current month to restart the carry.
   * Absent/empty → accumulate from the first month that has ledger data.
   */
  rolloverStart?: string;
  /**
   * Which entry types this category appears for in the 收入/支出 picker. A UI
   * filter only — it never changes spend/finance aggregation (categoryPeriodSpend
   * nets by transaction sign regardless of this tag). Semantics:
   *   absent | "both" → shown for BOTH 收入 and 支出 (default; safe for old data).
   *   "income"        → shown only when the entry type is 收入.
   *   "expense"       → shown only when the entry type is 支出.
   * Optional so old saved settings load unchanged. See plan 056.
   */
  kind?: "income" | "expense" | "both";
}

export interface RecalculationDifference {
  id: string;
  label: string;
  before: number;
  after: number;
}

export interface RecalculationReport {
  accountDifferences: RecalculationDifference[];
  assetDifferences: RecalculationDifference[];
  orphanLedgerIds: string[];
  orphanInvestmentIds: string[];
  incompleteTransferGroupIds: string[];
  /** 多類別拆分 groups left with exactly 1 active "category" leg (half-arrived sync / half-deleted split). */
  incompleteSplitGroupIds: string[];
  missingFxPairs: string[];
  changedAccounts: number;
  changedAssets: number;
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
  /**
   * Whether this income grows with inflation (a fully COLA-indexed pension) or
   * is fixed in nominal terms (most annuities, partially-indexed 勞保). Defaults
   * to false — the conservative assumption that purchasing power erodes over
   * time. Optional so old backups load cleanly.
   */
  inflationLinked?: boolean;
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
  /** Safe withdrawal rate as a decimal fraction (0.04 = 4%), like every other
   * rate on this type. Repositories normalize legacy percent-unit rows
   * (4 = 4%) to decimals on load and on upsert (normalizeRateUnit). */
  withdrawalRate: number;
  /** Decimal fraction (0.07 = 7%) — same normalization as withdrawalRate. */
  expectedAnnualReturn: number;
  monthlyContribution: number;
  /** Optional override; when null/0 we derive from annualSpending / withdrawalRate. */
  targetAmount: number | null;
  startDate: string;
  /** Optional deadline for custom goals (ISO YYYY-MM-DD). null = no deadline (FIRE goals always null). */
  targetDate: string | null;
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
