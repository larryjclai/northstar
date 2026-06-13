// Natural-language Quick Add parser. Turns a single line like
//   "拿鐵 120 信用卡"           → expense  (merchant 拿鐵, 120, matched account)
//   "午餐 @添飯 120 信用卡"     → name 午餐, merchant 添飯, 120, matched account
//   "+ 接案 5000 富邦"          → income   (note: 富邦 matches 富邦證券 via alias)
//   "買 2330.TW 5股 @1042"      → investment buy
//   "7-11 50"                  → expense  (merchant 7-11, amount 50, not 7)
//   "一百二 拿鐵"               → expense  (amount 120 from Chinese numeral)
// into a structured draft. Anything it can't confidently read comes back as
// `unknown` so the UI can open a prefilled form for the user to finish.
//
// @ disambiguation:
//   Use "@商家名" to pin the store name explicitly. The remaining text becomes
//   the transaction description (name). Without @, the entire remainder is
//   treated as merchant (same as before, fully backward-compatible).
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
      merchant: string;
      /** Explicit description/name, distinct from merchant. Only set when @ syntax used.
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
  const amountHit = parseAmount(body);
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

  // When @ syntax is used: merchant = @value, name (description) = remainingText.
  // Without @: merchant = remainingText (backward-compatible).
  const merchant = explicitMerchant ?? remainingText;
  const name = explicitMerchant ? remainingText : undefined;

  // Resolve category from merchant; if not found and name differs, try name too.
  let { category, subcategory } = resolveCategory(merchant, ctx);
  if (!category && name) {
    const nameCat = resolveCategory(name, ctx);
    if (nameCat.category) ({ category, subcategory } = nameCat);
  }

  return {
    kind: "ledger",
    entryType,
    amount,
    accountId: account?.id ?? null,
    merchant,
    ...(name !== undefined ? { name } : {}),
    category,
    subcategory,
    ...(parsedDate ? { date: parsedDate } : {}),
  };
}
