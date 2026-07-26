/**
 * Demo dataset — a realistic, TWD-centric set of accounts, transactions,
 * holdings, goals and recurring rules so the app can be explored (or demoed)
 * with full data instead of empty placeholders.
 *
 * Everything is built through the public Draft APIs (createAccount /
 * importLedgerTransactions / importInvestmentRecords / …), i.e. the exact same
 * code path a real user's entries take. That means account balances and
 * portfolio holdings are derived/recomputed automatically, and it works
 * identically in the browser (IndexedDB) and the desktop app (SQLite).
 */
import type {
  FinanceRepository,
  InvestmentDraft,
  LedgerDraft,
  RecurringDraft,
  RepositorySnapshot,
} from "./repositories";
import type { DailyFxRate, DailyPrice } from "../domain/types";

/** Marker stored on demo accounts' customGroup so demo data can be detected. */
export const DEMO_GROUP = "示範";

// ── Date helpers ────────────────────────────────────────────────────────────
// Ledger/investment dates use the same "YYYY-MM-DDTHH:mm" local format the
// QuickAdd flow produces. Everything is relative to "now" so the current month
// always has data (budget, cash-flow and upcoming cards stay populated).
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function dtLocal(daysAgo: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
}
function dateOnly(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Account blueprints ──────────────────────────────────────────────────────
interface AccountBlueprint {
  name: string;
  type: "depository" | "cash" | "credit" | "investment";
  openingBalance: number;
  currency: string;
  iconName: string | null;
  creditLimit?: number;
  statementDay?: number;
  paymentDueDay?: number;
}

const ACCOUNTS: AccountBlueprint[] = [
  {
    name: "國泰世華 數位帳戶",
    type: "depository",
    openingBalance: 286_000,
    currency: "TWD",
    iconName: "Bank",
  },
  {
    name: "台新 Richart",
    type: "depository",
    openingBalance: 82_000,
    currency: "TWD",
    iconName: "PiggyBank",
  },
  {
    name: "街口支付",
    type: "cash",
    openingBalance: 3_800,
    currency: "TWD",
    iconName: "DeviceMobile",
  },
  {
    name: "玉山 Pi 拍錢包卡",
    type: "credit",
    openingBalance: 0,
    currency: "TWD",
    iconName: "CreditCard",
    creditLimit: 150_000,
    statementDay: 5,
    paymentDueDay: 23,
  },
  {
    name: "凱基證券",
    type: "investment",
    openingBalance: 210_000,
    currency: "TWD",
    iconName: "ChartLineUp",
  },
  {
    name: "Firstrade",
    type: "investment",
    openingBalance: 3_000,
    currency: "USD",
    iconName: "ChartLineUp",
  },
];

// ── Ledger blueprints (account referenced by name, resolved after creation) ──
interface LedgerBlueprint {
  daysAgo: number;
  account: string;
  name: string;
  merchant: string;
  category: string;
  subcategory: string;
  amount: number; // positive = income, negative = expense
}

function buildLedger(): LedgerBlueprint[] {
  const rows: LedgerBlueprint[] = [];
  const cathay = "國泰世華 數位帳戶";
  const card = "玉山 Pi 拍錢包卡";
  const jko = "街口支付";
  const richart = "台新 Richart";

  // Monthly salary (this month + previous two). Offsets land on/after the 1st
  // so the current calendar month always shows income (non-zero savings rate).
  for (const d of [1, 31, 61]) {
    rows.push({
      daysAgo: d,
      account: cathay,
      name: "薪資",
      merchant: "公司",
      category: "收入",
      subcategory: "薪資",
      amount: 72_000,
    });
  }
  // Rent + fixed bills (this month + previous)
  for (const d of [1, 31]) {
    rows.push({
      daysAgo: d,
      account: cathay,
      name: "房租",
      merchant: "房東",
      category: "居住",
      subcategory: "房租",
      amount: -18_500,
    });
    rows.push({
      daysAgo: d + 1,
      account: cathay,
      name: "電費／水費",
      merchant: "台電",
      category: "居住",
      subcategory: "水電",
      amount: -1_380,
    });
    rows.push({
      daysAgo: d + 2,
      account: card,
      name: "中華電信 5G",
      merchant: "中華電信",
      category: "居住",
      subcategory: "通訊",
      amount: -899,
    });
  }

  // Recurring-feel subscriptions on the card
  for (const d of [8, 38]) {
    rows.push({
      daysAgo: d,
      account: card,
      name: "Netflix",
      merchant: "Netflix",
      category: "娛樂",
      subcategory: "訂閱",
      amount: -390,
    });
    rows.push({
      daysAgo: d + 4,
      account: card,
      name: "Spotify",
      merchant: "Spotify",
      category: "娛樂",
      subcategory: "訂閱",
      amount: -149,
    });
  }

  // Everyday spending — spread across the last ~50 days
  const daily: Array<[number, string, string, string, string, number, string]> = [
    [0, "拿鐵", "Louisa", "餐飲", "飲料", -120, card],
    [0, "午餐 便當", "自助餐", "餐飲", "外食", -110, jko],
    [1, "全家", "全家", "餐飲", "點心", -86, card],
    [2, "捷運", "台北捷運", "交通", "捷運", -64, jko],
    [2, "晚餐 火鍋", "築間", "餐飲", "外食", -640, card],
    [3, "手搖飲", "可不可", "餐飲", "飲料", -75, jko],
    [4, "Uber", "Uber", "交通", "計程車", -245, card],
    [5, "Costco 採買", "Costco", "購物", "日用", -2_380, card],
    [6, "午餐", "麥當勞", "餐飲", "外食", -159, card],
    [7, "加油", "台塑石油", "交通", "加油", -1_000, card],
    [9, "電影", "威秀影城", "娛樂", "休閒", -320, card],
    [10, "全聯", "全聯", "購物", "日用", -540, richart],
    [11, "拿鐵", "Louisa", "餐飲", "飲料", -120, card],
    [12, "晚餐", "鼎泰豐", "餐飲", "外食", -880, card],
    [13, "藥妝", "康是美", "購物", "日用", -430, card],
    [14, "捷運儲值", "台北捷運", "交通", "捷運", -500, jko],
    [16, "午餐", "Subway", "餐飲", "外食", -175, card],
    [18, "momo 購物", "momo", "購物", "網購", -1_290, card],
    [19, "早餐", "美而美", "餐飲", "外食", -65, jko],
    [21, "咖啡豆", "Cama", "餐飲", "飲料", -360, card],
    [23, "聚餐", "石二鍋", "餐飲", "外食", -420, card],
    [25, "停車費", "嗶嗶", "交通", "停車", -120, jko],
    [27, "書店", "誠品", "購物", "其他", -560, card],
    [29, "午餐", "丼飯屋", "餐飲", "外食", -180, card],
    [34, "晚餐", "藏壽司", "餐飲", "外食", -520, card],
    [40, "加油", "台塑石油", "交通", "加油", -980, card],
    [44, "Costco 採買", "Costco", "購物", "日用", -1_960, card],
    [48, "退款 衣服", "Uniqlo", "收入", "退款", 590, richart],
  ];
  for (const [daysAgo, name, merchant, category, subcategory, amount, account] of daily) {
    rows.push({ daysAgo, account, name, merchant, category, subcategory, amount });
  }
  return rows;
}

// ── Investment blueprints ───────────────────────────────────────────────────
interface InvestmentBlueprint {
  daysAgo: number;
  ticker: string;
  name: string;
  action: "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
  assetType: "etf" | "equity";
  /** Defaults to TWD / 凱基證券. A USD holding sits in the Firstrade account. */
  currency?: string;
  account?: string;
}

const INVESTMENTS: InvestmentBlueprint[] = [
  {
    daysAgo: 64,
    ticker: "2330.TW",
    name: "台積電",
    action: "buy",
    price: 980,
    quantity: 30,
    fee: 42,
    assetType: "equity",
  },
  {
    daysAgo: 58,
    ticker: "0050.TW",
    name: "元大台灣50",
    action: "buy",
    price: 168,
    quantity: 200,
    fee: 48,
    assetType: "etf",
  },
  {
    daysAgo: 50,
    ticker: "2412.TW",
    name: "中華電",
    action: "buy",
    price: 124,
    quantity: 100,
    fee: 20,
    assetType: "equity",
  },
  {
    daysAgo: 40,
    ticker: "00878.TW",
    name: "國泰永續高股息",
    action: "buy",
    price: 21.8,
    quantity: 2_000,
    fee: 62,
    assetType: "etf",
  },
  {
    daysAgo: 20,
    ticker: "0050.TW",
    name: "元大台灣50",
    action: "buy",
    price: 181,
    quantity: 100,
    fee: 26,
    assetType: "etf",
  },
  {
    daysAgo: 14,
    ticker: "2330.TW",
    name: "台積電",
    action: "buy",
    price: 1_075,
    quantity: 20,
    fee: 31,
    assetType: "equity",
  },
  {
    daysAgo: 5,
    ticker: "2330.TW",
    name: "台積電",
    action: "sell",
    price: 1_120,
    quantity: 10,
    fee: 16,
    assetType: "equity",
  },
  // A US holding → gives the portfolio real USD currency exposure.
  {
    daysAgo: 45,
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    action: "buy",
    price: 480,
    quantity: 5,
    fee: 0,
    assetType: "etf",
    currency: "USD",
    account: "Firstrade",
  },
];

// Cash dividends so the 股利分析 (dividend) view has data. Total-amount form:
// quantity 0, price = net cash received. All dated AFTER each holding's first
// buy (00878 day-40, 0050 day-58, 2412 day-50) so they're never received
// before the position existed. 00878 高股息 pays monthly → two recent payouts.
interface DividendBlueprint {
  daysAgo: number;
  ticker: string;
  name: string;
  total: number;
  assetType: "etf" | "equity";
}
const DIVIDENDS: DividendBlueprint[] = [
  { daysAgo: 33, ticker: "00878.TW", name: "國泰永續高股息", total: 1_180, assetType: "etf" },
  { daysAgo: 30, ticker: "0050.TW", name: "元大台灣50", total: 980, assetType: "etf" },
  { daysAgo: 18, ticker: "2412.TW", name: "中華電", total: 470, assetType: "equity" },
  { daysAgo: 3, ticker: "00878.TW", name: "國泰永續高股息", total: 1_240, assetType: "etf" },
];

// Current market prices so holdings show live value & unrealized P/L.
const QUOTES: Array<{
  symbol: string;
  nameZh: string;
  price: number;
  changePercent: number;
  currency?: string;
}> = [
  { symbol: "2330.TW", nameZh: "台積電", price: 1_140, changePercent: 0.86 },
  { symbol: "0050.TW", nameZh: "元大台灣50", price: 189.5, changePercent: 0.45 },
  { symbol: "2412.TW", nameZh: "中華電", price: 131.5, changePercent: -0.19 },
  { symbol: "00878.TW", nameZh: "國泰永續高股息", price: 23.6, changePercent: 0.21 },
  {
    symbol: "VOO",
    nameZh: "Vanguard S&P 500 ETF",
    price: 540,
    changePercent: 0.32,
    currency: "USD",
  },
];

// ── Synthetic daily price / FX history ──────────────────────────────────────
// Demo holdings need ~1y of daily closes so the whole analytics suite (TWR,
// risk metrics, allocation drift, benchmark comparison) computes without
// relying on a live network backfill. Each series is a smooth interpolation
// through anchor points that PASS THROUGH the demo's own transaction prices
// (so TWR stays consistent with the trades) plus a small deterministic wobble,
// making the data reproducible run-to-run.

/** Deterministic ±1 pseudo-noise from a string+index seed (no Math.random). */
function wobble(seed: string, i: number): number {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k += 1) {
    h ^= seed.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  h ^= i;
  h = Math.imul(h, 16777619);
  // Map to [-1, 1).
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Linear-interpolate a price for `daysAgo` through anchors sorted desc by daysAgo. */
function interpAnchors(anchors: Array<[daysAgo: number, price: number]>, daysAgo: number): number {
  const sorted = [...anchors].sort((a, b) => b[0] - a[0]);
  if (daysAgo >= sorted[0][0]) return sorted[0][1];
  if (daysAgo <= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const [d0, p0] = sorted[i];
    const [d1, p1] = sorted[i + 1];
    if (daysAgo <= d0 && daysAgo >= d1) {
      const t = (d0 - daysAgo) / (d0 - d1);
      return p0 + (p1 - p0) * t;
    }
  }
  return sorted[sorted.length - 1][1];
}

/** Anchors per ticker: currency + [daysAgo, price]. Includes buy/sell dates so
 *  the daily series threads the transaction prices and ends at today's quote. */
const PRICE_ANCHORS: Record<string, { currency: string; anchors: Array<[number, number]> }> = {
  "2330.TW": {
    currency: "TWD",
    anchors: [
      [380, 820],
      [180, 910],
      [64, 980],
      [14, 1_075],
      [5, 1_120],
      [0, 1_140],
    ],
  },
  "0050.TW": {
    currency: "TWD",
    anchors: [
      [380, 148],
      [180, 160],
      [58, 168],
      [20, 181],
      [0, 189.5],
    ],
  },
  "2412.TW": {
    currency: "TWD",
    anchors: [
      [380, 116],
      [180, 120],
      [50, 124],
      [0, 131.5],
    ],
  },
  "00878.TW": {
    currency: "TWD",
    anchors: [
      [380, 19.4],
      [180, 20.6],
      [40, 21.8],
      [0, 23.6],
    ],
  },
  VOO: {
    currency: "USD",
    anchors: [
      [380, 430],
      [180, 455],
      [45, 480],
      [0, 540],
    ],
  },
};

const PRICE_HISTORY_DAYS = 380;

function buildDemoDailyPrices(): DailyPrice[] {
  const now = new Date();
  const rows: DailyPrice[] = [];
  for (const [ticker, { currency, anchors }] of Object.entries(PRICE_ANCHORS)) {
    const amplitude = anchors[0][1] * 0.006; // ~0.6% daily wobble, scaled to price
    for (let daysAgo = PRICE_HISTORY_DAYS; daysAgo >= 0; daysAgo -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - daysAgo);
      const base = interpAnchors(anchors, daysAgo);
      // No wobble on the endpoints so buy/sell/quote prices stay exact.
      const onAnchor = anchors.some(([ad]) => ad === daysAgo);
      const close = onAnchor ? base : Math.max(0.01, base + amplitude * wobble(ticker, daysAgo));
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      rows.push({
        ticker,
        date,
        close: +close.toFixed(2),
        currency,
        source: "demo",
        updatedAt: `${date}T13:30:00.000Z`,
      });
    }
  }
  return rows;
}

/** Light FX history so the Market card / data-health have fresh rates. */
const FX_ANCHORS: Record<string, [number, number]> = {
  "USD/TWD": [31.2, 31.65],
  "JPY/TWD": [0.205, 0.1951],
};

function buildDemoFxRates(): DailyFxRate[] {
  const now = new Date();
  const rows: DailyFxRate[] = [];
  for (const [pair, [startRate, endRate]] of Object.entries(FX_ANCHORS)) {
    const [from, to] = pair.split("/");
    for (let daysAgo = PRICE_HISTORY_DAYS; daysAgo >= 0; daysAgo -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - daysAgo);
      const t = (PRICE_HISTORY_DAYS - daysAgo) / PRICE_HISTORY_DAYS;
      const base = startRate + (endRate - startRate) * t;
      const rate = daysAgo === 0 ? endRate : base * (1 + 0.003 * wobble(pair, daysAgo));
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      rows.push({
        from,
        to,
        date,
        rate: +rate.toFixed(4),
        source: "demo",
        updatedAt: `${date}T13:30:00.000Z`,
      });
    }
  }
  return rows;
}

