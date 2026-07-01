import { buildCreditCardReminders } from "./dashboardSummary";
import type { Account } from "./types";

export interface ReminderNotification {
  id: string;
  title: string;
  body: string;
  dueDate: string;
  daysUntilDue: number;
}

export function buildReminderNotifications(
  accounts: Account[],
  today: string,
  withinDays = 45,
): ReminderNotification[] {
  return buildCreditCardReminders(accounts, today, (a) => a)
    .filter((r) => r.daysUntilDue <= withinDays)
    .map((r) => ({
      id: `cc:${r.accountId}:${r.dueDate}`,
      title: "信用卡繳款提醒",
      body: `${r.name} 將於 ${r.dueDate} 到期`,
      dueDate: r.dueDate,
      daysUntilDue: r.daysUntilDue,
    }));
}

export function unacknowledgedReminders(
  all: ReminderNotification[],
  acknowledgedIds: string[],
): ReminderNotification[] {
  const ack = new Set(acknowledgedIds);
  return all.filter((n) => !ack.has(n.id));
}
