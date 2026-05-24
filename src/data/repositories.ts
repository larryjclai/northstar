import type Database from "@tauri-apps/plugin-sql";
import type {
  Account,
  InvestmentAction,
  InvestmentRecord,
  LedgerTransaction,
  PortfolioAsset,
  RecurringTransaction,
} from "../domain/types";
import type { MarketQuote } from "../features/market-data";
import { migrations } from "./migrations";
import {
  seedAccounts,
  seedAssets,
  seedInvestmentRecords,
  seedLedgerTransactions,
  seedRecurringTransactions,
} from "./seed";

export interface StoredMarketQuote extends MarketQuote {
  source: string;
  updatedAt: string;
}

export interface LedgerDraft {
  accountId: string;
  date: string;
  amount: number;
  currency: string;
  category: string;
  note: string;
  groupId?: string | null;
}

export interface TransferDraft {
  date: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount?: number;
  note: string;
}

export interface InvestmentDraft {
  ticker: string;
  name: string;
  currency: string;
  linkedAccountId?: string | null;
  date: string;
  action: InvestmentAction;
  price: number;
  quantity: number;
  fee: number;
  note: string;
}

export interface FinanceRepository {
  initialize(): Promise<void>;
  listAccounts(): Promise<Account[]>;
  createAccount(input: Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">): Promise<void>;
  updateAccount(id: string, input: Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  listLedgerTransactions(): Promise<LedgerTransaction[]>;
  createLedgerTransaction(input: LedgerDraft): Promise<void>;
  updateLedgerTransaction(id: string, input: LedgerDraft): Promise<void>;
  deleteLedgerTransaction(id: string): Promise<void>;
  createTransfer(input: TransferDraft): Promise<void>;
  importLedgerTransactions(rows: LedgerDraft[]): Promise<void>;
  listPortfolioAssets(): Promise<PortfolioAsset[]>;
  listInvestmentRecords(): Promise<InvestmentRecord[]>;
  createInvestmentRecord(input: InvestmentDraft): Promise<void>;
  updateInvestmentRecord(id: string, input: InvestmentDraft): Promise<void>;
  deleteInvestmentRecord(id: string): Promise<void>;
  importInvestmentRecords(rows: InvestmentDraft[]): Promise<void>;
  listRecurringTransactions(): Promise<RecurringTransaction[]>;
  listMarketQuotes(): Promise<StoredMarketQuote[]>;
  saveMarketQuotes(quotes: MarketQuote[], source: string): Promise<void>;
}

const personalSpace = "space_personal_default";

let repositoryPromise: Promise<FinanceRepository> | null = null;

export function getFinanceRepository(): Promise<FinanceRepository> {
  repositoryPromise ??= createFinanceRepository();
  return repositoryPromise;
}

async function createFinanceRepository(): Promise<FinanceRepository> {
  if (isTauriRuntime()) {
    const mod = await import("@tauri-apps/plugin-sql");
    const db = await mod.default.load("sqlite:northstar.db");
    const repository = new TauriSqlFinanceRepository(db);
    await repository.initialize();
    return repository;
  }

  const repository = new BrowserFinanceRepository();
  await repository.initialize();
  return repository;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function bump<T extends { revision: number; updatedAt: string }>(record: T): T {
  return { ...record, revision: record.revision + 1, updatedAt: nowIso() };
}

function active<T extends { deletedAt: string | null }>(rows: T[]) {
  return rows.filter((row) => row.deletedAt === null);
}

function recomputeAccounts(accounts: Account[], ledger: LedgerTransaction[]) {
  const activeLedger = active(ledger);
  return accounts.map((account) => {
    if (account.deletedAt !== null) return account;
    const total = activeLedger
      .filter((row) => row.accountId === account.id)
      .reduce((sum, row) => sum + row.amount, 0);
    return { ...account, balance: account.openingBalance + total };
  });
}

function recomputeAssets(assets: PortfolioAsset[], records: InvestmentRecord[]) {
  const activeRecords = active(records);
  return assets.map((asset) => {
    if (asset.deletedAt !== null) return asset;
    const assetRecords = activeRecords.filter((record) => record.assetId === asset.id);
    let quantity = 0;
    let cost = 0;
    for (const record of assetRecords.sort((a, b) => a.date.localeCompare(b.date))) {
      if (record.action === "buy") {
        quantity += record.quantity;
        cost += record.price * record.quantity + record.fee;
      } else if (record.action === "sell") {
        const averageCost = quantity === 0 ? 0 : cost / quantity;
        quantity -= record.quantity;
        cost -= averageCost * record.quantity;
      } else if (record.action === "stockDividend") {
        quantity += record.quantity;
      } else if (record.action === "capitalReduction") {
        cost = Math.max(0, cost - record.price * record.quantity);
      } else if (record.action === "stockSplit" && record.quantity > 0) {
        quantity *= record.quantity;
      }
    }
    return {
      ...asset,
      totalQuantity: quantity,
      averageCost: quantity === 0 ? 0 : cost / quantity,
    };
  });
}

class BrowserFinanceRepository implements FinanceRepository {
  private readonly storageKey = "northstar.browserRepository.v1";
  private data = createInitialData();

  async initialize() {
    const stored = window.localStorage.getItem(this.storageKey);
    this.data = stored ? JSON.parse(stored) : createInitialData();
    await this.persist();
  }

  async listAccounts() {
    return active(this.data.accounts);
  }

  async createAccount(input: Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">) {
    const timestamp = nowIso();
    this.data.accounts.push({
      id: createId("acct"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      balance: input.openingBalance,
      ...input,
    });
    await this.persist();
  }

  async updateAccount(id: string, input: Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">) {
    this.data.accounts = this.data.accounts.map((account) =>
      account.id === id ? bump({ ...account, ...input }) : account,
    );
    this.recompute();
    await this.persist();
  }

  async deleteAccount(id: string) {
    const hasRows = this.data.ledgerTransactions.some((row) => row.accountId === id && row.deletedAt === null)
      || this.data.investmentRecords.some((row) => row.linkedAccountId === id && row.deletedAt === null);
    if (hasRows) throw new Error("已有交易的帳戶不能刪除。");
    this.data.accounts = this.data.accounts.map((account) =>
      account.id === id ? bump({ ...account, deletedAt: nowIso() }) : account,
    );
    await this.persist();
  }

  async listLedgerTransactions() {
    return active(this.data.ledgerTransactions).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createLedgerTransaction(input: LedgerDraft) {
    this.data.ledgerTransactions.push(createLedgerRow(input));
    this.recompute();
    await this.persist();
  }

  async updateLedgerTransaction(id: string, input: LedgerDraft) {
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, ...input, groupId: input.groupId ?? null }) : row,
    );
    this.recompute();
    await this.persist();
  }

  async deleteLedgerTransaction(id: string) {
    const target = this.data.ledgerTransactions.find((row) => row.id === id);
    const groupId = target?.groupId;
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id || (groupId && row.groupId === groupId)
        ? bump({ ...row, deletedAt: nowIso() })
        : row,
    );
    this.recompute();
    await this.persist();
  }

  async createTransfer(input: TransferDraft) {
    const groupId = createId("group");
    this.data.ledgerTransactions.push(
      createLedgerRow({
        accountId: input.sourceAccountId,
        date: input.date,
        amount: -Math.abs(input.sourceAmount),
        currency: input.sourceCurrency,
        category: input.sourceCurrency === input.destinationCurrency ? "轉帳" : "外幣兌換",
        note: input.note,
        groupId,
      }),
      createLedgerRow({
        accountId: input.destinationAccountId,
        date: input.date,
        amount: input.destinationCurrency === input.sourceCurrency
          ? Math.abs(input.sourceAmount)
          : Math.abs(input.destinationAmount ?? 0),
        currency: input.destinationCurrency,
        category: input.sourceCurrency === input.destinationCurrency ? "轉帳" : "外幣兌換",
        note: input.note,
        groupId,
      }),
    );
    this.recompute();
    await this.persist();
  }

  async importLedgerTransactions(rows: LedgerDraft[]) {
    this.data.ledgerTransactions.push(...rows.map(createLedgerRow));
    this.recompute();
    await this.persist();
  }

  async listPortfolioAssets() {
    return active(this.data.portfolioAssets);
  }

  async listInvestmentRecords() {
    return active(this.data.investmentRecords).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createInvestmentRecord(input: InvestmentDraft) {
    const asset = this.findOrCreateAsset(input);
    this.data.investmentRecords.push(createInvestmentRow(input, asset.id));
    this.recompute();
    await this.persist();
  }

  async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const asset = this.findOrCreateAsset(input);
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, ...investmentDraftFields(input), assetId: asset.id }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async deleteInvestmentRecord(id: string) {
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, deletedAt: nowIso() }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async importInvestmentRecords(rows: InvestmentDraft[]) {
    for (const row of rows) {
      const asset = this.findOrCreateAsset(row);
      this.data.investmentRecords.push(createInvestmentRow(row, asset.id));
    }
    this.recompute();
    await this.persist();
  }

  async listRecurringTransactions() {
    return active(this.data.recurringTransactions);
  }

  async listMarketQuotes() {
    return this.data.marketQuotes;
  }

  async saveMarketQuotes(quotes: MarketQuote[], source: string) {
    const updatedAt = nowIso();
    const next = new Map(this.data.marketQuotes.map((quote) => [quote.symbol, quote]));
    for (const quote of quotes) {
      next.set(quote.symbol, { ...quote, source, updatedAt });
    }
    this.data.marketQuotes = [...next.values()];
    await this.persist();
  }

  private findOrCreateAsset(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
    let asset = this.data.portfolioAssets.find((item) => item.ticker === ticker && item.deletedAt === null);
    if (!asset) {
      const timestamp = nowIso();
      asset = {
        id: createId("asset"),
        spaceId: personalSpace,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        ticker,
        name: input.name || ticker,
        currency: input.currency,
        totalQuantity: 0,
        averageCost: 0,
      };
      this.data.portfolioAssets.push(asset);
    }
    return asset;
  }

  private recompute() {
    this.data.accounts = recomputeAccounts(this.data.accounts, this.data.ledgerTransactions);
    this.data.portfolioAssets = recomputeAssets(this.data.portfolioAssets, this.data.investmentRecords);
  }

  private async persist() {
    window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }
}

class TauriSqlFinanceRepository extends BrowserFinanceRepository {
  constructor(private readonly db: Database) {
    super();
  }

