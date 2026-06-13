// Self-learning lexicon derived entirely from the user's own data.
// Built as a pure function so it can live inside a useMemo — no separate store.
// Priority (high → low):
//   1. Corrections (user explicitly fixed a wrong parse — stored separately)
//   2. Ledger history  (learned from past transactions)
//   3. settings.merchants / account names
//   4. Account-name auto-aliases (富邦證券 → 富邦)
//   5. Built-in seed keywords (cold-start only, lowest weight)

import type { Account, AppSettings, LedgerTransaction } from "./types";
import { buildSeedKeywordMap } from "./categoryKeywords";
import type { CorrectionStore } from "./quickAddCorrections";

export interface AccountMatch {
  accountId: string;
  /** Higher = more confident. History-learned > derived > seed. */
  weight: number;
}

export interface CategoryMatch {
  category: string;
  subcategory: string;
  /** How many times this mapping was observed in history. 0 = seed. */
  count: number;
}

export interface UserLexicon {
  /**
   * lowercased token → best-matching account.
   * Covers: full names, prefix aliases, suffix-stripped names, seed aliases.
   */
  accountAliases: Map<string, AccountMatch>;
  /**
   * Merchant names sorted by usage frequency (for suggestion chips).
   */
  merchants: Array<{ name: string; count: number }>;
  /**
   * lowercased token → best category/subcategory pair.
   * Learned from merchant names, transaction names, and seed keywords.
   */
  keywordCategory: Map<string, CategoryMatch>;
}

// ---------------------------------------------------------------------------
// Account alias derivation
// ---------------------------------------------------------------------------

const STRIP_SUFFIXES = ["證券", "銀行", "帳戶", "信用卡", " Card", " Bank", " Securities"];

/** Generate alias strings for a single account name. */
function accountAliasesFor(name: string): string[] {
  const aliases: string[] = [name]; // full name always included

  // Strip common institution suffixes: 富邦證券 → 富邦
  for (const suf of STRIP_SUFFIXES) {
    const idx = name.indexOf(suf);
    if (idx > 0) aliases.push(name.slice(0, idx));
  }

  // Prefix substrings of length ≥ 2 (up to but not including full name)
  for (let n = 2; n < name.length; n++) {
    aliases.push(name.slice(0, n));
  }

  return [...new Set(aliases)];
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildUserLexicon(
  accounts: Account[],
  ledger: LedgerTransaction[],
  settings: AppSettings,
  corrections?: CorrectionStore,
): UserLexicon {
  // === 1. Account aliases ===
  // Weight scale: full-name match 10, suffix-stripped 8, prefix 5, seed-alias 3.
  const accountAliases = new Map<string, AccountMatch>();

  const setAlias = (token: string, accountId: string, weight: number) => {
    const key = token.toLowerCase().trim();
    if (!key) return;
    const existing = accountAliases.get(key);
    if (!existing || existing.weight < weight) {
      accountAliases.set(key, { accountId, weight });
    }
  };

  for (const acc of accounts) {
    const name = acc.name.trim();
    if (!name) continue;

    setAlias(name, acc.id, 10); // exact full name

    const stripped = STRIP_SUFFIXES.reduce(
      (n, suf) => (n.endsWith(suf) ? n.slice(0, n.length - suf.length) : n),
      name,
    );
    if (stripped !== name) setAlias(stripped, acc.id, 8);

    // Prefix substrings ≥2 chars (lower weight than stripped name)
    for (let n = 2; n < name.length; n++) {
      setAlias(name.slice(0, n), acc.id, 5);
    }

    // Seed: 卡 → first credit account found
    if (acc.type === "credit") setAlias("卡", acc.id, 3);
    // Seed: 現金 / 錢包 → cash-type accounts
    if (acc.type === "cash") {
      setAlias("現金", acc.id, 3);
      setAlias("錢包", acc.id, 3);
      setAlias("cash", acc.id, 3);
    }
    // Seed: amex / visa / mastercard keyword in name
    for (const brand of ["amex", "visa", "mastercard", "jcb"]) {
      if (name.toLowerCase().includes(brand)) setAlias(brand, acc.id, 3);
    }
  }

  // === 2. Merchants ===
  const merchantCounts = new Map<string, number>();
  for (const name of settings.merchants) {
    const n = name.trim();
    if (n) merchantCounts.set(n, merchantCounts.get(n) ?? 0);
  }
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    const m = row.merchant?.trim();
    if (m) merchantCounts.set(m, (merchantCounts.get(m) ?? 0) + 1);
  }
  const merchants = [...merchantCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));

  // === 3. Keyword → category (learned from history) ===
  // For each token, track (category+subcategory) → count (same pattern as
  // buildMerchantCategoryMap), then pick the plurality winner.
  const DELIM = "\0";
  const tokenCatCounts = new Map<string, Map<string, number>>();

  const recordToken = (token: string, row: LedgerTransaction) => {
    const key = token.toLowerCase().trim();
    if (!key || key.length < 2) return;
    const catKey = `${row.category}${DELIM}${row.subcategory ?? ""}`;
    const perToken = tokenCatCounts.get(key) ?? new Map<string, number>();
    perToken.set(catKey, (perToken.get(catKey) ?? 0) + 1);
    tokenCatCounts.set(key, perToken);
  };

  for (const row of ledger) {
    if (!row.category || row.deletedAt !== null) continue;
    // Learn from merchant name
    if (row.merchant?.trim()) recordToken(row.merchant.trim(), row);
    // Learn from transaction name: split on whitespace, keep tokens ≥2 chars
    if (row.name?.trim()) {
      for (const tok of row.name.trim().split(/[\s　]+/)) {
        if (tok.length >= 2) recordToken(tok, row);
      }
    }
  }

  const keywordCategory = new Map<string, CategoryMatch>();

  // Seed first (lowest priority — will be overwritten by history)
  for (const [token, cat] of buildSeedKeywordMap()) {
    keywordCategory.set(token, { ...cat, count: 0 });
  }

  // History overwrites seed
  for (const [token, counts] of tokenCatCounts) {
    let best = "";
    let bestCount = 0;
    for (const [catKey, count] of counts) {
      if (count > bestCount) { best = catKey; bestCount = count; }
    }
    const [category, subcategory = ""] = best.split(DELIM);
    if (category) {
      keywordCategory.set(token, { category, subcategory, count: bestCount });
    }
  }

  // === 4. Apply user corrections (highest priority — overrides everything) ===
  // Weight 20 for account aliases, count 9999 for categories, so they always
  // beat history-learned entries regardless of how many times a token was seen.
  if (corrections) {
    for (const [token, corr] of Object.entries(corrections)) {
      if (corr.accountId) {
        accountAliases.set(token, { accountId: corr.accountId, weight: 20 });
      }
      if (corr.category) {
        keywordCategory.set(token, {
          category: corr.category,
          subcategory: corr.subcategory ?? "",
          count: 9999,
        });
      }
    }
  }

  return { accountAliases, merchants, keywordCategory };
}

