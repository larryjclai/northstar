import { describe, expect, it } from "vitest";
import { createMemoryFinanceRepositoryForTests, type InvestmentDraft } from "./repositories";
import type { Account } from "../domain";

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