  override async initialize() {
    for (const migration of migrations) {
      await this.db.execute(migration.sql);
    }
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();
    }
  }

  override async listAccounts() {
    return (await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, is_shared_to_household as isSharedToHousehold
      from accounts where deleted_at is null order by name`)).map((row) => ({
        ...row,
        isSharedToHousehold: Boolean(row.isSharedToHousehold),
      }));
  }

  override async createAccount(input: Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, is_shared_to_household)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$6,$7,$8)`,
      [createId("acct"), personalSpace, timestamp, input.name, input.currency, input.openingBalance, input.type, Number(input.isSharedToHousehold)],
    );
  }

  override async updateAccount(id: string, input: Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">) {
    await this.db.execute(
      `update accounts set revision = revision + 1, updated_at = $1, name = $2, currency = $3, opening_balance = $4, type = $5, is_shared_to_household = $6 where id = $7`,
      [nowIso(), input.name, input.currency, input.openingBalance, input.type, Number(input.isSharedToHousehold), id],
    );
    await this.recomputeSqliteAccounts();
  }

  override async deleteAccount(id: string) {
    const linked = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from ledger_transactions where account_id = $1 and deleted_at is null`,
      [id],
    );
    if ((linked[0]?.count ?? 0) > 0) throw new Error("已有交易的帳戶不能刪除。");
    await this.db.execute(`update accounts set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async listLedgerTransactions() {
    return this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, date, amount, currency, category, note,
      linked_investment_record_id as linkedInvestmentRecordId, group_id as groupId,
      is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId
      from ledger_transactions where deleted_at is null order by date desc, created_at desc`);
  }

  override async createLedgerTransaction(input: LedgerDraft) {
    await this.insertLedgerRow(createLedgerRow(input));
    await this.recomputeSqliteAccounts();
  }

  override async updateLedgerTransaction(id: string, input: LedgerDraft) {
    await this.db.execute(
      `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, amount = $4, currency = $5, category = $6, note = $7, group_id = $8 where id = $9`,
      [nowIso(), input.accountId, input.date, input.amount, input.currency, input.category, input.note, input.groupId ?? null, id],
    );
    await this.recomputeSqliteAccounts();
  }

  override async deleteLedgerTransaction(id: string) {
    const rows = await this.db.select<Array<{ groupId: string | null }>>(`select group_id as groupId from ledger_transactions where id = $1`, [id]);
    const groupId = rows[0]?.groupId;
    if (groupId) {
      await this.db.execute(`update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where group_id = $2`, [nowIso(), groupId]);
    } else {
      await this.db.execute(`update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
    }
    await this.recomputeSqliteAccounts();
  }

