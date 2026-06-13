// Extracts a money amount from a natural-language string.
// Returns the numeric value and its character span so callers can highlight
// or remove it. Handles:
//   • Arabic digits with thousand-separators: 1,200  120
//   • Currency prefixes:  $4.50  NT$300  ¥500
//   • Unit suffixes:      5萬  3千  1.2k  2m
//   • Currency suffixes:  50元  5塊  30 bucks
//   • Chinese numerals:   一百二(=120)  兩千五(=2500)  三百
// Numbers that are clearly NOT amounts are excluded first:
//   • @price tokens        (unit price, e.g. @1042)
//   • N股 / N張 / Nshares  (quantity)
//   • Ticker patterns      (2330.TW)
//   • N-N brand names      (7-11)

export interface AmountMatch {
  value: number;
  /** [start, end) character indices in the original string */
  span: [number, number];
}

const CHINESE_DIGIT: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CHINESE_LEVEL: Record<string, number> = {
  十: 10, 百: 100, 千: 1000, 萬: 10000,
};

/**
 * Parse colloquial Chinese number strings.
 * 一百二 → 120 (trailing digit = digit × lastLevel/10)
 * 兩千五 → 2500
 * 三百   → 300
 * 十二   → 12
 */
export function parseChineseNumber(s: string): number | null {
  if (!/^[零一二兩三四五六七八九十百千萬]+$/.test(s)) return null;
  let total = 0;
  let cur = 0;
  let lastLevel = 10000; // sentinel: nothing seen yet

  for (const ch of s) {
    if (ch === "零") { cur = 0; continue; }
    const d = CHINESE_DIGIT[ch];
    if (d !== undefined) { cur = d; continue; }
    const lv = CHINESE_LEVEL[ch];
    if (!lv) return null;
    if (lv === 10000) {
      total = (total + cur) * 10000;
      cur = 0;
      lastLevel = 10000;
    } else {
      // 十 at start of string means implicit 1×10
      total += (cur === 0 && lastLevel === 10000 ? 1 : cur) * lv;
      cur = 0;
      lastLevel = lv;
    }
  }

  // Trailing digit colloquial shorthand: 一百二 → cur=2, lastLevel=100 → +2×10
  if (cur > 0) {
    total += lastLevel < 10000 ? cur * (lastLevel / 10) : cur;
  }

  return total > 0 ? total : null;
}

function stripCommas(s: string): number {
  return Number(s.replace(/,/g, ""));
}

const UNIT_MULTIPLIERS: Record<string, number> = {
  "萬": 10000, "万": 10000,
  "千": 1000,
  "k": 1000, "K": 1000,
  "m": 1000000, "M": 1000000,
};

/** Return all non-overlapping [start, end) spans to exclude from amount scanning. */
function excludedSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const push = (m: RegExpExecArray) => spans.push([m.index!, m.index! + m[0].length]);

  // @price  (unit price)
  for (const m of text.matchAll(/[@＠]\s*\d[\d,]*(?:\.\d+)?/g)) push(m);
  // N股 / N張 / Nshares  (quantity)
  // Note: no \b after 股/張 — \b doesn't match CJK characters in JS regex.
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?\s*(?:股|張|shares?)/gi)) push(m);
  // Ticker: 4-6 digit code followed by .XX suffix (e.g. 2330.TW).
  // Plain 4-6 digit numbers without the suffix (like 5000) are NOT excluded here.
  for (const m of text.matchAll(/\b\d{4,6}\.[A-Z]{1,4}\b/gi)) push(m);
  // N-N brand names (7-11, 7-ELEVEN): exclude the whole token
  for (const m of text.matchAll(/\b\d+[-–]\w+/g)) push(m);

  return spans;
}

function overlaps(start: number, end: number, spans: Array<[number, number]>): boolean {
  return spans.some(([s, e]) => start < e && end > s);
}

/**
 * Find the best amount in a natural-language string.
 * Returns null when no amount can be identified.
 */
export function parseAmount(text: string): AmountMatch | null {
  const excl = excludedSpans(text);
  const check = (m: RegExpExecArray) => !overlaps(m.index!, m.index! + m[0].length, excl);

  // Priority 1: currency prefix + number  ($4.50 / NT$300 / ¥500)
  for (const m of text.matchAll(
    /(?:\$|US\$|NT\$|HK\$|USD|TWD|HKD|JPY|CNY|EUR|GBP|¥|€|£)\s*(\d[\d,]*(?:\.\d+)?)/gi,
  )) {
    if (check(m)) {
      const v = stripCommas(m[1]);
      if (v > 0) return { value: v, span: [m.index!, m.index! + m[0].length] };
    }
  }

  // Priority 2: number + scale unit (5萬 / 3千 / 1.2k / 2m)
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(萬|万|千|[kKmM])(?!\w)/g)) {
    if (check(m)) {
      const v = stripCommas(m[1]) * (UNIT_MULTIPLIERS[m[2]] ?? 1);
      if (v > 0) return { value: v, span: [m.index!, m.index! + m[0].length] };
    }
  }

  // Priority 3: number + currency suffix (50元 / 5塊 / 30 bucks)
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:元|塊|bucks?)\b/gi)) {
    if (check(m)) {
      const v = stripCommas(m[1]);
      if (v > 0) return { value: v, span: [m.index!, m.index! + m[0].length] };
    }
  }

  // Priority 4: Chinese numeral sequence
  for (const m of text.matchAll(/[零一二兩三四五六七八九十百千萬]+/g)) {
    if (check(m)) {
      const v = parseChineseNumber(m[0]);
      if (v && v > 0) return { value: v, span: [m.index!, m.index! + m[0].length] };
    }
  }

  // Priority 5: plain Arabic number (with optional thousand-separator commas)
  // Skips numbers already covered by excluded spans.
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    if (check(m)) {
      const v = stripCommas(m[0]);
      if (v > 0) return { value: v, span: [m.index!, m.index! + m[0].length] };
    }
  }

  return null;
}
