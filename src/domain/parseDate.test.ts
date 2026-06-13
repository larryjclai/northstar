import { describe, expect, it } from "vitest";
import { parseDate } from "./parseDate";

// Fixed reference: 2026-06-13, Saturday (weekday = 6)
const TODAY = "2026-06-13";

// ── helpers ──
function dt(s: string) { return `${s}T00:00`; }

// ---------------------------------------------------------------------------
// Relative days
// ---------------------------------------------------------------------------
describe("parseDate – relative days", () => {
  it("今天 → today", () => {
    expect(parseDate("今天 拿鐵 120", TODAY)?.datetimeLocal).toBe(dt("2026-06-13"));
  });
  it("今日 → today", () => {
    expect(parseDate("今日咖啡150", TODAY)?.datetimeLocal).toBe(dt("2026-06-13"));
  });
  it("today → today (English)", () => {
    expect(parseDate("coffee today 80", TODAY)?.datetimeLocal).toBe(dt("2026-06-13"));
  });
  it("昨天 → yesterday", () => {
    expect(parseDate("昨天拿鐵120", TODAY)?.datetimeLocal).toBe(dt("2026-06-12"));
  });
  it("昨日 → yesterday", () => {
    expect(parseDate("昨日 便當 90", TODAY)?.datetimeLocal).toBe(dt("2026-06-12"));
  });
  it("yesterday → yesterday (English)", () => {
    expect(parseDate("lunch yesterday 150", TODAY)?.datetimeLocal).toBe(dt("2026-06-12"));
  });
  it("yest → yesterday abbreviation", () => {
    expect(parseDate("coffee yest 80", TODAY)?.datetimeLocal).toBe(dt("2026-06-12"));
  });
  it("前天 → 2 days ago", () => {
    expect(parseDate("前天 計程車 250", TODAY)?.datetimeLocal).toBe(dt("2026-06-11"));
  });
});

// ---------------------------------------------------------------------------
// Chinese weekday (today = Saturday, weekday=6)
// ---------------------------------------------------------------------------
describe("parseDate – Chinese weekday", () => {
  // 週三 (Wednesday, wd=3): delta = 6-3 = 3 days ago
  it("週三 → most recent Wednesday (3 days ago)", () => {
    expect(parseDate("週三 拿鐵 120", TODAY)?.datetimeLocal).toBe(dt("2026-06-10"));
  });
  it("週三 (same as last three chars prefix 上週三 minus the 上週)", () => {
    expect(parseDate("周三 計程車 250", TODAY)?.datetimeLocal).toBe(dt("2026-06-10"));
  });
  // 上週三: delta = 3 + 7 = 10 days ago
  it("上週三 → one week further back than 週三", () => {
    expect(parseDate("上週三 拿鐵 120", TODAY)?.datetimeLocal).toBe(dt("2026-06-03"));
  });
  it("上周三 (simplified spelling)", () => {
    expect(parseDate("上周三 午餐 80", TODAY)?.datetimeLocal).toBe(dt("2026-06-03"));
  });
  // 週六 when today IS Saturday (wd=6): delta = 0 → today
  it("週六 when today is Saturday → today", () => {
    expect(parseDate("週六 超市 300", TODAY)?.datetimeLocal).toBe(dt("2026-06-13"));
  });
  // 上週六: delta = 0 + 7 = 7 days ago
  it("上週六 when today is Saturday → 7 days ago", () => {
    expect(parseDate("上週六 超市 300", TODAY)?.datetimeLocal).toBe(dt("2026-06-06"));
  });
  // 週日 (Sunday, wd=0): delta = 6-0 = 6 days ago = last Sunday
  it("週日 → last Sunday", () => {
    expect(parseDate("週日 家庭聚餐 800", TODAY)?.datetimeLocal).toBe(dt("2026-06-07"));
  });
});

