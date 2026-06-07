import { describe, expect, it } from "vitest";
import { accountBalanceDelta, assertLedgerInvariants, assertTransferInvariants, deriveAccountBalances, findMissingFxPairs } from "./ledgerTrust";
import type { Account, LedgerTransaction } from "./types";

const account: Account = {
  id: "acct_twd", spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
  name: "Wallet", currency: "TWD", openingBalance: 100, balance: 999, type: "cash",
  creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null,
  creditPaymentPaidUntil: null, isSharedToHousehold: false, loanStartDate: null,
  annualInterestRate: null, loanTerm: null, iconName: null, color: null,
};

function ledger(
  id: string,
  amount: number,
  settlementStatus: LedgerTransaction["settlementStatus"],
  overrides: Partial<LedgerTransaction> = {},
): LedgerTransaction {
  return {
    id, spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    accountId: account.id, counterAccountId: null, date: "2026-06-01", name: id, amount, currency: "TWD",
    originalAmount: null, originalCurrency: null, category: "", subcategory: "", merchant: "",
    entryType: amount > 0 ? "income" : "expense", settlementStatus, note: "",
    linkedInvestmentRecordId: null, groupId: null, isReviewed: true, receiptAttachmentId: null,
    recurringRuleId: null,
    ...overrides,
  };
}

describe("ledger trust rules", () => {
  it("derives balances from opening balance and settled rows only", () => {
    expect(deriveAccountBalances([account], [ledger("settled", -20, "settled"), ledger("pending", -90, "payable")])[0].balance).toBe(80);
  });

  it("treats 代墊 receivable/payable as a two-leg pass-through (net zero)", () => {
    const bank: Account = { ...account, id: "acct_bank", openingBalance: 0 };
    const cash = { ...account, openingBalance: 0 }; // acct_twd

    // 應收 代墊: amount +100, accountId = bank (收款), counterAccountId = cash (付款).
    const pendingAr = ledger("ar", 100, "receivable", { accountId: bank.id, counterAccountId: cash.id });
    const pending = deriveAccountBalances([cash, bank], [pendingAr]);
    expect(pending.find((a) => a.id === cash.id)!.balance).toBe(-100); // fronted now
    expect(pending.find((a) => a.id === bank.id)!.balance).toBe(0);    // not yet received

    const settledAr = { ...pendingAr, settlementStatus: "settled" as const };
    const settled = deriveAccountBalances([cash, bank], [settledAr]);
    expect(settled.find((a) => a.id === cash.id)!.balance).toBe(-100); // still out the cash
    expect(settled.find((a) => a.id === bank.id)!.balance).toBe(100);  // repaid into bank
    // Whole portfolio nets to zero across the lifecycle.
    expect(settled.reduce((s, a) => s + a.balance, 0)).toBe(0);
  });

  it("accountBalanceDelta mirrors deriveAccountBalances for 代墊 legs", () => {
    const row = ledger("ap", -100, "payable", { accountId: "pay", counterAccountId: "recv" });
    // 應付 代墊: counter (收款) gets +100 now, main (付款) -100 on settle.
    expect(accountBalanceDelta(row, "recv")).toBe(100);
    expect(accountBalanceDelta(row, "pay")).toBe(0); // pending → main leg not posted
    const settled = { ...row, settlementStatus: "settled" as const };
    expect(accountBalanceDelta(settled, "pay")).toBe(-100);
    expect(accountBalanceDelta(settled, "recv")).toBe(100);
  });

  it("rejects invalid signs, zero, and account currency mismatches", () => {
    expect(() => assertLedgerInvariants({ accountId: account.id, amount: 0, currency: "TWD", entryType: "expense" }, [account])).toThrow();
    expect(() => assertLedgerInvariants({ accountId: account.id, amount: 20, currency: "TWD", entryType: "expense" }, [account])).toThrow();
    expect(() => assertLedgerInvariants({ accountId: account.id, amount: 20, currency: "USD", entryType: "income" }, [account])).toThrow();
  });

  it("rejects same-account and unbalanced same-currency transfers", () => {
    const destination = { ...account, id: "acct_destination" };
    expect(() => assertTransferInvariants({ sourceAccountId: account.id, destinationAccountId: account.id, sourceCurrency: "TWD", destinationCurrency: "TWD", sourceAmount: 10 }, [account])).toThrow();
    expect(() => assertTransferInvariants({ sourceAccountId: account.id, destinationAccountId: destination.id, sourceCurrency: "TWD", destinationCurrency: "TWD", sourceAmount: 10, destinationAmount: 11 }, [account, destination])).toThrow();
    expect(() => assertTransferInvariants({ sourceAccountId: account.id, destinationAccountId: destination.id, sourceCurrency: "TWD", destinationCurrency: "TWD", sourceAmount: 10, destinationAmount: 10 }, [account, destination])).not.toThrow();
  });

  it("reports currencies that cannot be converted into the primary currency", () => {
    expect(findMissingFxPairs([{ ...account, currency: "USD" }], [], [], {
      primaryCurrency: "TWD", categories: [], merchants: [], exchangeRates: [],
    }, [])).toEqual(["USD/TWD"]);
  });
});
