import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests, type DividendReinvestmentDraft, type InvestmentDraft, type PortfolioAssetDraft } from "./repositories";
import type { Account, InvestmentRecord, PortfolioAsset } from "../domain";
import { buildDividendAnalysis } from "../domain/dividendAnalysis";

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

describe("股息再投入 (DRIP)", () => {
  // Hold an existing position so the reinvestment buy blends into a real cost.
  async function repoWithHolding(quantity = 10, averageCost = 100) {
    const repo = repository();
    await repo.createManualHolding({
      ticker: "QQQ",
      name: "Invesco QQQ",
      currency: "USD",
      totalQuantity: quantity,
      averageCost,
      acquisitionDate: "2026-01-02",
      accountId: "acct_broker",
    });
    return repo;
  }

  const dripBase: DividendReinvestmentDraft = {
    ticker: "QQQ",
    name: "Invesco QQQ",
    currency: "USD",
    linkedAccountId: "acct_broker",
    date: "2026-05-25",
    quantity: 1,
    price: 200,
    dividendAmount: 200,
    note: "Q1 配息再投入",
  };

  it("fully reinvested: creates cashDividend(+A) + buy(Q@P), blends cost, cash nets to 0", async () => {
    const repo = await repoWithHolding(10, 100); // 10 @ 100 = 1,000 cost
    const startBalance = (await repo.listAccounts())[0].balance;

    await repo.createDividendReinvestment(dripBase); // A = 200, 1 @ 200

    const records = await repo.listInvestmentRecords();
    const dividendLeg = records.find((r) => r.action === "cashDividend");
    const buyLeg = records.find((r) => r.action === "buy" && r.dripGroupId);
    expect(dividendLeg).toBeDefined();
    expect(buyLeg).toBeDefined();
    // Both legs share one dripGroupId.
    expect(dividendLeg!.dripGroupId).toBe(buyLeg!.dripGroupId);
    expect(dividendLeg!.dripGroupId).toBeTruthy();
    // Dividend leg follows the new-row convention: price = total amount, qty = 0.
    expect(dividendLeg!.price).toBe(200);
    expect(dividendLeg!.quantity).toBe(0);

    // Position rises by Q with a blended moving-average cost.
    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "QQQ");
    expect(asset.totalQuantity).toBe(11); // 10 + 1
    expect(asset.averageCost).toBeCloseTo((10 * 100 + 1 * 200) / 11, 6); // (1000 + 200) / 11

    // Account cash nets to ~0: +200 dividend − 200 buy.
    const endBalance = (await repo.listAccounts())[0].balance;
    expect(endBalance).toBeCloseTo(startBalance, 6);

    // dividendAnalysis counts the full dividend amount.
    const assetMeta = new Map([[asset.id, { ticker: "QQQ", currency: "USD" }]]);
    const analysis = buildDividendAnalysis({ records, assetMeta, toPrimary: (v) => v, currentMarketValue: 0, asOf: "2026-12-31" });
    expect(analysis.total).toBeCloseTo(200, 6);
  });

  it("partial reinvestment: residual cash stays, full dividend still counted", async () => {
    const repo = await repoWithHolding(10, 100);
    const startBalance = (await repo.listAccounts())[0].balance;

    // A = 200, reinvest 0.5 @ 200 = 100 → residual 100 stays in the account.
    await repo.createDividendReinvestment({ ...dripBase, quantity: 0.5, price: 200, dividendAmount: 200 });

    const endBalance = (await repo.listAccounts())[0].balance;
    expect(endBalance - startBalance).toBeCloseTo(100, 6); // residual

    const records = await repo.listInvestmentRecords();
    const [asset] = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "QQQ");
    const assetMeta = new Map([[asset.id, { ticker: "QQQ", currency: "USD" }]]);
    const analysis = buildDividendAnalysis({ records, assetMeta, toPrimary: (v) => v, currentMarketValue: 0, asOf: "2026-12-31" });
    expect(analysis.total).toBeCloseTo(200, 6); // full amount counted, not the net
  });

  it("rejects when the dividend cannot cover qty × price", async () => {
    const repo = await repoWithHolding();
    await expect(
      repo.createDividendReinvestment({ ...dripBase, quantity: 1, price: 200, dividendAmount: 150 }),
    ).rejects.toThrow("股利金額不足");
    // No legs were written.
    const records = await repo.listInvestmentRecords();
    expect(records.some((r) => r.dripGroupId)).toBe(false);
  });

  it("rejects non-positive quantity or price", async () => {
    const repo = await repoWithHolding();
    await expect(repo.createDividendReinvestment({ ...dripBase, quantity: 0 })).rejects.toThrow("再投入股數");
    await expect(repo.createDividendReinvestment({ ...dripBase, price: 0, dividendAmount: 0 })).rejects.toThrow("再投入價格");
  });

  it("deleting either leg removes BOTH legs (no orphan)", async () => {
    const repo = await repoWithHolding();
    await repo.createDividendReinvestment(dripBase);

    let records = await repo.listInvestmentRecords();
    const dripLegs = records.filter((r) => r.dripGroupId);
    expect(dripLegs).toHaveLength(2);

    // Delete via the buy leg → both the buy and the cashDividend should vanish.
    await repo.deleteInvestmentRecord(dripLegs.find((r) => r.action === "buy")!.id);

    records = await repo.listInvestmentRecords();
    expect(records.some((r) => r.dripGroupId)).toBe(false);
    expect(records.some((r) => r.action === "cashDividend")).toBe(false);
    // Linked ledger legs are gone too (no orphan cash rows from this DRIP).
    const ledger = await repo.listLedgerTransactions();
    expect(ledger.filter((row) => row.subcategory === "股利")).toHaveLength(0);
  });

  it("posts the dividend before the buy so a zero-balance account still reinvests", async () => {
    // Fresh broker with NO opening cash; only the dividend funds the buy.
    const repo = createMemoryFinanceRepositoryForTests({
      accounts: [{ ...account, openingBalance: 0, balance: 0 }],
      ledgerTransactions: [],
      portfolioAssets: [],
      investmentRecords: [],
      recurringTransactions: [],
      marketQuotes: [],
      dailyFxRates: [],
      dailyPrices: [],
      financialGoals: [],
    });
    await repo.createManualHolding({
      ticker: "QQQ", name: "Invesco QQQ", currency: "USD",
      totalQuantity: 10, averageCost: 100, acquisitionDate: "2026-01-02", accountId: "acct_broker",
    });
    // Fully reinvested on a 0 balance: only passes because dividend posts first.
    await expect(repo.createDividendReinvestment(dripBase)).resolves.toBeUndefined();
    const balance = (await repo.listAccounts())[0].balance;
    expect(balance).toBeCloseTo(0, 6);
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

describe("same-ticker holding identity (Plan 058)", () => {
  const imported: PortfolioAssetDraft = {
    ticker: "CRWD",
    name: "CrowdStrike",
    currency: "USD",
    totalQuantity: 3.5,
    averageCost: 200,
    acquisitionDate: "2026-01-02",
    accountId: null, // account-less import (the bug's trigger)
  };

  const buyCrwd: InvestmentDraft = {
    ticker: "CRWD",
    name: "CrowdStrike",
    currency: "USD",
    linkedAccountId: "acct_broker",
    date: "2026-05-25",
    action: "buy",
    price: 400,
    quantity: 0.5,
    fee: 0,
    note: "",
  };

  it("account-less import + later buy of same ticker accumulates into ONE asset", async () => {
    const repo = repository();
    await repo.createManualHolding(imported);
    await repo.createInvestmentRecord(buyCrwd);

    const assets = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "CRWD" && a.deletedAt === null);
    expect(assets).toHaveLength(1);
    const [asset] = assets;
    // 3.5 imported + 0.5 bought = 4.0 shares.
    expect(asset.totalQuantity).toBeCloseTo(4, 6);
    // Blended moving-average cost: (3.5*200 + 0.5*400) / 4 = 900 / 4 = 225.
    expect(asset.averageCost).toBeCloseTo(225, 6);

    // Account adoption: the imported holding adopts the trade's account, and its
    // opening record's linkedAccountId is re-pointed so per-account quantity is
    // correct (a sell up to 4 in acct_broker is allowed).
    expect(asset.accountId).toBe("acct_broker");

    // Revision-bump parity with the SQLite mirror: the adoption mutates the
    // asset's accountId and the opening record's linkedAccountId, so both must
    // bump revision/updatedAt or the change loses LWW and never syncs.
    expect(asset.revision).toBeGreaterThan(1);
    const records = await repo.listInvestmentRecords();
    const opening = records.find((r) => r.assetId === asset.id && r.cashless && r.deletedAt === null);
    expect(opening?.linkedAccountId).toBe("acct_broker");
    expect(opening?.revision).toBeGreaterThan(1);

    await expect(
      repo.createInvestmentRecord({ ...buyCrwd, action: "sell", price: 400, quantity: 4, fee: 0 }),
    ).resolves.toBeUndefined();
  });

  it("import linked to account A + buy in account A stays ONE asset (regression guard)", async () => {
    const repo = repository();
    await repo.createManualHolding({ ...imported, accountId: "acct_broker" });
    await repo.createInvestmentRecord(buyCrwd);

    const assets = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "CRWD" && a.deletedAt === null);
    expect(assets).toHaveLength(1);
    expect(assets[0].totalQuantity).toBeCloseTo(4, 6);
    expect(assets[0].averageCost).toBeCloseTo(225, 6);
  });

  it("GOOG and GOOGL remain separate (different securities, no cross-ticker merge)", async () => {
    const repo = repository();
    await repo.createManualHolding({ ...imported, ticker: "GOOG", name: "Alphabet C" });
    await repo.createInvestmentRecord({ ...buyCrwd, ticker: "GOOGL", name: "Alphabet A" });

    const tickers = (await repo.listPortfolioAssets()).filter((a) => a.deletedAt === null).map((a) => a.ticker).sort();
    expect(tickers).toEqual(["GOOG", "GOOGL"]);
  });

  it("reconciles a pre-existing manual+transaction split into one asset, idempotently", async () => {
    const manualAsset: PortfolioAsset = {
      id: "asset_manual",
      spaceId: "space_test",
      revision: 1,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: null,
      ticker: "CRWD",
      name: "CrowdStrike",
      nameZh: null,
      nameEn: null,
      currency: "USD",
      totalQuantity: 3.5,
      averageCost: 200,
      holdingSource: "manual",
      acquisitionDate: "2026-01-02",
      assetType: null,
      sector: null,
      industry: null,
      accountId: "acct_broker",
      baseQuantity: 3.5,
    };
    const txAsset: PortfolioAsset = {
      ...manualAsset,
      id: "asset_tx",
      holdingSource: "transactions",
      totalQuantity: 0.5,
      averageCost: 400,
      baseQuantity: null,
    };
    const txBuy: InvestmentRecord = {
      id: "rec_tx_buy",
      spaceId: "space_test",
      revision: 1,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      deletedAt: null,
      assetId: "asset_tx",
      linkedAccountId: "acct_broker",
      date: "2026-05-25",
      action: "buy",
      price: 400,
      quantity: 0.5,
      fee: 0,
      note: "",
      isReviewed: false,
      linkedLedgerTransactionId: null,
      cashless: false,
    };
    const repo = createMemoryFinanceRepositoryForTests({
      accounts: [account],
      portfolioAssets: [manualAsset, txAsset],
      investmentRecords: [txBuy],
    });

    // Reconcile (run on load) tombstones the transaction asset and moves its
    // records onto the manual asset.
    await repo.recalculateDerivedData();
    const live = (await repo.listPortfolioAssets()).filter((a) => a.ticker === "CRWD" && a.deletedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe("asset_manual");
    expect(live[0].totalQuantity).toBeCloseTo(4, 6);
    expect(live[0].averageCost).toBeCloseTo(225, 6);
    // The moved record now points at the surviving manual asset.
    const movedBuy = (await repo.listInvestmentRecords()).find((r) => r.id === "rec_tx_buy");
    expect(movedBuy?.assetId).toBe("asset_manual");

    // Idempotent: export → re-import yields the same single live asset, no new split.
    const exported = await repo.exportSnapshot();
    const repo2 = createMemoryFinanceRepositoryForTests();
    await repo2.importSnapshot(exported);
    await repo2.recalculateDerivedData();
    const live2 = (await repo2.listPortfolioAssets()).filter((a) => a.ticker === "CRWD" && a.deletedAt === null);
    expect(live2).toHaveLength(1);
    expect(live2[0].totalQuantity).toBeCloseTo(4, 6);
    expect(live2[0].averageCost).toBeCloseTo(225, 6);
  });
});