  override async createTransfer(input: TransferDraft) {
    const groupId = createId("group");
    const category = input.sourceCurrency === input.destinationCurrency ? "轉帳" : "外幣兌換";
    await this.insertLedgerRow(createLedgerRow({
      accountId: input.sourceAccountId,
      date: input.date,
      amount: -Math.abs(input.sourceAmount),
      currency: input.sourceCurrency,
      category,
      note: input.note,
      groupId,
    }));
    await this.insertLedgerRow(createLedgerRow({
      accountId: input.destinationAccountId,
      date: input.date,
      amount: input.sourceCurrency === input.destinationCurrency ? Math.abs(input.sourceAmount) : Math.abs(input.destinationAmount ?? 0),
      currency: input.destinationCurrency,
      category,
      note: input.note,
      groupId,
    }));
    await this.recomputeSqliteAccounts();
  }

  override async importLedgerTransactions(rows: LedgerDraft[]) {
    for (const row of rows) await this.insertLedgerRow(createLedgerRow(row));
    await this.recomputeSqliteAccounts();
  }

  override async listPortfolioAssets() {
    return this.db.select<PortfolioAsset[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      ticker, name, currency, total_quantity as totalQuantity, average_cost as averageCost
      from portfolio_assets where deleted_at is null order by ticker`);
  }

  override async listInvestmentRecords() {
    return this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId
      from investment_records where deleted_at is null order by date desc, created_at desc`);
  }

