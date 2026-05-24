import type {
  Account,
  InvestmentRecord,
  LedgerTransaction,
  PortfolioAsset,
  RecurringTransaction,
} from "../domain/types";

export interface FinanceRepository {
  listAccounts(): Promise<Account[]>;
  listLedgerTransactions(): Promise<LedgerTransaction[]>;
  listPortfolioAssets(): Promise<PortfolioAsset[]>;
  listInvestmentRecords(): Promise<InvestmentRecord[]>;
  listRecurringTransactions(): Promise<RecurringTransaction[]>;
}

export class InMemoryFinanceRepository implements FinanceRepository {
  constructor(
    private readonly data: {
      accounts: Account[];
      ledgerTransactions: LedgerTransaction[];
      portfolioAssets: PortfolioAsset[];
      investmentRecords: InvestmentRecord[];
      recurringTransactions: RecurringTransaction[];
    },
  ) {}

  async listAccounts() {
    return this.data.accounts;
  }

  async listLedgerTransactions() {
    return this.data.ledgerTransactions;
  }

  async listPortfolioAssets() {
    return this.data.portfolioAssets;
  }

  async listInvestmentRecords() {
    return this.data.investmentRecords;
  }

  async listRecurringTransactions() {
    return this.data.recurringTransactions;
  }
}

