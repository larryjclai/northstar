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
  isSharedToHousehold: boolean;
}

export interface LedgerTransaction extends SyncFields {
  accountId: string;
  date: string;
  amount: number;
  currency: CurrencyCode;
  category: string;
  note: string;
  linkedInvestmentRecordId: string | null;
  groupId: string | null;
  isReviewed: boolean;
  receiptAttachmentId: string | null;
}

export interface PortfolioAsset extends SyncFields {
  ticker: string;
  name: string;
  currency: CurrencyCode;
  totalQuantity: number;
  averageCost: number;
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