/**
 * Populate the repository with the demo dataset. Assumes the repository is
 * currently empty — callers should clear existing data first if needed.
 */
export async function loadDemoData(repo: FinanceRepository): Promise<void> {
  // 1. Accounts
  for (const a of ACCOUNTS) {
    await repo.createAccount({
      name: a.name,
      currency: a.currency,
      openingBalance: a.openingBalance,
      type: a.type,
      creditLimit: a.creditLimit ?? null,
      creditLimitGroup: "",
      statementDay: a.statementDay ?? null,
      paymentDueDay: a.paymentDueDay ?? null,
      creditPaymentPaidUntil: null,
      isSharedToHousehold: false,
      loanStartDate: null,
      annualInterestRate: null,
      loanTerm: null,
      iconName: a.iconName,
      color: null,
      customGroup: DEMO_GROUP,
    });
  }

  const accounts = await repo.listAccounts();
  const idByName = new Map(accounts.map((a) => [a.name, a.id]));
  const idFor = (name: string): string => {
    const id = idByName.get(name);
    if (!id) throw new Error(`Demo account not found: ${name}`);
    return id;
  };

  // 2. Ledger transactions
  const ledgerRows: LedgerDraft[] = buildLedger().map((r) => ({
    accountId: idFor(r.account),
    date: dtLocal(r.daysAgo, 9 + (r.daysAgo % 10), (r.daysAgo * 7) % 60),
    name: r.name,
    amount: r.amount,
    currency: "TWD",
    category: r.category,
    subcategory: r.subcategory,
    merchant: r.merchant,
    entryType: r.amount >= 0 ? "income" : "expense",
    settlementStatus: "settled",
    note: "",
  }));
  await repo.importLedgerTransactions(ledgerRows);

  // 3. Investments (TWD holdings in 凱基證券; USD holdings in Firstrade)
  const brokerageId = idFor("凱基證券");
  const investmentRows: InvestmentDraft[] = INVESTMENTS.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    currency: r.currency ?? "TWD",
    linkedAccountId: r.account ? idFor(r.account) : brokerageId,
    date: dtLocal(r.daysAgo, 10, 30),
    action: r.action,
    price: r.price,
    quantity: r.quantity,
    fee: r.fee,
    note: "",
    assetType: r.assetType,
  }));
  const dividendRows: InvestmentDraft[] = DIVIDENDS.map((d) => ({
    ticker: d.ticker,
    name: d.name,
    currency: "TWD",
    linkedAccountId: brokerageId,
    date: dtLocal(d.daysAgo, 10, 0),
    action: "cashDividend",
    price: d.total, // total-amount form (quantity 0)
    quantity: 0,
    fee: 0,
    note: "現金股利",
    assetType: d.assetType,
  }));
  await repo.importInvestmentRecords([...investmentRows, ...dividendRows]);

  // 4. Current market quotes
  await repo.saveMarketQuotes(
    QUOTES.map((q) => ({
      symbol: q.symbol,
      name: q.nameZh,
      nameZh: q.nameZh,
      nameEn: null,
      currency: q.currency ?? "TWD",
      price: q.price,
      change: +((q.price * q.changePercent) / 100).toFixed(2),
      changePercent: q.changePercent,
      marketTime: new Date().toISOString(),
    })),
    "demo",
  );

  // 4b. Synthetic daily price + FX history so the analytics suite computes
  //     offline (TWR, risk, allocation drift, benchmark) without a live backfill.
  await repo.saveDailyPrices(buildDemoDailyPrices());
  await repo.saveDailyFxRates(buildDemoFxRates());

  // 5. FIRE goal
  await repo.upsertFinancialGoal({
    kind: "fire",
    name: "50 歲退休",
    currency: "TWD",
    annualSpending: 840_000,
    withdrawalRate: 0.04,
    expectedAnnualReturn: 0.06,
    monthlyContribution: 35_000,
    targetAmount: null,
    startDate: dateOnly(0),
    currentAge: 32,
    retirementAge: 50,
    planThroughAge: 90,
    inflationRate: 0.02,
  });

  // 6. Recurring rules (next run in the future → show in 近期帳單)
  const recurring: RecurringDraft[] = [
    {
      accountId: idFor("國泰世華 數位帳戶"),
      amount: 72_000,
      currency: "TWD",
      category: "收入",
      subcategory: "薪資",
      merchant: "公司",
      entryType: "income",
      settlementStatus: "settled",
      note: "",
      frequency: "monthly",
      dayOfMonth: 5,
      nextRunDate: dateOnly(5),
      isActive: true,
    },
    {
      accountId: idFor("國泰世華 數位帳戶"),
      amount: -18_500,
      currency: "TWD",
      category: "居住",
      subcategory: "房租",
      merchant: "房東",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
      frequency: "monthly",
      dayOfMonth: 1,
      nextRunDate: dateOnly(12),
      isActive: true,
    },
    {
      accountId: idFor("玉山 Pi 拍錢包卡"),
      amount: -390,
      currency: "TWD",
      category: "娛樂",
      subcategory: "訂閱",
      merchant: "Netflix",
      entryType: "expense",
      settlementStatus: "settled",
      note: "",
      frequency: "monthly",
      dayOfMonth: 8,
      nextRunDate: dateOnly(8),
      isActive: true,
    },
  ];
  for (const r of recurring) await repo.createRecurringTransaction(r);

  // 7. Recurring investment (定期定額) — one plausible fixedAmount plan so the
  //    re-enabled DCA tab isn't empty in demo mode (plan 228). Settles from
  //    凱基證券 (brokerageId, TWD investment account).
  const dcaNextRun = dateOnly(3);
  await repo.createRecurringInvestment({
    accountId: brokerageId,
    ticker: "0050.TW",
    name: "元大台灣50",
    currency: "TWD",
    mode: "fixedAmount",
    amount: 10_000,
    quantity: 0,
    price: 189.5,
    fee: 20,
    frequency: "monthly",
    dayOfMonth: Number(dcaNextRun.slice(8, 10)),
    nextRunDate: dcaNextRun,
    isActive: true,
    note: "",
  });
}