  override async createInvestmentRecord(input: InvestmentDraft) {
    const assetId = await this.findOrCreateSqliteAsset(input);
    await this.insertInvestmentRow(createInvestmentRow(input, assetId));
    await this.recomputeSqliteAssets();
  }

  override async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const assetId = await this.findOrCreateSqliteAsset(input);
    await this.db.execute(
      `update investment_records set revision = revision + 1, updated_at = $1, asset_id = $2, linked_account_id = $3, date = $4, action = $5, price = $6, quantity = $7, fee = $8, note = $9 where id = $10`,
      [nowIso(), assetId, input.linkedAccountId ?? null, input.date, input.action, input.price, input.quantity, input.fee, input.note, id],
    );
    await this.recomputeSqliteAssets();
  }

  override async deleteInvestmentRecord(id: string) {
    await this.db.execute(`update investment_records set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
    await this.recomputeSqliteAssets();
  }

  override async importInvestmentRecords(rows: InvestmentDraft[]) {
    for (const row of rows) {
      const assetId = await this.findOrCreateSqliteAsset(row);
      await this.insertInvestmentRow(createInvestmentRow(row, assetId));
    }
    await this.recomputeSqliteAssets();
  }

  override async listRecurringTransactions() {
    return this.db.select<RecurringTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, amount, currency, category, note, day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
      from recurring_transactions where deleted_at is null order by next_run_date`);
  }

  override async listMarketQuotes() {
    return this.db.select<StoredMarketQuote[]>(`select
      symbol, name, currency, price, change, change_percent as changePercent, market_time as marketTime, source, updated_at as updatedAt
      from market_quotes order by symbol`);
  }

  override async saveMarketQuotes(quotes: MarketQuote[], source: string) {
    const updatedAt = nowIso();
    for (const quote of quotes) {
      await this.db.execute(
        `insert into market_quotes (symbol, name, currency, price, change, change_percent, market_time, source, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict(symbol) do update set name = excluded.name, currency = excluded.currency, price = excluded.price,
         change = excluded.change, change_percent = excluded.change_percent, market_time = excluded.market_time,
         source = excluded.source, updated_at = excluded.updated_at`,
        [quote.symbol, quote.name, quote.currency, quote.price, quote.change, quote.changePercent, quote.marketTime, source, updatedAt],
      );
    }
  }

  private async seedSqlite() {
    for (const account of seedAccounts) await this.insertAccountRow(account);
    for (const asset of seedAssets) await this.insertAssetRow(asset);
    for (const record of seedInvestmentRecords) await this.insertInvestmentRow(record);
    for (const row of seedLedgerTransactions) await this.insertLedgerRow(row);
    for (const row of seedRecurringTransactions) {
      await this.db.execute(
        `insert into recurring_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, amount, currency, category, note, day_of_month, next_run_date, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.accountId, row.amount, row.currency, row.category, row.note, row.dayOfMonth, row.nextRunDate, Number(row.isActive)],
      );
    }
  }

  private async insertAccountRow(row: Account) {
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, is_shared_to_household)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.name, row.currency, row.openingBalance, row.balance, row.type, Number(row.isSharedToHousehold)],
    );
  }

  private async insertAssetRow(row: PortfolioAsset) {
    await this.db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, currency, total_quantity, average_cost)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.ticker, row.name, row.currency, row.totalQuantity, row.averageCost],
    );
  }

  private async insertLedgerRow(row: LedgerTransaction) {
    await this.db.execute(
      `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, date, amount, currency, category, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.accountId, row.date, row.amount, row.currency, row.category, row.note, row.linkedInvestmentRecordId, row.groupId, Number(row.isReviewed), row.receiptAttachmentId],
    );
  }

  private async insertInvestmentRow(row: InvestmentRecord) {
    await this.db.execute(
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.assetId, row.linkedAccountId, row.date, row.action, row.price, row.quantity, row.fee, row.note, Number(row.isReviewed), row.linkedLedgerTransactionId],
    );
  }

  private async findOrCreateSqliteAsset(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
    const rows = await this.db.select<Array<{ id: string }>>(`select id from portfolio_assets where ticker = $1 and deleted_at is null limit 1`, [ticker]);
    if (rows[0]?.id) return rows[0].id;
    const timestamp = nowIso();
    const asset: PortfolioAsset = {
      id: createId("asset"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      ticker,
      name: input.name || ticker,
      currency: input.currency,
      totalQuantity: 0,
      averageCost: 0,
    };
    await this.insertAssetRow(asset);
    return asset.id;
  }

  private async recomputeSqliteAccounts() {
    const accounts = await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, is_shared_to_household as isSharedToHousehold
      from accounts`);
    const ledger = await this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, date, amount, currency, category, note, linked_investment_record_id as linkedInvestmentRecordId,
      group_id as groupId, is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId from ledger_transactions`);
    for (const account of recomputeAccounts(accounts, ledger)) {
      await this.db.execute(`update accounts set balance = $1 where id = $2`, [account.balance, account.id]);
    }
  }

  private async recomputeSqliteAssets() {
    const assets = await this.listPortfolioAssets();
    const records = await this.listInvestmentRecords();
    for (const asset of recomputeAssets(assets, records)) {
      await this.db.execute(`update portfolio_assets set total_quantity = $1, average_cost = $2 where id = $3`, [asset.totalQuantity, asset.averageCost, asset.id]);
    }
  }
}

function createInitialData() {
  return {
    accounts: [...seedAccounts],
    ledgerTransactions: [...seedLedgerTransactions],
    portfolioAssets: [...seedAssets],
    investmentRecords: [...seedInvestmentRecords],
    recurringTransactions: [...seedRecurringTransactions],
    marketQuotes: [] as StoredMarketQuote[],
  };
}

function createLedgerRow(input: LedgerDraft): LedgerTransaction {
  const timestamp = nowIso();
  return {
    id: createId("ledger"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    note: input.note,
    linkedInvestmentRecordId: null,
    groupId: input.groupId ?? null,
    isReviewed: false,
    receiptAttachmentId: null,
  };
}

function createInvestmentRow(input: InvestmentDraft, assetId: string): InvestmentRecord {
  const timestamp = nowIso();
  return {
    id: createId("inv"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    assetId,
    ...investmentDraftFields(input),
    isReviewed: false,
    linkedLedgerTransactionId: null,
  };
}

function investmentDraftFields(input: InvestmentDraft) {
  return {
    linkedAccountId: input.linkedAccountId ?? null,
    date: input.date,
    action: input.action,
    price: input.price,
    quantity: input.quantity,
    fee: input.fee,
    note: input.note,
  };
}

