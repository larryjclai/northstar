import { describe, expect, it } from "vitest";
import { assertLedgerInvariants, assertTransferInvariants, deriveAccountBalances, findMissingFxPairs } from "./ledgerTrust";
import type { Account, LedgerTransaction } from "./types";

const account: Account = {
  id: "acct_twd", spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
  name: "Wallet", currency: "TWD", openingBalance: 100, balance: 999, type: "cash",
  creditLimit: null, creditLimitGroup: "", statementDay: null, paymentDueDay: null,
  creditPaymentPaidUntil: null, isSharedToHousehold: false, loanStartDate: null,
  annualInterestRate: null, loanTerm: null, iconName: null, color: null,
};

function ledger(id: string, amount: number, settlementStatus: LedgerTransaction["settlementStatus"]): LedgerTransaction {
  return {
    id, spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    accountId: account.id, date: "2026-06-01", name: id, amount, currency: "TWD",
    originalAmount: null, originalCurrency: null, category: "", subcategory: "", merchant: "",
    entryType: amount > 0 ? "income" : "expense", settlementStatus, note: "",
    linkedInvestmentRecordId: null, groupId: null, isReviewed: true, receiptAttachmentId: null,
    recurringRuleId: null,
  };
}

describe("ledger trust rules", () => {
  it("derives balances from opening balance and settled rows only", () => {
    expect(deriveAccountBalances([account], [ledger("settled", -20, "settled"), ledger("pending", -90, "payable")])[0].balance).toBe(80);
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
