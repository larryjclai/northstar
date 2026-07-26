// Tier 1 (on-device) orchestrator.
//
// Routing:
//   1. Tier 0 (rules, synchronous) always runs first.
//   2. If key fields are missing and an on-device NlParser is available,
//      Tier 1 fills the gaps (Apple Foundation Models).
//   3. Each tier falls back gracefully — missing Tier 1 is invisible to the user.
//
// The interface is intentionally thin so the orchestrator is fully unit-testable
// without a real device (just mock the NlParser with vi.fn()).

import { parseQuickAdd, type QuickAddContext, type QuickAddParsed, type QuickAddParseResult } from "./quickAdd";

export interface NlParser {
  /** Return true when the underlying model is available and ready (fast check). */
  available(): Promise<boolean>;
  /**
   * Parse `text` and return a structured result, or null on failure / timeout.
   * Must not throw — all errors should be caught internally and return null.
   */
  parse(text: string, ctx: QuickAddContext): Promise<QuickAddParseResult | null>;
  /**
   * Optional: begin warming up the model before the user starts typing.
   * No-op when the model is unavailable.
   */
  prewarm?(): Promise<void>;
}

export type ParseSource = "rules" | "on-device";

export interface OrchestratedResult {
  result: QuickAddParsed;
  source: ParseSource;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when Tier 0's result is unusable OR looks messy enough that the
 * on-device model is likely to do better. Clean single-token results (e.g.
 * "拿鐵 120 信用卡" → name "拿鐵") stay on Tier 0 so they remain instant;
 * natural-language sentences ("我在 全家便利商店 午餐 300") escalate to Tier 1.
 *
 * Tier 0 splits merchant (@ syntax or a known-merchant hit) from name (the
 * leftover description), so BOTH fields are inspected: the sentence blob lands
 * in `name` when no merchant is recognised, and messy filler can remain in
 * `name` even when a known merchant was extracted (「花了 50 元在 50嵐吃晚餐」
 * → merchant 50嵐, name still carries the 花了/元在 filler).
 */
function tier0Insufficient(r: QuickAddParsed): boolean {
  if (r.kind === "unknown") return true;
  if (r.kind === "ledger") {
    for (const field of [r.merchant, r.name ?? ""]) {
      const t = field.trim();
      // Internal whitespace → rules couldn't segment the text; let the model
      // split it.
      if (/\s/.test(t)) return true;
      // Sentence-style filler words that indicate free-form natural language.
      if (/(我在|花了|付了|買了|吃了|喝了|剛剛|剛才|我去|去了)/.test(t)) return true;
    }
    return false;
  }
  return false; // investment: trust Tier 0's structured extraction
}

/**
 * Resolve a model-emitted account value to a real account id.
 * The on-device model sometimes returns the account *name* instead of its id,
 * or hallucinates a value — so accept only an exact id, else a name match,
 * else null. This keeps a bad guess from silently selecting the wrong account.
 */
function resolveAccountId(value: string | null, ctx: QuickAddContext): string | null {
  if (!value) return null;
  const accounts = ctx.accounts ?? [];
  if (accounts.some((a) => a.id === value)) return value;
  const v = value.trim().toLowerCase();
  const byName = accounts.find((a) => a.name.trim().toLowerCase() === v);
  return byName?.id ?? null;
}

/** Convert a QuickAddParseResult from Tier 1 into the QuickAddParsed shape. */
function tier1ToParsed(r: QuickAddParseResult, ctx: QuickAddContext): QuickAddParsed | null {
  if (r.kind === "ledger" && r.ledger) {
    const l = r.ledger;
    const amount = l.amount.value;
    if (!amount || amount <= 0) return null;
    let merchant = l.merchant.value ?? "";
    const name = l.name.value ?? undefined;
    // Drop a merchant that merely duplicates the name (small models echo the
    // item into merchant when there's no real store, e.g. 計程車/計程車).
    if (name && merchant && merchant === name) merchant = "";
    return {
      kind: "ledger",
      entryType: l.entryType.value ?? "expense",
      amount,
      accountId: resolveAccountId(l.accountId.value, ctx),
      merchant,
      ...(name !== undefined ? { name } : {}),
      category: l.category.value ?? "",
      subcategory: l.subcategory.value ?? "",
      ...(l.date.value ? { date: l.date.value } : {}),
    };
  }
  if (r.kind === "investment" && r.investment) {
    const inv = r.investment;
    const ticker = inv.ticker.value;
    if (!ticker) return null;
    return {
      kind: "investment",
      action: inv.action.value ?? "buy",
      ticker,
      quantity: inv.quantity.value ?? 0,
      price: inv.price.value ?? 0,
      accountId: resolveAccountId(inv.accountId.value, ctx),
      ...(inv.date.value ? { date: inv.date.value } : {}),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

// Hard timeout for the Tier 1 parse call. On-device inference is ~1.3–1.6 s
// after prewarm; 4 s leaves headroom for IPC and the occasional cold start.
// Only reached when Tier 0 already failed, so a brief wait is acceptable.
const TIER1_TIMEOUT_MS = 4000;

/**
 * Run the full tier chain and return the best result with its source label.
 *
 * - Always synchronous-fast for Tier 0-sufficient inputs (no await).
 * - Await Tier 1 only when Tier 0 fails and an on-device parser is provided.
 */
export async function orchestrate(
  text: string,
  ctx: QuickAddContext,
  onDeviceParser?: NlParser,
): Promise<OrchestratedResult> {
  const tier0 = parseQuickAdd(text, ctx);

  if (!tier0Insufficient(tier0) || !onDeviceParser) {
    return { result: tier0, source: "rules" };
  }

  // Check availability with a short timeout to avoid blocking the UI.
  let available = false;
  try {
    available = await Promise.race([
      onDeviceParser.available(),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
  } catch {
    /* availability check failed — treat as unavailable */
  }
  if (!available) return { result: tier0, source: "rules" };

  // Tier 1 parse with hard 2 s timeout.
  let tier1: QuickAddParseResult | null = null;
  try {
    tier1 = await Promise.race([
      onDeviceParser.parse(text, ctx),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIER1_TIMEOUT_MS)),
    ]);
  } catch {
    /* tier-1 parse failed — fall back to rules */
  }

  if (!tier1) return { result: tier0, source: "rules" };

  const merged = tier1ToParsed(tier1, ctx);
  if (!merged) return { result: tier0, source: "rules" };

  return { result: merged, source: "on-device" };
}
