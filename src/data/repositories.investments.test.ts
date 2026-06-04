import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests, type InvestmentDraft, type PortfolioAssetDraft } from "./repositories";
import type { Account, PortfolioAsset } from "../domain";

const account: Account = {
  id: "acct_broker",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "Firstrade",
  currency: "USD",
  openingBalance: 1000,
  balance: 1000,
  type: "investment",
  creditLimit: null,
  creditLimitGroup: "",
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
  statementDay: null,
  paymentDueDay: null,
  creditPaymentPaidUntil: null,
};

const buyDraft: InvestmentDraft = {
  ticker: "QQQ",
  name: "Invesco QQQ",
  currency: "USD",
  linkedAccountId: "acct_broker",
  date: "2026-05-25",
  action: "buy",
  price: 100,
  quantity: 2,
  fee: 5,
  note: "",
};

function repository() {
  return createMemoryFinanceRepositoryForTests({
    accounts: [account],
    ledgerTransactions: [],
    portfolioAssets: [],
    investmentRecords: [],
    recurringTransactions: [],
    marketQuotes: [],
    dailyFxRates: [],
    dailyPrices: [],
    financialGoals: [],
  });
}

describe("investment repository cash posting", () => {
  it("creates linked ledger rows and recomputes brokerage cash", async () => {
    const repo = repository();
    await repo.createInvestmentRecord(buyDraft);

    const [ledger] = await repo.listLedgerTransactions();
    const [record] = await repo.listInvestmentRecords();
    const [broker] = await repo.listAccounts();

    expect(ledger.amount).toBe(-205);
    expect(ledger.linkedInvestmentRecordId).toBe(record.id);
    expect(record.linkedLedgerTransactionId).toBe(ledger.id);
    expect(broker.balance).toBe(795);
  });

  it("blocks buys that exceed brokerage cash", async () => {
    const repo = repository();
    await expect(repo.createInvestmentRecord({ ...buyDraft, price: 600, quantity: 2 })).rejects.toThrow("購買力不足");
  });

  it("blocks sells above the selected brokerage inventory", async () => {
    const repo = repository();
    await repo.createInvestmentRecord(buyDraft);
    await expect(repo.createInvestmentRecord({ ...buyDraft, action: "sell", price: 100, quantity: 3, fee: 0 })).rejects.toThrow("賣出股數大於目前庫存");
  });

  it("allows sells from manual holdings and recomputes quantity", async () => {
    const repo = repository();
    const holding: PortfolioAssetDraft = {
      ticker: "NFLX",
      name: "Netflix, Inc.",
      currency: "USD",
      totalQuantity: 11,
      averageCost: 88.18,
      acquisitionDate: null,
      accountId: "acct_broker",
    };
    await repo.createManualHolding(holding);

    const sellDraft: InvestmentDraft = {
      ticker: "NFLX",
      name: "Netflix, Inc.",
      currency: "USD",
      linkedAccountId: "acct_broker",
      date: "2026-05-26",
      action: "sell",
      price: 87.98,
      quantity: 2,
      fee: 0,
      note: "",
    };
    await expect(repo.createInvestmentRecord(sellDraft)).resolves.toBeUndefined();

    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "NFLX");
    expect(asset.totalQuantity).toBe(9);
  });

  it("blocks sells that exceed manual holding quantity", async () => {
    const repo = repository();
    const holding: PortfolioAssetDraft = {
      ticker: "NFLX",
      name: "Netflix, Inc.",
      currency: "USD",
      totalQuantity: 11,
      averageCost: 88.18,
      acquisitionDate: null,
      accountId: "acct_broker",
    };
    await repo.createManualHolding(holding);

    const oversellDraft: InvestmentDraft = {
      ticker: "NFLX",
      name: "Netflix, Inc.",
      currency: "USD",
      linkedAccountId: "acct_broker",
      date: "2026-05-26",
      action: "sell",
      price: 87.98,
      quantity: 12,
      fee: 0,
      note: "",
    };
    await expect(repo.createInvestmentRecord(oversellDraft)).rejects.toThrow("賣出股數大於目前庫存");
  });

  it("updates and deletes linked ledger rows", async () => {
    const repo = repository();
    await repo.createInvestmentRecord(buyDraft);
    const [created] = await repo.listInvestmentRecords();

    await repo.updateInvestmentRecord(created.id, { ...buyDraft, quantity: 3 });
    let [ledger] = await repo.listLedgerTransactions();
    let [broker] = await repo.listAccounts();
    expect(ledger.amount).toBe(-305);
    expect(broker.balance).toBe(695);

    await repo.deleteInvestmentRecord(created.id);
    expect(await repo.listLedgerTransactions()).toHaveLength(0);
    [broker] = await repo.listAccounts();
    expect(broker.balance).toBe(1000);
  });
});