// ---------------------------------------------------------------------------
// English weekday (today = Saturday, weekday=6)
// ---------------------------------------------------------------------------
describe("parseDate – English weekday", () => {
  it("wed → most recent Wednesday", () => {
    expect(parseDate("coffee wed 80", TODAY)?.datetimeLocal).toBe(dt("2026-06-10"));
  });
  it("wednesday (full name)", () => {
    expect(parseDate("lunch wednesday 150", TODAY)?.datetimeLocal).toBe(dt("2026-06-10"));
  });
  it("last wed → one week further back", () => {
    expect(parseDate("lunch last wed 150", TODAY)?.datetimeLocal).toBe(dt("2026-06-03"));
  });
  it("last monday", () => {
    // Monday wd=1, delta = 6-1=5, +7=12 → 12 days ago = June 1
    expect(parseDate("haircut last monday 500", TODAY)?.datetimeLocal).toBe(dt("2026-06-01"));
  });
  it("sat → today (today is Saturday)", () => {
    expect(parseDate("groceries sat 300", TODAY)?.datetimeLocal).toBe(dt("2026-06-13"));
  });
});

// ---------------------------------------------------------------------------
// Specific date (M月D / M/D / MMDD / English month)
// ---------------------------------------------------------------------------
describe("parseDate – specific dates", () => {
  // Dates in the past: use current year
  it("3月15 → 2026-03-15 (past, same year)", () => {
    expect(parseDate("3月15 拿鐵 120", TODAY)?.datetimeLocal).toBe(dt("2026-03-15"));
  });
  it("3月15日 (with 日 suffix)", () => {
    expect(parseDate("3月15日 咖啡 80", TODAY)?.datetimeLocal).toBe(dt("2026-03-15"));
  });
  it("3/15 → 2026-03-15", () => {
    expect(parseDate("lunch 3/15 150", TODAY)?.datetimeLocal).toBe(dt("2026-03-15"));
  });
  it("mar 15 → 2026-03-15", () => {
    expect(parseDate("lunch mar 15 150", TODAY)?.datetimeLocal).toBe(dt("2026-03-15"));
  });
  it("march 15 (full English month name)", () => {
    expect(parseDate("lunch march 15 150", TODAY)?.datetimeLocal).toBe(dt("2026-03-15"));
  });
  it("0315 (MMDD) → 2026-03-15", () => {
    expect(parseDate("0315 拿鐵 120", TODAY)?.datetimeLocal).toBe(dt("2026-03-15"));
  });

  // Dates in the future → fall back to previous year
  it("12/25 → 2025-12-25 (future date → previous year)", () => {
    // Dec 25 is after June 13 → previous year
    expect(parseDate("聖誕節聚餐 12/25 1200", TODAY)?.datetimeLocal).toBe(dt("2025-12-25"));
  });
  it("12月25 → 2025-12-25", () => {
    expect(parseDate("12月25 聚餐 1200", TODAY)?.datetimeLocal).toBe(dt("2025-12-25"));
  });

  // Same day (June 13) → current year
  it("6/13 → 2026-06-13 (today, same year)", () => {
    expect(parseDate("拿鐵 6/13 120", TODAY)?.datetimeLocal).toBe(dt("2026-06-13"));
  });
});

// ---------------------------------------------------------------------------
// No keyword → null
// ---------------------------------------------------------------------------
describe("parseDate – no keyword", () => {
  it("plain merchant + amount → null", () => {
    expect(parseDate("拿鐵 120 信用卡", TODAY)).toBeNull();
  });
  it("investment string → null", () => {
    expect(parseDate("買 2330.TW 5股 @1042", TODAY)).toBeNull();
  });
  it("empty string → null", () => {
    expect(parseDate("", TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Span: verify the matched range is correct
// ---------------------------------------------------------------------------
describe("parseDate – span correctness", () => {
  it("span covers only the keyword, not the whole string", () => {
    const text = "昨天 拿鐵 120";
    const r = parseDate(text, TODAY)!;
    expect(r).not.toBeNull();
    expect(text.slice(r.span[0], r.span[1])).toBe("昨天");
  });
  it("span for 上週三", () => {
    const text = "上週三 午餐 90";
    const r = parseDate(text, TODAY)!;
    expect(text.slice(r.span[0], r.span[1])).toBe("上週三");
  });
  it("span for 3月15日", () => {
    const text = "拿鐵 3月15日 120";
    const r = parseDate(text, TODAY)!;
    expect(text.slice(r.span[0], r.span[1])).toBe("3月15日");
  });
});
