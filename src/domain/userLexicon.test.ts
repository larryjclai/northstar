import { describe, expect, it } from "vitest";
import { buildUserLexicon, matchAccountFromLexicon, lookupCategory } from "./userLexicon";
import type { Account, AppSettings, LedgerTransaction } from "./types";
import type { CorrectionStore } from "./quickAddCorrections";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseSettings: AppSettings = {
  primaryCurrency: "TWD",
  categories: [
    { name: "餐飲", children: ["飲料", "外食"] },
    { name: "交通", children: ["計程車", "捷運"] },
    { name: "居住", children: ["房租", "水電"] },
    { name: "收入", children: ["薪資"] },
  ],
  merchants: ["全家", "7-ELEVEN"],
  exchangeRates: [],
};

function makeAccount(overrides: Partial<Account> & { id: string; name: string }): Account {
  return {
    currency: "TWD",
    openingBalance: 0,
    balance: 0,
    type: "cash",
    bookId: "book_test_default",
    creditLimit: null,
    creditLimitGroup: "",
    statementDay: null,
    paymentDueDay: null,
    creditPaymentPaidUntil: null,
    isSharedToHousehold: false,
    loanStartDate: null,
    annualInterestRate: null,
    loanTerm: null,
    iconName: null,
    color: null,
    deletedAt: null,
    updatedAt: "2026-01-01",
    createdAt: "2026-01-01",
    revision: 1,
    spaceId: "s1",
    ...overrides,
  };
}

function makeLedger(overrides: Partial<LedgerTransaction> & { id: string }): LedgerTransaction {
  return {
    accountId: "a1",
    counterAccountId: null,
    date: "2026-01-01",
    name: "",
    amount: -100,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: null,
    deletedAt: null,
    updatedAt: "2026-01-01",
    createdAt: "2026-01-01",
    revision: 1,
    spaceId: "s1",
    ...overrides,
  };
}

const accounts: Account[] = [
  makeAccount({ id: "a_cash", name: "錢包", type: "cash" }),
  makeAccount({ id: "a_card", name: "信用卡", type: "credit" }),
  makeAccount({ id: "a_fubon", name: "富邦證券", type: "investment" }),
];

// ---------------------------------------------------------------------------
// buildUserLexicon – account aliases
// ---------------------------------------------------------------------------
describe("buildUserLexicon – account aliases", () => {
  const lex = buildUserLexicon(accounts, [], baseSettings);

  it("maps full account name (case-insensitive)", () => {
    expect(lex.accountAliases.get("信用卡")?.accountId).toBe("a_card");
    expect(lex.accountAliases.get("富邦證券")?.accountId).toBe("a_fubon");
  });

  it("maps suffix-stripped alias (富邦證券 → 富邦)", () => {
    expect(lex.accountAliases.get("富邦")?.accountId).toBe("a_fubon");
  });

  it("maps prefix aliases (富邦證 → 富邦證券)", () => {
    expect(lex.accountAliases.get("富邦證")?.accountId).toBe("a_fubon");
  });

  it("maps seed alias 卡 → credit account", () => {
    expect(lex.accountAliases.get("卡")?.accountId).toBe("a_card");
  });

  it("maps seed aliases 現金 / 錢包 → cash account", () => {
    expect(lex.accountAliases.get("現金")?.accountId).toBe("a_cash");
    expect(lex.accountAliases.get("錢包")?.accountId).toBe("a_cash");
  });

  it("full-name match has higher weight than prefix match", () => {
    const full = lex.accountAliases.get("富邦證券")!;
    const prefix = lex.accountAliases.get("富邦")!;
    expect(full.weight).toBeGreaterThan(prefix.weight);
  });
});

