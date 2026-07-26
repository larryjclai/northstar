import { describe, it, expect } from "vitest";
import {
  selectUpcomingReminders,
  buildPaymentReminders,
  type ScheduledReminder,
} from "./scheduler";

function makeReminder(id: string, minutesFromNow: number): ScheduledReminder {
  const fireAt = new Date(Date.now() + minutesFromNow * 60_000);
  return { id, title: `Title ${id}`, body: `Body ${id}`, fireAt };
}

describe("selectUpcomingReminders", () => {
  const now = new Date("2026-06-27T08:00:00");

  it("drops reminders with fireAt in the past", () => {
    const past: ScheduledReminder = {
      id: "past-1",
      title: "Past",
      body: "Past",
      fireAt: new Date("2026-06-26T12:00:00"),
    };
    const future: ScheduledReminder = {
      id: "future-1",
      title: "Future",
      body: "Future",
      fireAt: new Date("2026-06-28T09:00:00"),
    };
    const result = selectUpcomingReminders([past, future], now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("future-1");
  });

  it("sorts output ascending by fireAt", () => {
    const later: ScheduledReminder = {
      id: "r-later",
      title: "Later",
      body: "Later",
      fireAt: new Date("2026-07-05T09:00:00"),
    };
    const sooner: ScheduledReminder = {
      id: "r-sooner",
      title: "Sooner",
      body: "Sooner",
      fireAt: new Date("2026-06-29T09:00:00"),
    };
    const result = selectUpcomingReminders([later, sooner], now);
    expect(result.map((r) => r.id)).toEqual(["r-sooner", "r-later"]);
  });

  it("deduplicates reminders with the same id (keeps first)", () => {
    const a: ScheduledReminder = {
      id: "dup",
      title: "A",
      body: "A",
      fireAt: new Date("2026-06-28T09:00:00"),
    };
    const b: ScheduledReminder = {
      id: "dup",
      title: "B",
      body: "B",
      fireAt: new Date("2026-06-29T09:00:00"),
    };
    const result = selectUpcomingReminders([a, b], now);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("A");
  });

  it("caps output to max (default 64)", () => {
    const reminders: ScheduledReminder[] = Array.from({ length: 70 }, (_, i) => ({
      id: `r-${i}`,
      title: `Title ${i}`,
      body: `Body ${i}`,
      fireAt: new Date(now.getTime() + (i + 1) * 3600_000),
    }));
    const result = selectUpcomingReminders(reminders, now);
    expect(result).toHaveLength(64);
    // Should be the 64 soonest
    expect(result[0].id).toBe("r-0");
    expect(result[63].id).toBe("r-63");
  });

  it("respects a custom max parameter", () => {
    const reminders: ScheduledReminder[] = Array.from({ length: 10 }, (_, i) => ({
      id: `r-${i}`,
      title: `Title ${i}`,
      body: `Body ${i}`,
      fireAt: new Date(now.getTime() + (i + 1) * 3600_000),
    }));
    const result = selectUpcomingReminders(reminders, now, 3);
    expect(result).toHaveLength(3);
  });
});

describe("buildPaymentReminders", () => {
  it("maps credit-card reminder data to ScheduledReminder format", () => {
    const input = [
      { accountId: "acc-1", name: "中國信託", dueDate: "2026-07-10" },
      { accountId: "acc-2", name: "台新銀行", dueDate: "2026-07-15" },
    ];
    const result = buildPaymentReminders(input);

    expect(result).toHaveLength(2);

    expect(result[0].id).toBe("cc:acc-1:2026-07-10");
    expect(result[0].title).toBe("信用卡繳款提醒");
    expect(result[0].body).toBe("中國信託 將於 2026-07-10 到期");
    expect(result[0].fireAt).toEqual(new Date("2026-07-10T09:00:00"));

    expect(result[1].id).toBe("cc:acc-2:2026-07-15");
    expect(result[1].body).toBe("台新銀行 將於 2026-07-15 到期");
    expect(result[1].fireAt).toEqual(new Date("2026-07-15T09:00:00"));
  });

  it("returns an empty array for empty input", () => {
    expect(buildPaymentReminders([])).toEqual([]);
  });
});