// ---------------------------------------------------------------------------
// Helpers used by the parser
// ---------------------------------------------------------------------------

/**
 * Find the best account match for any token in `text`.
 * Tries whole-word tokens first (space-split), then sliding window substrings
 * for CJK text where words aren't space-separated.
 * Returns null when nothing is found above the minimum weight threshold.
 */
export function matchAccountFromLexicon(
  text: string,
  lexicon: UserLexicon,
  minWeight = 3,
): { accountId: string; name: string; weight: number } | null {
  let best: { accountId: string; name: string; weight: number } | null = null;

  const tryToken = (token: string) => {
    const hit = lexicon.accountAliases.get(token.toLowerCase());
    if (hit && hit.weight >= minWeight) {
      if (!best || hit.weight > best.weight) {
        best = { accountId: hit.accountId, name: token, weight: hit.weight };
      }
    }
  };

  // Space-split tokens (works for English and mixed text)
  for (const tok of text.split(/\s+/)) tryToken(tok);

  // Sliding-window substrings for CJK runs (length 2–8)
  const cjkRuns = [...text.matchAll(/[一-鿿㐀-䶿]+/g)];
  for (const run of cjkRuns) {
    const s = run[0];
    for (let len = Math.min(s.length, 8); len >= 2; len--) {
      for (let i = 0; i <= s.length - len; i++) {
        tryToken(s.slice(i, i + len));
      }
    }
  }

  return best;
}

/**
 * Look up category for a merchant/name token.
 * Returns null when no mapping exists (neither learned nor seeded).
 */
export function lookupCategory(
  token: string,
  lexicon: UserLexicon,
): CategoryMatch | null {
  return lexicon.keywordCategory.get(token.toLowerCase().trim()) ?? null;
}