// ---------------------------------------------------------------------------
// matchAccountFromLexicon
// ---------------------------------------------------------------------------
describe("matchAccountFromLexicon", () => {
  const lex = buildUserLexicon(accounts, [], baseSettings);

  it("matches 富邦 in text '富邦 買 2330 5股'", () => {
    const r = matchAccountFromLexicon("富邦 買 2330 5股", lex);
    expect(r?.accountId).toBe("a_fubon");
  });

  it("matches 信用卡 in text", () => {
    const r = matchAccountFromLexicon("拿鐵 120 信用卡", lex);
    expect(r?.accountId).toBe("a_card");
  });

  it("matches seed alias 卡 alone", () => {
    const r = matchAccountFromLexicon("午餐 80 卡", lex);
    expect(r?.accountId).toBe("a_card");
  });

  it("returns null when no account token in text", () => {
    expect(matchAccountFromLexicon("便當 90", lex)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildUserLexicon – keyword → category (learned from history)
// ---------------------------------------------------------------------------
describe("buildUserLexicon – learned keyword→category", () => {
  const ledger: LedgerTransaction[] = [
    makeLedger({ id: "t1", merchant: "計程車", category: "交通", subcategory: "計程車", amount: -250 }),
    makeLedger({ id: "t2", merchant: "計程車", category: "交通", subcategory: "計程車", amount: -180 }),
    makeLedger({ id: "t3", merchant: "星巴克", category: "餐飲", subcategory: "飲料", amount: -120 }),
  ];
  const lex = buildUserLexicon(accounts, ledger, baseSettings);

  it("learns 計程車 → 交通/計程車 from 2 records", () => {
    const r = lookupCategory("計程車", lex);
    expect(r?.category).toBe("交通");
    expect(r?.subcategory).toBe("計程車");
    expect(r?.count).toBe(2);
  });

  it("learns 星巴克 → 餐飲/飲料 from 1 record", () => {
    const r = lookupCategory("星巴克", lex);
    expect(r?.category).toBe("餐飲");
  });

  it("history overrides seed for the same token", () => {
    // 計程車 is in seed as 交通/計程車 AND in history — history should win with count > 0
    const r = lookupCategory("計程車", lex);
    expect(r?.count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildUserLexicon – seed keywords (cold start, no history)
// ---------------------------------------------------------------------------
describe("buildUserLexicon – seed keywords (no history)", () => {
  const lex = buildUserLexicon(accounts, [], baseSettings);

  it("seeds 計程車 → 交通/計程車 (count 0)", () => {
    const r = lookupCategory("計程車", lex);
    expect(r?.category).toBe("交通");
    expect(r?.count).toBe(0);
  });

  it("seeds taxi → 交通", () => {
    expect(lookupCategory("taxi", lex)?.category).toBe("交通");
  });

  it("seeds uber → 交通", () => {
    expect(lookupCategory("uber", lex)?.category).toBe("交通");
  });

  it("seeds 咖啡 → 餐飲/飲料", () => {
    const r = lookupCategory("咖啡", lex);
    expect(r?.category).toBe("餐飲");
    expect(r?.subcategory).toBe("飲料");
  });

  it("seeds 房租 → 居住/房租", () => {
    expect(lookupCategory("房租", lex)?.category).toBe("居住");
  });
});

// ---------------------------------------------------------------------------
// buildUserLexicon – merchants
// ---------------------------------------------------------------------------
describe("buildUserLexicon – merchants", () => {
  const ledger: LedgerTransaction[] = [
    makeLedger({ id: "t1", merchant: "拿鐵坊", amount: -120 }),
    makeLedger({ id: "t2", merchant: "拿鐵坊", amount: -80 }),
    makeLedger({ id: "t3", merchant: "便當店", amount: -90 }),
  ];
  const lex = buildUserLexicon(accounts, ledger, baseSettings);

  it("includes merchants from settings and history, sorted by frequency", () => {
    const names = lex.merchants.map((m) => m.name);
    expect(names).toContain("拿鐵坊");
    expect(names).toContain("便當店");
    expect(names).toContain("全家"); // from settings
    // 拿鐵坊 appears twice → higher count than 便當店
    const a = lex.merchants.find((m) => m.name === "拿鐵坊")!;
    const b = lex.merchants.find((m) => m.name === "便當店")!;
    expect(a.count).toBeGreaterThan(b.count);
  });
});

// ---------------------------------------------------------------------------
// buildUserLexicon – corrections (highest priority)
// ---------------------------------------------------------------------------
describe("buildUserLexicon – corrections override everything", () => {
  // History says 計程車 → 交通, but user correction says → 居住 (unusual but their call)
  const ledger: LedgerTransaction[] = [
    makeLedger({ id: "t1", merchant: "計程車", category: "交通", subcategory: "計程車", amount: -250 }),
    makeLedger({ id: "t2", merchant: "計程車", category: "交通", subcategory: "計程車", amount: -250 }),
    makeLedger({ id: "t3", merchant: "計程車", category: "交通", subcategory: "計程車", amount: -250 }),
  ];

  const corrections: CorrectionStore = {
    "計程車": { category: "居住", subcategory: "管理費" },       // overrides 3× history
    "星巴克": { accountId: "a_cash" },                          // account correction
  };

  const lex = buildUserLexicon(accounts, ledger, baseSettings, corrections);

  it("correction overrides history-learned category (3 history records vs 1 correction)", () => {
    const r = lookupCategory("計程車", lex);
    expect(r?.category).toBe("居住");
    expect(r?.subcategory).toBe("管理費");
    expect(r?.count).toBe(9999); // sentinel value indicating correction
  });

  it("correction overrides seed for account alias", () => {
    // 星巴克 normally has no account mapping; correction pins it to a_cash
    const hit = lex.accountAliases.get("星巴克");
    expect(hit?.accountId).toBe("a_cash");
    expect(hit?.weight).toBe(20); // highest weight
  });

  it("correction weight beats all other aliases for the same token", () => {
    // Even if another rule gave 信用卡 weight 10, correction gives 20
    const hit = lex.accountAliases.get("星巴克")!;
    expect(hit.weight).toBeGreaterThan(10);
  });

  it("uncorrected tokens still resolve normally from history", () => {
    // 計程車 category is corrected, but other tokens are unaffected
    const noCorr = buildUserLexicon(accounts, ledger, baseSettings); // no corrections
    const r = lookupCategory("計程車", noCorr);
    expect(r?.category).toBe("交通");
  });

  it("no corrections → same behaviour as before (backward compat)", () => {
    const lex2 = buildUserLexicon(accounts, [], baseSettings, {});
    expect(lookupCategory("計程車", lex2)?.count).toBe(0); // seed
  });
});
