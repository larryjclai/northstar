// Natural-language Quick Add parser. Turns a single line like
//   "晚餐 50嵐 120"             → expense  (name 晚餐, merchant 50嵐ᵃ, 120)
//   "拿鐵 120 信用卡"           → expense  (name 拿鐵, 120, matched account)
//   "午餐 @添飯 120 信用卡"     → name 午餐, merchant 添飯, 120, matched account
//   "+ 接案 5000 富邦"          → income   (note: 富邦 matches 富邦證券 via alias)
//   "買 2330.TW 5股 @1042"      → investment buy
//   "7-11 50"                  → expense  (name 7-11, amount 50, not 7)
//   "一百二 拿鐵"               → expense  (amount 120 from Chinese numeral)
// into a structured draft. Anything it can't confidently read comes back as
// `unknown` so the UI can open a prefilled form for the user to finish.
//
// merchant vs name (description):
//   1. "@商家名" pins the store explicitly; the remaining text becomes the
//      description (name).
//   2. Without @, the leftover text is scanned for a KNOWN merchant — one the
//      user has recorded before (ctx.merchantCategory / ctx.lexicon.merchants).
//      ᵃ A hit becomes the merchant (even inside a token: 「50嵐吃晚餐」→
//      merchant 50嵐, the rest stays in the name); everything else is the name.
//   3. No known merchant found → merchant stays empty and the whole remainder
//      is the name, so free text never pollutes merchant statistics.
//
// Pass a UserLexicon (built by buildUserLexicon) in ctx.lexicon to enable
// self-learning aliases, fuzzy account matching, and category inference.

import { parseAmount } from "./parseAmount";
import { parseDate } from "./parseDate";
import { matchAccountFromLexicon, lookupCategory, type UserLexicon } from "./userLexicon";

export interface QuickAddAccount {
  id: string;
  name: string;
  currency?: string;
}

export interface QuickAddContext {
  accounts: QuickAddAccount[];
  merchantCategory?: Map<string, { category: string; subcategory: string }>;
  /**
   * Self-learning lexicon built from the user's own data.
   * When provided, enables fuzzy account matching, alias resolution,
   * and learned keyword-to-category inference.
   */
  lexicon?: UserLexicon;
  /**
   * When set, forces the parser down a specific path instead of guessing:
   *   - "investment" treats the whole line as a buy/sell even without a
   *     leading 買/賣 verb (the verb only flips action).
   *   - "ledger" never routes to investment.
   * Left undefined for the legacy auto-detect behaviour.
   */
  mode?: "ledger" | "investment";
  /**
   * Current datetime-local in the user's timezone (YYYY-MM-DDTHH:mm).
   * When provided, enables date keyword parsing (昨天/週三/3/15/etc.).
   */
  nowDatetimeLocal?: string;
  /**
   * Top-level category names available to constrain the on-device (Tier 1)
   * parser's category output. Tier 0 ignores this. Empty/undefined when the
   * caller has no category list.
   */
  categories?: string[];
}

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export type QuickAddParsed =
  | {
      kind: "ledger";
      entryType: "expense" | "income";
      amount: number;
      accountId: string | null;
      /** Store/payee. Set from @ syntax or a known-merchant hit; "" otherwise. */
      merchant: string;
      /** Description, distinct from merchant.
       *  e.g. "午餐 @添飯 120" → name="午餐", merchant="添飯" */
      name?: string;
      category: string;
      subcategory: string;
      /** datetime-local (YYYY-MM-DDTHH:mm) resolved from a date keyword, if found */
      date?: string;
    }
  | {
      kind: "investment";
      action: "buy" | "sell";
      ticker: string;
      quantity: number;
      price: number;
      accountId: string | null;
      /** datetime-local (YYYY-MM-DDTHH:mm) resolved from a date keyword, if found */
      date?: string;
    }
  | { kind: "unknown"; text: string };

// P0: richer result type with per-field confidence for future instant-preview UI.
// The existing parseQuickAdd still returns QuickAddParsed via a thin adapter.
export type FieldConfidence = "high" | "low" | "none";

export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  /** [start, end) char indices in the original input string, for highlighting */
  span?: [number, number];
}