describe("manual holdings as opening-balance lots", () => {
  const snapshot: PortfolioAssetDraft = {
    ticker: "VOO",
    name: "Vanguard S&P 500",
    currency: "USD",
    totalQuantity: 10,
    averageCost: 400,
    acquisitionDate: "2026-01-02",
    accountId: "acct_broker",
  };

  it("creates a single cashless opening record and posts no cash leg", async () => {
    const repo = repository();
    await repo.createManualHolding(snapshot);

    const records = await repo.listInvestmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: "buy", cashless: true, quantity: 10, price: 400, date: "2026-01-02" });

    // The opening lot records an already-held position — no 交割 ledger leg, so
    // the linked account cash is untouched.
    expect(await repo.listLedgerTransactions()).toHaveLength(0);
    const [broker] = await repo.listAccounts();
    expect(broker.balance).toBe(1000);

    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "VOO");
    expect(asset.totalQuantity).toBe(10);
    expect(asset.averageCost).toBeCloseTo(400, 6);
  });

  it("blends average cost when a later real buy is recorded (and that buy posts a cash leg)", async () => {
    const repo = repository();
    await repo.createManualHolding(snapshot);
    // Real buy: 10 @ 50 (affordable within the 1000 balance). Blended average =
    // (10*400 + 10*50) / 20 = 4500 / 20 = 225.
    await repo.createInvestmentRecord({
      ticker: "VOO", name: "Vanguard S&P 500", currency: "USD", linkedAccountId: "acct_broker",
      date: "2026-03-01", action: "buy", price: 50, quantity: 10, fee: 0, note: "",
    });

    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "VOO");
    expect(asset.totalQuantity).toBe(20);
    expect(asset.averageCost).toBeCloseTo(225, 6);

    // The real buy posted a cash leg; the opening did not.
    const ledgers = await repo.listLedgerTransactions();
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].amount).toBe(-500);
  });

  it("deletes a pure snapshot (removing its opening lot)", async () => {
    const repo = repository();
    await repo.createManualHolding(snapshot);
    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "VOO");
    await repo.deleteManualHolding(asset.id);
    expect(await repo.listPortfolioAssets()).toHaveLength(0);
    expect(await repo.listInvestmentRecords()).toHaveLength(0);
  });

  it("blocks deletion once a real trade exists", async () => {
    const repo = repository();
    await repo.createManualHolding(snapshot);
    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "VOO");
    await repo.createInvestmentRecord({
      ticker: "VOO", name: "Vanguard S&P 500", currency: "USD", linkedAccountId: "acct_broker",
      date: "2026-03-01", action: "buy", price: 50, quantity: 1, fee: 0, note: "",
    });
    await expect(repo.deleteManualHolding(asset.id)).rejects.toThrow("已有逐筆交易");
  });

  it("migrates a legacy manual holding into an opening lot, idempotently", async () => {
    const legacyAsset: PortfolioAsset = {
      id: "asset_legacy",
      spaceId: "space_test",
      revision: 1,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: null,
      ticker: "VOO",
      name: "Vanguard S&P 500",
      nameZh: null,
      nameEn: null,
      currency: "USD",
      totalQuantity: 10,
      averageCost: 400,
      holdingSource: "manual",
      acquisitionDate: "2026-01-02",
      assetType: null,
      sector: null,
      industry: null,
      accountId: "acct_broker",
      baseQuantity: 10,
    };
    const repo = createMemoryFinanceRepositoryForTests({ accounts: [account], portfolioAssets: [legacyAsset], investmentRecords: [] });

    // normalizeStoredData (run on load) materializes the opening lot.
    const records = await repo.listInvestmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "inv_open_asset_legacy", assetId: "asset_legacy", cashless: true, quantity: 10, price: 400 });

    // Deriving from the opening lot reproduces the snapshot quantity + cost.
    await repo.recalculateDerivedData();
    const [asset] = await repo.listPortfolioAssets();
    expect(asset.totalQuantity).toBe(10);
    expect(asset.averageCost).toBeCloseTo(400, 6);

    // Idempotent: export → re-import does not duplicate the opening lot.
    const exported = await repo.exportSnapshot();
    const repo2 = createMemoryFinanceRepositoryForTests();
    await repo2.importSnapshot(exported);
    expect(await repo2.listInvestmentRecords()).toHaveLength(1);
  });
});

