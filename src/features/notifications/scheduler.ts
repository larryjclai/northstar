// Local notification scheduling for due-payment reminders.
// Pure selector (unit-testable) + best-effort Tauri glue.

export interface ScheduledReminder {
  id: string;
  title: string;
  body: string;
  fireAt: Date;
}

/**
 * Select upcoming reminders: future-only, deduped by id, sorted by fireAt,
 * capped to `max` (the OS may limit scheduled notifications).
 */
export function selectUpcomingReminders(
  reminders: ScheduledReminder[],
  now: Date,
  max = 64,
): ScheduledReminder[] {
  const seen = new Set<string>();
  return reminders
    .filter((r) => r.fireAt.getTime() > now.getTime())
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, max);
}

/**
 * Map credit-card reminder data into ScheduledReminder objects.
 * Fire at 09:00 on the due date.
 */
export function buildPaymentReminders(
  reminders: { accountId: string; name: string; dueDate: string }[],
): ScheduledReminder[] {
  return reminders.map((r) => ({
    id: `cc:${r.accountId}:${r.dueDate}`,
    title: "信用卡繳款提醒",
    body: `${r.name} 將於 ${r.dueDate} 到期`,
    fireAt: new Date(`${r.dueDate}T09:00:00`),
  }));
}

// ── Tauri glue (best-effort, never throws to UI) ────────────────────────

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Hash a string id to a positive 32-bit integer (notification ids must be i32). */
function hashTo32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Sync scheduled OS notifications to match the given reminders.
 * Cancels all existing pending notifications, then schedules the upcoming ones.
 * Gated to Tauri runtime; never throws.
 */
export async function syncScheduledReminders(all: ScheduledReminder[], now: Date): Promise<void> {
  if (!isTauri()) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");

    let granted = await n.isPermissionGranted();
    if (!granted) {
      const result = await n.requestPermission();
      granted = result === "granted";
    }
    if (!granted) return;

    // Cancel all pending scheduled notifications before re-scheduling.
    const pendingList = await n.pending();
    if (pendingList.length) {
      await n.cancel(pendingList.map((p) => p.id));
    }

    const selected = selectUpcomingReminders(all, now);
    for (const r of selected) {
      n.sendNotification({
        title: r.title,
        body: r.body,
        id: hashTo32(r.id),
        schedule: n.Schedule.at(r.fireAt),
      });
    }
  } catch {
    /* best-effort — swallow errors to avoid surfacing to the UI */
  }
}