export interface QuickAddParseResult {
  kind: "ledger" | "investment" | "unknown";
  source: "rules" | "on-device" | "cloud";
  ledger?: {
    entryType: ParsedField<"expense" | "income">;
    amount: ParsedField<number>;
    accountId: ParsedField<string>;
    merchant: ParsedField<string>;
    name: ParsedField<string>;
    category: ParsedField<string>;
    subcategory: ParsedField<string>;
    date: ParsedField<string>;
  };
  investment?: {
    action: ParsedField<"buy" | "sell">;
    ticker: ParsedField<string>;
    quantity: ParsedField<number>;
    price: ParsedField<number>;
    accountId: ParsedField<string>;
    date: ParsedField<string>;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseNumber(value: string): number {
  return Number(value.replace(/,/g, ""));
}

/**
 * Account matching with three tiers:
 *   1. Lexicon alias map (fuzzy, learned, includes prefix aliases)
 *   2. Fallback: full-name substring scan of raw accounts list
 * Returns the matched accountId and the text span that was consumed.
 */
function resolveAccount(
  text: string,
  accounts: QuickAddAccount[],
  lexicon?: UserLexicon,
): { id: string; name: string } | null {
  // Tier 1: lexicon (if provided) — handles aliases like 富邦→富邦證券
  if (lexicon) {
    const hit = matchAccountFromLexicon(text, lexicon);
    if (hit) {
      // Map accountId back to the full account name for downstream removal from text
      const acc = accounts.find((a) => a.id === hit.accountId);
      return acc ? { id: acc.id, name: acc.name.trim() } : null;
    }
  }

  // Tier 2: legacy full-name substring (preserves existing behaviour when no lexicon)
  const matches = accounts
    .filter((a) => a.name.trim() && text.includes(a.name.trim()))
    .sort((a, b) => b.name.length - a.name.length);
  return matches[0] ? { id: matches[0].id, name: matches[0].name.trim() } : null;
}

/**
 * Infer category from merchant token.
 * Priority: explicit merchantCategory map (history-derived, passed from UI)
 *           → lexicon keyword lookup (history + seed)
 */
function resolveCategory(
  merchant: string,
  ctx: QuickAddContext,
): { category: string; subcategory: string } {
  if (ctx.merchantCategory) {
    const hit = ctx.merchantCategory.get(merchant);
    if (hit) return hit;
  }
  if (ctx.lexicon && merchant) {
    const hit = lookupCategory(merchant, ctx.lexicon);
    if (hit) return { category: hit.category, subcategory: hit.subcategory };
    // Also try individual tokens of the merchant string
    for (const tok of merchant.split(/[\s　]+/)) {
      if (tok.length >= 2) {
        const tokHit = lookupCategory(tok, ctx.lexicon);
        if (tokHit) return { category: tokHit.category, subcategory: tokHit.subcategory };
      }
    }
  }
  return { category: "", subcategory: "" };
}

// ---------------------------------------------------------------------------
// Known-merchant extraction (no-@ path)
// ---------------------------------------------------------------------------

/**
 * Collect every merchant the user has recorded before, from the history-derived
 * category map and the lexicon (which already includes settings.merchants).
 * Keyed by lowercased name → canonical spelling. Names shorter than 2 chars are
 * dropped — they'd split ordinary text far too aggressively.
 */
function collectKnownMerchants(ctx: QuickAddContext): Map<string, string> {
  const known = new Map<string, string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (!known.has(key)) known.set(key, t);
  };
  if (ctx.merchantCategory) for (const m of ctx.merchantCategory.keys()) add(m);
  if (ctx.lexicon) for (const m of ctx.lexicon.merchants) add(m.name);
  return known;
}

/**
 * Mask digit-carrying known merchants (e.g. 50嵐, 85度C) with NUL characters so
 * the amount scanner doesn't read their digits as the amount —「晚餐 50嵐 120」
 * must parse 120, not 50. Length-preserving, so amount spans still index into
 * the original string. Pure-numeric names are left alone (an all-digit token is
 * more plausibly an amount than a merchant).
 */
function maskKnownMerchants(body: string, known: Map<string, string>): string {
  let masked = body;
  for (const key of known.keys()) {
    if (!/\d/.test(key) || !/\D/.test(key)) continue;
    let lower = masked.toLowerCase();
    if (lower.length !== masked.length) return masked; // exotic case-folding; bail out
    let idx = lower.indexOf(key);
    while (idx >= 0) {
      masked = masked.slice(0, idx) + " ".repeat(key.length) + masked.slice(idx + key.length);
      lower = masked.toLowerCase();
      idx = lower.indexOf(key, idx + key.length);
    }
  }
  return masked;
}

/**
 * Find a known merchant inside the leftover free text.
 * Pass 1 — exact token match (case-insensitive); the longest matching token
 *          wins when several tokens each match a known merchant.
 * Pass 2 — known merchant as a substring of a token; the token is split and
 *          the non-merchant part rejoins the name (「50嵐吃晚餐」→ merchant
 *          50嵐, 吃晚餐 stays in the name). Longest merchant name wins.
 */
function extractKnownMerchant(
  remainingText: string,
  known: Map<string, string>,
): { merchant: string; name: string } | null {
  if (!remainingText || known.size === 0) return null;
  const tokens = remainingText.split(/[\s　]+/).filter(Boolean);

  let exactIdx = -1;
  let exactCanonical = "";
  tokens.forEach((tok, i) => {
    const hit = known.get(tok.toLowerCase());
    if (hit && (exactIdx < 0 || tok.length > tokens[exactIdx].length)) {
      exactIdx = i;
      exactCanonical = hit;
    }
  });
  if (exactIdx >= 0) {
    const name = tokens.filter((_, i) => i !== exactIdx).join(" ").trim();
    return { merchant: exactCanonical, name };
  }

  let subIdx = -1;
  let subCanonical = "";
  let subStart = -1;
  let subLen = 0;
  tokens.forEach((tok, i) => {
    const lower = tok.toLowerCase();
    if (lower.length !== tok.length) return; // exotic case-folding; skip token
    for (const [key, canonical] of known) {
      const at = lower.indexOf(key);
      if (at >= 0 && key.length > subLen) {
        subIdx = i;
        subCanonical = canonical;
        subStart = at;
        subLen = key.length;
      }
    }
  });
  if (subIdx >= 0) {
    const tok = tokens[subIdx];
    const leftover = (tok.slice(0, subStart) + " " + tok.slice(subStart + subLen)).trim();
    const name = tokens
      .map((t, i) => (i === subIdx ? leftover : t))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { merchant: subCanonical, name };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseQuickAdd(raw: string, ctx: QuickAddContext): QuickAddParsed {
  const text = raw.trim();
  if (!text) return { kind: "unknown", text: "" };

  // ── Investment ──
  const inv = /^(買|賣|buy|sell)\s+(.+)$/i.exec(text);
  if (ctx.mode !== "ledger" && (inv || ctx.mode === "investment")) {
    const verb = inv?.[1] ?? "";
    const rest = inv?.[2] ?? text;
    const action: "buy" | "sell" = /賣|sell/i.test(verb || rest) ? "sell" : "buy";

    const tickerMatch = /([A-Za-z0-9]+(?:\.[A-Za-z]{1,4})?)/.exec(rest);
    const ticker = (tickerMatch?.[1] ?? "").toUpperCase();
    const afterTicker = tickerMatch ? rest.slice(tickerMatch.index + tickerMatch[0].length) : rest;

    const qtyMatch = /(\d+(?:\.\d+)?)\s*(?:股|張|shares?)?/i.exec(afterTicker);
    const priceMatch =
      /(?:@|＠|價|單價|each)\s*(\d[\d,]*(?:\.\d+)?)/i.exec(rest) ||
      /(\d[\d,]*(?:\.\d+)?)\s*元/.exec(rest);
    const accountMatch = resolveAccount(rest, ctx.accounts, ctx.lexicon);

    if (ticker || ctx.mode === "investment") {
      return {
        kind: "investment",
        action,
        ticker,
        quantity: qtyMatch ? parseNumber(qtyMatch[1]) : 0,
        price: priceMatch ? parseNumber(priceMatch[1]) : 0,
        accountId: accountMatch?.id ?? null,
      };
    }
  }

  // ── Ledger: expense (default) or income (leading + / 收入 / 收) ──
  let entryType: "expense" | "income" = "expense";
  let body = text;
  const incomeLead = /^(\+|收入|收)\s*/.exec(body);
  if (incomeLead) {
    entryType = "income";
    body = body.slice(incomeLead[0].length);
  }

  // ── @merchant explicit syntax ─────────────────────────────────────────────
  // "@添飯" marks the store/payee explicitly; the surrounding text becomes the
  // transaction description (name). Pattern matches @ followed by a non-digit
  // char so it doesn't collide with investment @price patterns (e.g. @1042).
  const merchantTagRe = /@([^\d\s０-９]\S*)/;
  const merchantTagMatch = merchantTagRe.exec(body);
  let explicitMerchant: string | undefined;
  if (merchantTagMatch) {
    explicitMerchant = merchantTagMatch[1];
    body = (body.slice(0, merchantTagMatch.index) + " " + body.slice(merchantTagMatch.index + merchantTagMatch[0].length))
      .replace(/\s+/g, " ").trim();
  }

  // Date keyword extraction — must happen before amount scan so date spans
  // like "3/15" are not mistaken for an amount.
  let parsedDate: string | undefined;
  if (ctx.nowDatetimeLocal) {
    const todayLocal = ctx.nowDatetimeLocal.slice(0, 10);
    const dateHit = parseDate(body, todayLocal);
    if (dateHit) {
      parsedDate = dateHit.datetimeLocal;
      body = (body.slice(0, dateHit.span[0]) + " " + body.slice(dateHit.span[1]))
        .replace(/\s+/g, " ").trim();
    }
  }

  // Use improved amount parser (handles 7-11 bug, Chinese numerals, units, etc.)
  // Scan a masked copy so digit-carrying known merchants (50嵐) aren't read as
  // amounts; spans from the masked copy index into `body` unchanged.
  const knownMerchants = collectKnownMerchants(ctx);
  const amountHit = parseAmount(maskKnownMerchants(body, knownMerchants));
  if (!amountHit) return { kind: "unknown", text };
  const amount = amountHit.value;

  const account = resolveAccount(body, ctx.accounts, ctx.lexicon);

  // remainingText = body minus the amount token and any matched account name.
  let remainingText = body.slice(0, amountHit.span[0]) + " " + body.slice(amountHit.span[1]);
  if (account) remainingText = remainingText.replace(account.name, " ");
  remainingText = remainingText.replace(/\s+/g, " ").trim();
  // Strip English prepositions that link merchant to account/amount tokens.
  remainingText = remainingText.replace(/\b(?:at|from|on|for|paid|with|via|using)\b/gi, " ")
    .replace(/\s+/g, " ").trim();

  // merchant / name split:
  //   1. @ syntax → merchant = @value, name (description) = remainingText.
  //   2. Known merchant found in the remainder → merchant = it, rest = name.
  //   3. Otherwise merchant stays empty and the whole remainder is the name.
  let merchant: string;
  let name: string;
  if (explicitMerchant) {
    merchant = explicitMerchant;
    name = remainingText;
  } else {
    const hit = extractKnownMerchant(remainingText, knownMerchants);
    if (hit) {
      merchant = hit.merchant;
      // Keep a display name even when the merchant was the only leftover text.
      name = hit.name || hit.merchant;
    } else {
      merchant = "";
      name = remainingText;
    }
  }

  // Resolve category from merchant; when that yields nothing (or merchant is
  // empty), fall back to the name tokens.
  let { category, subcategory } = resolveCategory(merchant, ctx);
  if (!category && name && name !== merchant) {
    const nameCat = resolveCategory(name, ctx);
    if (nameCat.category) ({ category, subcategory } = nameCat);
  }

  return {
    kind: "ledger",
    entryType,
    amount,
    accountId: account?.id ?? null,
    merchant,
    name,
    category,
    subcategory,
    ...(parsedDate ? { date: parsedDate } : {}),
  };
}
