import { describe, expect, it } from "vitest";
import { buildCreditCardReminders } from "./dashboardSummary";
import type { Account } from "./types";

const card: Account = {
  id: "cc1",
  spaceId: "s",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "玉山信用卡",
  currency: "TWD",
  openingBalance: 0,
  balance: -3200, // owes 3200
  type: "credit",
  creditLimit: 100000,
  creditLimitGroup: "",
  bookId: "book_test_default",
  statementDay: 5,
  paymentDueDay: 22,
  creditPaymentPaidUntil: null,
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
};

const identity = (n: number) => n;

describe("buildCreditCardReminders", () => {
  it("computes the next due date and outstanding amount", () => {
    const r = buildCreditCardReminders([card], "2026-05-10", identity);
    expect(r).toHaveLength(1);
    expect(r[0].dueDate).toBe("2026-05-22");
    expect(r[0].outstanding).toBe(3200);
    expect(r[0].daysUntilDue).toBe(12);
  });

  it("rolls to next month when the due day has passed", () => {
    const r = buildCreditCardReminders([card], "2026-05-25", identity);
    expect(r[0].dueDate).toBe("2026-06-22");
  });

  it("skips cards with no balance owed or no due day", () => {
    const paid = { ...card, balance: 0 };
    const noDue = { ...card, id: "cc2", paymentDueDay: null };
    expect(buildCreditCardReminders([paid, noDue], "2026-05-10", identity)).toHaveLength(0);
  });
});
