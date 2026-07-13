import { describe, expect, it } from "vitest";
import type { Account } from "./types";
import { buildReminderNotifications, unacknowledgedReminders } from "./reminderNotifications";

// Reuse the same Account fixture shape as creditCardReminders.test.ts
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
  balance: -3200,
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

describe("buildReminderNotifications", () => {
  it("produces a notification with the correct id format cc:<accountId>:<dueDate>", () => {
    const results = buildReminderNotifications([card], "2026-05-10");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("cc:cc1:2026-05-22");
  });

  it("populates title, body, dueDate, and daysUntilDue", () => {
    const results = buildReminderNotifications([card], "2026-05-10");
    const n = results[0];
    expect(n.title).toBe("信用卡繳款提醒");
    expect(n.body).toBe("玉山信用卡 將於 2026-05-22 到期");
    expect(n.dueDate).toBe("2026-05-22");
    expect(n.daysUntilDue).toBe(12);
  });

  it("excludes reminders beyond withinDays (default 45)", () => {
    // Due in 12 days → included by default
    const included = buildReminderNotifications([card], "2026-05-10");
    expect(included).toHaveLength(1);

    // Due in 12 days but withinDays = 5 → excluded
    const excluded = buildReminderNotifications([card], "2026-05-10", 5);
    expect(excluded).toHaveLength(0);
  });

  it("returns an empty array when there are no credit accounts with a balance owed", () => {
    const paid = { ...card, balance: 0 };
    expect(buildReminderNotifications([paid], "2026-05-10")).toHaveLength(0);
  });
});

describe("unacknowledgedReminders", () => {
  const n1 = { id: "cc:cc1:2026-05-22", title: "T", body: "B", dueDate: "2026-05-22", daysUntilDue: 12 };
  const n2 = { id: "cc:cc2:2026-06-15", title: "T", body: "B", dueDate: "2026-06-15", daysUntilDue: 36 };
  const n3 = { id: "cc:cc3:2026-07-01", title: "T", body: "B", dueDate: "2026-07-01", daysUntilDue: 52 };

  it("filters out acknowledged ids and returns the remaining two", () => {
    const result = unacknowledgedReminders([n1, n2, n3], [n1.id]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual([n2.id, n3.id]);
  });

  it("returns all when acknowledged list is empty", () => {
    expect(unacknowledgedReminders([n1, n2, n3], [])).toHaveLength(3);
  });

  it("returns none when all are acknowledged", () => {
    expect(unacknowledgedReminders([n1, n2, n3], [n1.id, n2.id, n3.id])).toHaveLength(0);
  });
});
