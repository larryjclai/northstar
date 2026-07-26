import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { orchestrate, type NlParser } from "./nlParser";
import type { QuickAddContext } from "./quickAdd";
import type { QuickAddParseResult } from "./quickAdd";

const ctx: QuickAddContext = {
  accounts: [
    { id: "a_cash", name: "錢包" },
    { id: "a_card", name: "信用卡" },
  ],
  nowDatetimeLocal: "2026-06-13T10:00",
};

// A full on-device result for a simple ledger transaction.
const tier1LedgerResult: QuickAddParseResult = {
  kind: "ledger",
  source: "on-device",
  ledger: {
    entryType: { value: "expense", confidence: "high" },
    amount: { value: 120, confidence: "high" },
    accountId: { value: "a_card", confidence: "high" },
    merchant: { value: "星巴克", confidence: "high" },
    name: { value: "拿鐵", confidence: "high" },
    category: { value: "餐飲", confidence: "high" },
    subcategory: { value: "飲料", confidence: "high" },
    date: { value: null, confidence: "none" },
  },
};

function makeParser(overrides: Partial<NlParser> = {}): NlParser {
  return {
    available: vi.fn().mockResolvedValue(true),
    parse: vi.fn().mockResolvedValue(tier1LedgerResult),
    prewarm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tier 0 sufficient — on-device parser must NOT be called
// ---------------------------------------------------------------------------
describe("orchestrate – Tier 0 sufficient", () => {
  it("returns Tier 0 result without calling on-device parser", async () => {
    const parser = makeParser();
    // "便當 90" parses cleanly with Tier 0
    const { result, source } = await orchestrate("便當 90", ctx, parser);
    expect(result.kind).toBe("ledger");
    expect(source).toBe("rules");
    expect(parser.available).not.toHaveBeenCalled();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it("returns 'rules' source even when on-device parser is provided", async () => {
    const parser = makeParser();
    const { source } = await orchestrate("拿鐵 120 信用卡", ctx, parser);
    expect(source).toBe("rules");
  });

  it("clean single-token input (name only, merchant empty) does NOT escalate", async () => {
    const parser = makeParser();
    // "拿鐵 120" → merchant "", name "拿鐵" — clean, stays on Tier 0.
    const { result, source } = await orchestrate("拿鐵 120", ctx, parser);
    expect(source).toBe("rules");
    expect(result.kind).toBe("ledger");
    expect(parser.available).not.toHaveBeenCalled();
    expect(parser.parse).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tier 0 messy name — sentence blobs now live in `name` (merchant only holds
// @/known-merchant hits), so escalation gating must inspect both fields.
// ---------------------------------------------------------------------------
describe("orchestrate – messy name escalates to on-device parser", () => {
  it("unknown-merchant sentence: multi-token blob in name → escalates", async () => {
    const parser = makeParser();
    // Tier 0 → merchant "", name "我在 全家便利商店 午餐" (whitespace + filler).
    const { source } = await orchestrate("我在 全家便利商店 午餐 300", ctx, parser);
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(source).toBe("on-device");
  });

  it("known-merchant hit with messy leftover name → still escalates", async () => {
    const parser = makeParser();
    const knownCtx: QuickAddContext = {
      ...ctx,
      merchantCategory: new Map([["50嵐", { category: "餐飲", subcategory: "飲料" }]]),
    };
    // Tier 0 → merchant "50嵐" (clean), name "花了 元在 吃晚餐" (messy filler).
    const { source } = await orchestrate("花了 50 元在 50嵐吃晚餐", knownCtx, parser);
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(source).toBe("on-device");
  });
});

// ---------------------------------------------------------------------------
// Tier 0 insufficient — on-device parser kicked in
// ---------------------------------------------------------------------------
describe("orchestrate – Tier 0 unknown → calls on-device parser", () => {
  it("calls on-device parser when Tier 0 returns unknown", async () => {
    const parser = makeParser();
    // "今天の気分" has no amount → Tier 0 returns unknown
    const { result, source } = await orchestrate("今天の気分", ctx, parser);
    expect(parser.available).toHaveBeenCalledOnce();
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(source).toBe("on-device");
    expect(result.kind).toBe("ledger");
    if (result.kind === "ledger") {
      expect(result.amount).toBe(120);
      expect(result.accountId).toBe("a_card");
    }
  });

  it("merges on-device result: amount / accountId / merchant / name / category all transferred", async () => {
    const parser = makeParser();
    const { result } = await orchestrate("no-amount-text", ctx, parser);
    if (result.kind !== "ledger") throw new Error("expected ledger");
    expect(result.amount).toBe(120);
    expect(result.accountId).toBe("a_card");
    expect(result.merchant).toBe("星巴克");
    expect(result.name).toBe("拿鐵");
    expect(result.category).toBe("餐飲");
    expect(result.subcategory).toBe("飲料");
  });
});

// ---------------------------------------------------------------------------
// Tier 1 account resolution + sanitisation
// ---------------------------------------------------------------------------
describe("orchestrate – sanitises on-device account/merchant", () => {
  function ledgerResult(
    over: Partial<{ accountId: string | null; merchant: string | null; name: string | null }>,
  ): QuickAddParseResult {
    return {
      kind: "ledger",
      source: "on-device",
      ledger: {
        entryType: { value: "expense", confidence: "high" },
        amount: { value: 300, confidence: "high" },
        accountId: { value: over.accountId ?? null, confidence: "high" },
        merchant: { value: over.merchant ?? null, confidence: "high" },
        name: { value: over.name ?? null, confidence: "high" },
        category: { value: "餐飲", confidence: "high" },
        subcategory: { value: null, confidence: "none" },
        date: { value: null, confidence: "none" },
      },
    };
  }

  it("maps a model-returned account NAME back to its id", async () => {
    const parser = makeParser({
      parse: vi.fn().mockResolvedValue(ledgerResult({ accountId: "信用卡" })),
    });
    const { result } = await orchestrate("unknown text", ctx, parser);
    if (result.kind !== "ledger") throw new Error("expected ledger");
    expect(result.accountId).toBe("a_card");
  });

  it("nulls a hallucinated account that matches no id or name", async () => {
    const parser = makeParser({
      parse: vi.fn().mockResolvedValue(ledgerResult({ accountId: "玉山銀行" })),
    });
    const { result } = await orchestrate("unknown text", ctx, parser);
    if (result.kind !== "ledger") throw new Error("expected ledger");
    expect(result.accountId).toBeNull();
  });

  it("drops a merchant that merely duplicates the name", async () => {
    const parser = makeParser({
      parse: vi.fn().mockResolvedValue(ledgerResult({ merchant: "計程車", name: "計程車" })),
    });
    const { result } = await orchestrate("unknown text", ctx, parser);
    if (result.kind !== "ledger") throw new Error("expected ledger");
    expect(result.merchant).toBe("");
    expect(result.name).toBe("計程車");
  });
});

// ---------------------------------------------------------------------------
// On-device parser unavailable → stay with Tier 0
// ---------------------------------------------------------------------------
describe("orchestrate – on-device parser unavailable", () => {
  it("stays with Tier 0 result when available() returns false", async () => {
    const parser = makeParser({ available: vi.fn().mockResolvedValue(false) });
    const { result, source } = await orchestrate("no-amount-text", ctx, parser);
    expect(source).toBe("rules");
    expect(result.kind).toBe("unknown");
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it("stays with Tier 0 when no parser provided at all", async () => {
    const { result, source } = await orchestrate("no-amount-text", ctx, undefined);
    expect(source).toBe("rules");
    expect(result.kind).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Timeout / error resilience
// ---------------------------------------------------------------------------
describe("orchestrate – timeout and error handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to Tier 0 when on-device parse times out", async () => {
    const parser = makeParser({
      parse: vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      ),
    });
    const promise = orchestrate("no-amount-text", ctx, parser);
    // Use async variant so microtasks flush between timer ticks.
    await vi.advanceTimersByTimeAsync(4100);
    const { result, source } = await promise;
    expect(source).toBe("rules");
    expect(result.kind).toBe("unknown");
  });

  it("falls back to Tier 0 when available() check times out (500 ms gate)", async () => {
    const parser = makeParser({
      available: vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      ),
    });
    const promise = orchestrate("no-amount-text", ctx, parser);
    await vi.advanceTimersByTimeAsync(600);
    const { source } = await promise;
    expect(source).toBe("rules");
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it("falls back to Tier 0 when on-device parse rejects", async () => {
    const parser = makeParser({
      parse: vi.fn().mockRejectedValue(new Error("model error")),
    });
    const { source } = await orchestrate("no-amount-text", ctx, parser);
    expect(source).toBe("rules");
  });

  it("falls back to Tier 0 when on-device returns null", async () => {
    const parser = makeParser({
      parse: vi.fn().mockResolvedValue(null),
    });
    const { source } = await orchestrate("no-amount-text", ctx, parser);
    expect(source).toBe("rules");
  });
});

// ---------------------------------------------------------------------------
// Investment path via on-device
// ---------------------------------------------------------------------------
describe("orchestrate – investment via on-device", () => {
  const tier1InvResult: QuickAddParseResult = {
    kind: "investment",
    source: "on-device",
    investment: {
      action: { value: "buy", confidence: "high" },
      ticker: { value: "AAPL", confidence: "high" },
      quantity: { value: 10, confidence: "high" },
      price: { value: 180, confidence: "high" },
      accountId: { value: "a_cash", confidence: "low" },
      date: { value: null, confidence: "none" },
    },
  };

  it("converts investment result correctly", async () => {
    const parser = makeParser({ parse: vi.fn().mockResolvedValue(tier1InvResult) });
    const { result, source } = await orchestrate("no-amount-text", ctx, parser);
    expect(source).toBe("on-device");
    if (result.kind !== "investment") throw new Error("expected investment");
    expect(result.ticker).toBe("AAPL");
    expect(result.quantity).toBe(10);
    expect(result.price).toBe(180);
    expect(result.accountId).toBe("a_cash");
  });
});

// ---------------------------------------------------------------------------
// on-device result lacks amount → fall back
// ---------------------------------------------------------------------------
describe("orchestrate – on-device result without amount falls back", () => {
  it("ignores on-device ledger result with no amount", async () => {
    const noAmount: QuickAddParseResult = {
      kind: "ledger",
      source: "on-device",
      ledger: {
        entryType: { value: "expense", confidence: "low" },
        amount: { value: null, confidence: "none" },
        accountId: { value: null, confidence: "none" },
        merchant: { value: "未知", confidence: "low" },
        name: { value: null, confidence: "none" },
        category: { value: null, confidence: "none" },
        subcategory: { value: null, confidence: "none" },
        date: { value: null, confidence: "none" },
      },
    };
    const parser = makeParser({ parse: vi.fn().mockResolvedValue(noAmount) });
    const { source, result } = await orchestrate("no-amount-text", ctx, parser);
    expect(source).toBe("rules");
    expect(result.kind).toBe("unknown");
  });
});
