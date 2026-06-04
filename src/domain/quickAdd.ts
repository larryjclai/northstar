// Natural-language Quick Add parser. Turns a single line like
//   "拿鐵 120 信用卡"           → expense  (merchant 拿鐵, 120, matched account)
//   "+ 接案 5000 富邦"          → income
//   "買 2330.TW 5股 @1042"      → investment buy
// into a structured draft. Anything it can't confidently read comes back as
// `unknown` so the UI can open a prefilled form for the user to finish.

export interface QuickAddAccount {
  id: string;
  name: string;
  currency?: string;
}

export interface QuickAddContext {
  accounts: QuickAddAccount[];
  merchantCategory?: Map<string, { category: string; subcategory: string }>;
  /**
   * When set, forces the parser down a specific path instead of guessing:
   *   - "investment" treats the whole line as a buy/sell even without a
   *     leading 買/賣 verb (the verb only flips action).
   *   - "ledger" never routes to investment.
   * Left undefined for the legacy auto-detect behaviour.
   */
  mode?: "ledger" | "investment";
}

export type QuickAddParsed =
  | {
      kind: "ledger";
      entryType: "expense" | "income";
      amount: number;
      accountId: string | null;
      merchant: string;
      category: string;
      subcategory: string;
    }
  | {
      kind: "investment";
      action: "buy" | "sell";
      ticker: string;
      quantity: number;
      price: number;
      accountId: string | null;
    }
  | { kind: "unknown"; text: string };

function parseNumber(value: string): number {
  return Number(value.replace(/,/g, ""));
}

/** Find the longest account name that appears in `text`; returns it + the id. */
function matchAccount(text: string, accounts: QuickAddAccount[]): { id: string; name: string } | null {
  const matches = accounts
    .filter((a) => a.name.trim() && text.includes(a.name.trim()))
    .sort((a, b) => b.name.length - a.name.length);
  return matches[0] ? { id: matches[0].id, name: matches[0].name.trim() } : null;
}

export function parseQuickAdd(raw: string, ctx: QuickAddContext): QuickAddParsed {
  const text = raw.trim();
  if (!text) return { kind: "unknown", text: "" };

  // ── Investment ──
  // Auto mode triggers only on a leading 買/賣/buy/sell verb; "investment" mode
  // treats the whole line as a trade regardless of verb (the verb, if present,
  // only flips buy↔sell).
  const inv = /^(買|賣|buy|sell)\s+(.+)$/i.exec(text);
  if (ctx.mode !== "ledger" && (inv || ctx.mode === "investment")) {
    const verb = inv?.[1] ?? "";
    const rest = inv?.[2] ?? text;
    const action: "buy" | "sell" = /賣|sell/i.test(verb || rest) ? "sell" : "buy";
    // ticker = first alnum token; qty = first number (optionally 股/張/shares);
    // price = number after @ or 元.
    const tickerMatch = /([A-Za-z0-9]+(?:\.[A-Za-z]{1,4})?)/.exec(rest);
    const ticker = (tickerMatch?.[1] ?? "").toUpperCase();
    const afterTicker = tickerMatch ? rest.slice(tickerMatch.index + tickerMatch[0].length) : rest;
    const qtyMatch = /(\d+(?:\.\d+)?)\s*(?:股|張|shares?)?/i.exec(afterTicker);
    const priceMatch = /(?:@|＠|價|單價|each)\s*(\d[\d,]*(?:\.\d+)?)/i.exec(rest) || /(\d[\d,]*(?:\.\d+)?)\s*元/.exec(rest);
    const accountMatch = matchAccount(rest, ctx.accounts);
    // In forced investment mode, return a (possibly partial) draft for the user
    // to finish even when no ticker was confidently read.
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

  const amountMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(body);
  if (!amountMatch) return { kind: "unknown", text };
  const amount = parseNumber(amountMatch[1]);

  const account = matchAccount(body, ctx.accounts);

  // Merchant/name = body minus the amount token and any matched account name.
  let merchant = body.replace(amountMatch[0], " ");
  if (account) merchant = merchant.replace(account.name, " ");
  merchant = merchant.replace(/\s+/g, " ").trim();

  const suggestion = ctx.merchantCategory?.get(merchant);

  return {
    kind: "ledger",
    entryType,
    amount,
    accountId: account?.id ?? null,
    merchant,
    category: suggestion?.category ?? "",
    subcategory: suggestion?.subcategory ?? "",
  };
}
