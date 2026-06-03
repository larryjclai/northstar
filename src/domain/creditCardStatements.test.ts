import { describe, expect, it } from "vitest";
import { buildStatementPeriods, type StatementRow } from "./creditCardStatements";

function row(date: string, amount: number, isReviewed = false): StatementRow {
  return { date, amount, isReviewed };
}

describe("buildStatementPeriods", () => {
  it("splits transactions into billing cycles by statement day", () => {
    const rows = [
      row("2026-05-04T10:00", -100), // closes 2026-05-05
      row("2026-05-05T10:00", -200), // closes 2026-05-05 (on the close day)
      row("2026-05-06T10:00", -300), // next cycle, closes 2026-06-05
      row("2026-05-20T10:00", -400), // closes 2026-06-05
    ];
    const periods = buildStatementPeriods(rows, {
      statementDay: 5,
      paymentDueDay: 22,
      creditPaymentPaidUntil: null,
      today: "2026-05-25",
    });

    // Newest cycle first.
    expect(periods[0].key).toBe("2026-06-05");
    expect(periods[0].rows).toHaveLength(2);
    expect(periods[0].spend).toBe(700);
    expect(periods[0].isCurrent).toBe(true);
    expect(periods[0].dueDate).toBe("2026-06-22");

    expect(periods[1].key).toBe("2026-05-05");
    expect(periods[1].rows).toHaveLength(2);
    expect(periods[1].spend).toBe(300);
    expect(periods[1].isCurrent).toBe(false);
    expect(periods[1].dueDate).toBe("2026-05-22");
    // cycle covers 04/06 – 05/05
    expect(periods[1].start).toBe("2026-04-06");
    expect(periods[1].end).toBe("2026-05-05");
  });

  it("marks a prior statement paid when creditPaymentPaidUntil covers its due date", () => {
    const rows = [row("2026-05-04T10:00", -200), row("2026-05-20T10:00", -300)];
    const periods = buildStatementPeriods(rows, {
      statementDay: 5,
      paymentDueDay: 22,
      creditPaymentPaidUntil: "2026-05-22",
      today: "2026-05-25",
    });
    const may = periods.find((p) => p.key === "2026-05-05")!;
    expect(may.isPaid).toBe(true);
    const current = periods.find((p) => p.key === "2026-06-05")!;
    expect(current.isPaid).toBe(false);
  });

  it("always surfaces the current open cycle even with no transactions", () => {
    const periods = buildStatementPeriods([], {
      statementDay: 5,
      paymentDueDay: 22,
      creditPaymentPaidUntil: null,
      today: "2026-05-25",
    });
    expect(periods).toHaveLength(1);
    expect(periods[0].isCurrent).toBe(true);
    expect(periods[0].rows).toHaveLength(0);
  });

  it("falls back to a single bucket without a statement day", () => {
    const rows = [row("2026-05-04", -100), row("2026-03-01", -50)];
    const periods = buildStatementPeriods(rows, {
      statementDay: null,
      paymentDueDay: null,
      creditPaymentPaidUntil: null,
      today: "2026-05-25",
    });
    expect(periods).toHaveLength(1);
    expect(periods[0].key).toBe("all");
    expect(periods[0].rows).toHaveLength(2);
  });
});
