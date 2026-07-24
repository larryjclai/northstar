import { describe, expect, it } from "vitest";
import { buildStatementPeriods, type StatementRow } from "./creditCardStatements";

function row(date: string, amount: number, isReviewed = false): StatementRow {
  return { date, amount, isReviewed };
}

function rowWithPost(date: string, postDate: string | null, amount: number): StatementRow {
  return { date, postDate, amount, isReviewed: false };
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

  it("buckets a deferred charge into the cycle of its postDate, not its date", () => {
    // Purchased 05-04 (before the 05-05 close) but posts 05-20 (after it), so
    // it bills to the NEXT cycle closing 2026-06-05. Purchase date is preserved.
    const rows = [rowWithPost("2026-05-04T10:00", "2026-05-20T10:00", -150)];
    const periods = buildStatementPeriods(rows, {
      statementDay: 5,
      paymentDueDay: 22,
      creditPaymentPaidUntil: null,
      today: "2026-05-25",
    });

    const next = periods.find((p) => p.key === "2026-06-05")!;
    expect(next.rows).toHaveLength(1);
    expect(next.spend).toBe(150);
    // The displayed date stays the purchase date, not the posting date.
    expect(next.rows[0].date).toBe("2026-05-04T10:00");

    const prior = periods.find((p) => p.key === "2026-05-05");
    expect(prior?.rows ?? []).toHaveLength(0);
  });

  it("with no postDate, buckets exactly by date (regression)", () => {
    const withNull = [rowWithPost("2026-05-04T10:00", null, -150)];
    const plain = [row("2026-05-04T10:00", -150)];
    const opts = {
      statementDay: 5,
      paymentDueDay: 22,
      creditPaymentPaidUntil: null,
      today: "2026-05-25",
    } as const;

    const fromNull = buildStatementPeriods(withNull, opts);
    const fromPlain = buildStatementPeriods(plain, opts);

    // 05-04 is on-or-before the 05-05 close → bills to the 2026-05-05 cycle.
    const nullCycle = fromNull.find((p) => p.key === "2026-05-05")!;
    expect(nullCycle.rows).toHaveLength(1);
    // Identical placement to the no-postDate row.
    expect(fromPlain.find((p) => p.key === "2026-05-05")!.rows).toHaveLength(1);
    expect(fromNull.find((p) => p.key === "2026-06-05")!.rows).toHaveLength(0);
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

  it("paying a closed statement's due date does NOT mark the open cycle paid (plan 251)", () => {
    const rows = [
      row("2026-07-10T10:00", -1000),
      row("2026-07-20T10:00", -1749),
    ];
    const opts = { statementDay: 15, paymentDueDay: 3, today: "2026-07-24" } as const;
    const periods = buildStatementPeriods(rows, { ...opts, creditPaymentPaidUntil: "2026-08-03" });
    const closed = periods.find((p) => p.end === "2026-07-15")!;
    const open = periods.find((p) => p.isCurrent)!;
    expect(closed.isPaid).toBe(true);
    expect(open.isPaid).toBe(false);
    expect(open.dueDate).toBe("2026-09-03");
  });
});