/** True if the repository currently holds the demo dataset (by account marker). */
export async function hasDemoData(repo: FinanceRepository): Promise<boolean> {
  const accounts = await repo.listAccounts();
  return accounts.some((a) => a.customGroup === DEMO_GROUP);
}

// ── Non-destructive demo mode (snapshot swap) ───────────────────────────────
// Entering demo stashes the user's real data and loads the demo set; exiting
// restores the stash. The real data is NEVER discarded — if it can't be safely
// stashed first, we abort and leave the user's data untouched.
const DEMO_FLAG_KEY = "northstar.demoMode.v1";
// Legacy localStorage key — kept only so older stashes can still be restored on
// exit. New stashes live in IndexedDB (see below) because a full snapshot easily
// exceeds localStorage's ~5MB quota, which used to make entering demo mode fail
// for anyone with real data.
const DEMO_BACKUP_KEY = "northstar.preDemoSnapshot.v1";

// Pre-demo snapshot is stashed in IndexedDB — same durable, high-quota store the
// sync pre-backup uses (see features/connect/sync/backup.ts). A single fixed key
// holds the one transient stash; it's deleted again when demo mode exits.
const DEMO_STASH_DB = "northstar-demo-stash";
const DEMO_STASH_STORE = "snapshot";
const DEMO_STASH_KEY = "preDemoSnapshot";

function openStashDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEMO_STASH_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DEMO_STASH_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function writeStash(snapshot: RepositorySnapshot): Promise<void> {
  const db = await openStashDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEMO_STASH_STORE, "readwrite");
    tx.objectStore(DEMO_STASH_STORE).put(snapshot, DEMO_STASH_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readStash(): Promise<RepositorySnapshot | null> {
  const db = await openStashDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEMO_STASH_STORE, "readonly");
    const req = tx.objectStore(DEMO_STASH_STORE).get(DEMO_STASH_KEY);
    req.onsuccess = () => resolve((req.result as RepositorySnapshot | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function clearStash(): Promise<void> {
  const db = await openStashDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEMO_STASH_STORE, "readwrite");
    tx.objectStore(DEMO_STASH_STORE).delete(DEMO_STASH_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Enter demo mode: stash the current (real) data, then replace it with the demo
 * set. No-op if already in demo mode. Throws WITHOUT touching any data if the
 * real snapshot can't be stashed (e.g. localStorage quota), so the user's data
 * is never lost.
 */
export async function enterDemoMode(repo: FinanceRepository): Promise<void> {
  if (isDemoMode()) return;

  const snapshot = await repo.exportSnapshot();
  try {
    await writeStash(snapshot);
    localStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    // Couldn't safely preserve the real data → do not proceed.
    try {
      await clearStash();
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(DEMO_FLAG_KEY);
    } catch {
      /* ignore */
    }
    throw new Error(
      "無法安全保存你目前的資料，已取消進入示範模式（你的資料未被更動）。可先到設定手動匯出備份。",
    );
  }

  // Real data is safely stashed; now swap in the demo set.
  await clearAllData(repo);
  await loadDemoData(repo);
}

/**
 * Exit demo mode: restore the stashed real data. If there is no stash (e.g. the
 * flag was set without a backup) just clear the demo data rather than guess.
 */
export async function exitDemoMode(repo: FinanceRepository): Promise<void> {
  let snapshot: RepositorySnapshot | null = null;
  try {
    snapshot = await readStash();
  } catch {
    /* no stash — keep null */
  }

  // Backward-compat: older builds stashed the snapshot in localStorage.
  if (!snapshot) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(DEMO_BACKUP_KEY);
    } catch {
      /* no backup — keep null */
    }
    if (raw) {
      try {
        snapshot = JSON.parse(raw) as RepositorySnapshot;
      } catch {
        snapshot = null;
      }
    }
  }

  if (snapshot) {
    await repo.importSnapshot(snapshot);
  } else {
    await clearAllData(repo);
  }

  try {
    await clearStash();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(DEMO_BACKUP_KEY);
    localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Wipe all financial data, keeping the user's app settings (categories,
 * currency, FX). Implemented as an atomic snapshot import of empty tables —
 * the same path used by backup-restore — so it behaves identically in the
 * browser and the desktop app.
 */
export async function clearAllData(repo: FinanceRepository): Promise<void> {
  const settings = await repo.getAppSettings();
  await repo.importSnapshot({
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: [],
    ledgerTransactions: [],
    portfolioAssets: [],
    investmentRecords: [],
    recurringTransactions: [],
    recurringInvestments: [],
    marketQuotes: [],
    settings,
    dailyFxRates: [],
    dailyPrices: [],
    financialGoals: [],
    manualPriceSnapshots: [],
  });
}
