// Extract a date keyword from a natural-language quick-add string and resolve
// it to a datetime-local string (YYYY-MM-DDTHH:mm, always at midnight T00:00).
//
// Supported keywords:
//   今天 / 今日 / today               → today
//   昨天 / 昨日 / yesterday / yest    → yesterday
//   前天                              → 2 days ago
//   上週三 / 週三 / last wed / wed    → most recent weekday (上週 = 1 week further back)
//   3月15日? / 3/15 / mar 15          → specific month-day (previous year when future)
//   0315  (MMDD 4-digit)             → same as above

export interface DateMatch {
  /** datetime-local string: YYYY-MM-DDTHH:mm (always midnight, T00:00) */
  datetimeLocal: string;
  /** [start, end) character indices in the original input string */
  span: [number, number];
}

// ── Lookup tables ──

const WEEKDAY_EN: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const WEEKDAY_ZH: Record<string, number> = {
  日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};
// 3-letter prefix → month number (for English month names)
const MONTH_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ── Date arithmetic helpers ──

function parseComponents(todayLocal: string): { y: number; m: number; d: number; wd: number } {
  const [y, m, d] = todayLocal.split("-").map(Number);
  return { y, m, d, wd: new Date(y, m - 1, d).getDay() };
}

function offset(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(y, m - 1, d + delta);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00`;
}

/** Resolve the most recent occurrence of `targetWD` relative to today.
 *  `forceLastWeek` = true adds 7 extra days (for "上週"/"last"). */
function recentWeekday(
  today: ReturnType<typeof parseComponents>,
  targetWD: number,
  forceLastWeek: boolean,
): { y: number; m: number; d: number } {
  let delta = today.wd - targetWD;
  if (delta < 0) delta += 7; // target hasn't occurred yet this week → go back
  if (forceLastWeek) delta += 7;
  return offset(today.y, today.m, today.d, -delta);
}

/** Month/day → YYYY: pick current year unless that date is in the future → previous year. */
function resolveYear(y: number, m: number, d: number, today: ReturnType<typeof parseComponents>): number {
  if (m > today.m || (m === today.m && d > today.d)) return y - 1;
  return y;
}

// ── Main parser ──

/**
 * Scan `text` for a date keyword and return the resolved datetime-local string
 * plus the span consumed. Returns null when no keyword is found.
 *
 * @param todayLocal  - Today's date in the user's timezone (YYYY-MM-DD).
 */
export function parseDate(text: string, todayLocal: string): DateMatch | null {
  const t = parseComponents(todayLocal);

  const hit = (m: RegExpExecArray, y: number, mo: number, d: number): DateMatch => ({
    datetimeLocal: fmt(y, mo, d),
    span: [m.index, m.index + m[0].length],
  });

  // 1. Today ─────────────────────────────────────────────────────────────────
  {
    const m = /今天|今日|\btoday\b/i.exec(text);
    if (m) return hit(m, t.y, t.m, t.d);
  }

  // 2. Yesterday ─────────────────────────────────────────────────────────────
  {
    const m = /昨天|昨日|\b(?:yesterday|yest)\b/i.exec(text);
    if (m) { const r = offset(t.y, t.m, t.d, -1); return hit(m, r.y, r.m, r.d); }
  }

  // 3. 前天 (day before yesterday) ───────────────────────────────────────────
  {
    const m = /前天/.exec(text);
    if (m) { const r = offset(t.y, t.m, t.d, -2); return hit(m, r.y, r.m, r.d); }
  }

  // 4a. Chinese weekday ──────────────────────────────────────────────────────
  // "上週三" / "上周三" (last-week) or "週三" / "周三" (most recent)
  {
    const m = /(?:(上[週周])([日一二三四五六]))|(?:[週周]([日一二三四五六]))/.exec(text);
    if (m) {
      const isLast = !!m[1];
      const dayChar = (m[2] ?? m[3]) as keyof typeof WEEKDAY_ZH;
      const targetWD = WEEKDAY_ZH[dayChar];
      if (targetWD !== undefined) {
        const r = recentWeekday(t, targetWD, isLast);
        return hit(m, r.y, r.m, r.d);
      }
    }
  }

  // 4b. English weekday ──────────────────────────────────────────────────────
  // "last wed" / "last monday" or standalone "wed" / "monday"
  {
    const m = /\b(last\s+)?(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text);
    if (m) {
      const isLast = !!m[1];
      const targetWD = WEEKDAY_EN[m[2].toLowerCase()];
      if (targetWD !== undefined) {
        const r = recentWeekday(t, targetWD, isLast);
        return hit(m, r.y, r.m, r.d);
      }
    }
  }

  // 5a. Chinese M月D日? ─────────────────────────────────────────────────────
  {
    const m = /(\d{1,2})月(\d{1,2})日?/.exec(text);
    if (m) {
      const mo = Number(m[1]); const d = Number(m[2]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const y = resolveYear(t.y, mo, d, t);
        return hit(m, y, mo, d);
      }
    }
  }

  // 5b. M/D ─────────────────────────────────────────────────────────────────
  {
    const m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(text);
    if (m) {
      const mo = Number(m[1]); const d = Number(m[2]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const y = resolveYear(t.y, mo, d, t);
        return hit(m, y, mo, d);
      }
    }
  }

  // 5c. MMDD 4-digit (e.g. 0315 = March 15) ─────────────────────────────────
  // Only matches strict zero-padded forms so plain amounts aren't confused.
  {
    const m = /\b(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/.exec(text);
    if (m) {
      const mo = Number(m[1]); const d = Number(m[2]);
      const y = resolveYear(t.y, mo, d, t);
      return hit(m, y, mo, d);
    }
  }

  // 5d. English month name + day: "mar 15" / "march 15" ─────────────────────
  {
    const m = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i.exec(text);
    if (m) {
      const mo = MONTH_EN[m[1].toLowerCase().slice(0, 3)];
      const d = Number(m[2]);
      if (mo && d >= 1 && d <= 31) {
        const y = resolveYear(t.y, mo, d, t);
        return hit(m, y, mo, d);
      }
    }
  }

  return null;
}
