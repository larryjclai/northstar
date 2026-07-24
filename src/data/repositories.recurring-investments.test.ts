import { expect, it } from "vitest";
import { describeEachRepo } from "./repositories.testHarness";
import type { Account, RecurringInvestment } from "../domain";

const cash: Account = {
  id: "acct_cash",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "券商交割",
  currency: "TWD",
  openingBalance: 100000,
  balance: 100000,
  type: "investment",
  creditLimit: null,
  creditLimitGroup: "",
  creditGroupId: null,
  bookId: "book_test_default",
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

function rule(overrides: Partial<RecurringInvestment> = {}): RecurringInvestment {
  return {
    id: "recinv_0050",
    spaceId: "space_test",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    accountId: "acct_cash",
    ticker: "0050.TW",
    name: "元大台灣50",
    currency: "TWD",
    mode: "fixedAmount",
    amount: 10000,
    quantity: 0,
    price: 100,
    fee: 0,
    frequency: "monthly",
    dayOfMonth: 1,
    nextRunDate: "2099-01-01",
    isActive: true,
    note: "",
    ...overrides,
  };
}

describeEachRepo("recurring investments", (makeRepo) => {
  it("posting a fixedAmount plan creates a buy record + cash settlement and advances", async () => {
    const repo = await makeRepo({ accounts: [cash], recurringInvestments: [rule()] });
    await repo.postRecurringInvestment("recinv_0050");

    const records = await repo.listInvestmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0].action).toBe("buy");
    expect(records[0].quantity).toBe(100); // 10000 / 100

    // 交割款 deducted from the cash account.
    const accounts = await repo.listAccounts();
    expect(accounts[0].balance).toBe(90000);

    const [advanced] = await repo.listRecurringInvestments();
    expect(advanced.nextRunDate).toBe("2099-02-01");
  });

  it("posting a fixedShares plan buys the configured share count", async () => {
    const repo = await makeRepo({
      accounts: [cash],
      recurringInvestments: [rule({ mode: "fixedShares", quantity: 50, amount: 0, price: 100 })],
    });
    await repo.postRecurringInvestment("recinv_0050");
    const records = await repo.listInvestmentRecords();
    expect(records[0].quantity).toBe(50);
    const accounts = await repo.listAccounts();
    expect(accounts[0].balance).toBe(95000); // 50 * 100
  });

  it("rejects posting without a usable price", async () => {
    const repo = await makeRepo({ accounts: [cash], recurringInvestments: [rule({ price: 0 })] });
    await expect(repo.postRecurringInvestment("recinv_0050")).rejects.toThrow();
  });

  it("posting preserves the rule's stored fee into the created investment record", async () => {
    const repo = await makeRepo({ accounts: [cash], recurringInvestments: [rule({ fee: 15 })] });
    await repo.postRecurringInvestment("recinv_0050");

    const records = await repo.listInvestmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0].fee).toBe(15);
  });

  it("TW fixedAmount floors to whole shares (no fractional TW lots)", async () => {
    const repo = await makeRepo({
      accounts: [cash],
      recurringInvestments: [rule({ ticker: "2330.TW", amount: 3000, price: 612 })],
    });
    await repo.postRecurringInvestment("recinv_0050");

    const records = await repo.listInvestmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0].quantity).toBe(4); // floor(3000 / 612) = floor(4.901...) = 4

    // settlement cash leg is quantity * price + fee, not the nominal amount.
    const accounts = await repo.listAccounts();
    expect(accounts[0].balance).toBe(100000 - 4 * 612);
  });

  it("TW fixedAmount insufficient to buy 1 share rejects with 本期不成立 and posts nothing", async () => {
    const repo = await makeRepo({
      accounts: [cash],
      recurringInvestments: [rule({ ticker: "2330.TW", amount: 500, price: 612 })],
    });
    await expect(repo.postRecurringInvestment("recinv_0050")).rejects.toThrow(
      "金額不足以買進 1 股，本期不成立（實務上券商會整筆退還），未記錄任何交易。請提高金額或更新參考價格。",
    );

    expect(await repo.listInvestmentRecords()).toHaveLength(0);
    const accounts = await repo.listAccounts();
    expect(accounts[0].balance).toBe(100000);
  });

  it("US fixedAmount keeps fractional shares floored to 4 decimal places", async () => {
    const repo = await makeRepo({
      accounts: [cash],
      recurringInvestments: [rule({ ticker: "VOO", amount: 500, price: 411.3 })],
    });
    await repo.postRecurringInvestment("recinv_0050");

    const records = await repo.listInvestmentRecords();
    expect(records[0].quantity).toBe(1.2156); // floor(500 / 411.3 = 1.21565...) to 4dp
  });

  it("TW fixedShares with an integer quantity still posts (regression)", async () => {
    const repo = await makeRepo({
      accounts: [cash],
      recurringInvestments: [rule({ ticker: "2330.TW", mode: "fixedShares", quantity: 10, amount: 0, price: 612 })],
    });
    await repo.postRecurringInvestment("recinv_0050");

    const records = await repo.listInvestmentRecords();
    expect(records[0].quantity).toBe(10);
  });

  it("TW fixedShares with a non-integer quantity rejects", async () => {
    const repo = await makeRepo({
      accounts: [cash],
      recurringInvestments: [rule({ ticker: "2330.TW", mode: "fixedShares", quantity: 0.5, amount: 0, price: 612 })],
    });
    await expect(repo.postRecurringInvestment("recinv_0050")).rejects.toThrow(
      "台股定期定股的股數必須是整數，請先編輯規則。",
    );
  });

  it("create / update / delete round-trips", async () => {
    const repo = await makeRepo({ accounts: [cash] });
    await repo.createRecurringInvestment({
      accountId: "acct_cash", ticker: "2330.tw", name: "台積電", currency: "TWD",
      mode: "fixedShares", amount: 0, quantity: 10, price: 1000, fee: 0,
      frequency: "monthly", dayOfMonth: 10, nextRunDate: "2099-01-10", isActive: true, note: "",
    });
    let rules = await repo.listRecurringInvestments();
    expect(rules).toHaveLength(1);
    expect(rules[0].ticker).toBe("2330.TW"); // normalised upper-case

    await repo.updateRecurringInvestment(rules[0].id, {
      accountId: "acct_cash", ticker: "2330.TW", name: "台積電", currency: "TWD",
      mode: "fixedShares", amount: 0, quantity: 20, price: 1000, fee: 0,
      frequency: "monthly", dayOfMonth: 10, nextRunDate: "2099-01-10", isActive: true, note: "",
    });
    rules = await repo.listRecurringInvestments();
    expect(rules[0].quantity).toBe(20);

    await repo.deleteRecurringInvestment(rules[0].id);
    expect(await repo.listRecurringInvestments()).toHaveLength(0);
  });
});
