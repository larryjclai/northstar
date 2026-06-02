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
import type { FinanceRepository, InvestmentDraft, LedgerDraft, RecurringDraft } from "./repositories";

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
  { name: "國泰世華 數位帳戶", type: "depository", openingBalance: 286_000, currency: "TWD", iconName: "🏦" },
  { name: "台新 Richart", type: "depository", openingBalance: 82_000, currency: "TWD", iconName: "💸" },
  { name: "街口支付", type: "cash", openingBalance: 3_800, currency: "TWD", iconName: "📱" },
  { name: "玉山 Pi 拍錢包卡", type: "credit", openingBalance: 0, currency: "TWD", iconName: "💳", creditLimit: 150_000, statementDay: 5, paymentDueDay: 23 },
  { name: "凱基證券", type: "investment", openingBalance: 210_000, currency: "TWD", iconName: "📈" },
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
    rows.push({ daysAgo: d, account: cathay, name: "薪資", merchant: "公司", category: "收入", subcategory: "薪資", amount: 72_000 });
  }
  // Rent + fixed bills (this month + previous)
  for (const d of [1, 31]) {
    rows.push({ daysAgo: d, account: cathay, name: "房租", merchant: "房東", category: "居住", subcategory: "房租", amount: -18_500 });
    rows.push({ daysAgo: d + 1, account: cathay, name: "電費／水費", merchant: "台電", category: "居住", subcategory: "水電", amount: -1_380 });
    rows.push({ daysAgo: d + 2, account: card, name: "中華電信 5G", merchant: "中華電信", category: "居住", subcategory: "通訊", amount: -899 });
  }

  // Recurring-feel subscriptions on the card
  for (const d of [8, 38]) {
    rows.push({ daysAgo: d, account: card, name: "Netflix", merchant: "Netflix", category: "娛樂", subcategory: "訂閱", amount: -390 });
    rows.push({ daysAgo: d + 4, account: card, name: "Spotify", merchant: "Spotify", category: "娛樂", subcategory: "訂閱", amount: -149 });
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
}

const INVESTMENTS: InvestmentBlueprint[] = [
  { daysAgo: 64, ticker: "2330.TW", name: "台積電", action: "buy", price: 980, quantity: 30, fee: 42, assetType: "equity" },
  { daysAgo: 58, ticker: "0050.TW", name: "元大台灣50", action: "buy", price: 168, quantity: 200, fee: 48, assetType: "etf" },
  { daysAgo: 50, ticker: "2412.TW", name: "中華電", action: "buy", price: 124, quantity: 100, fee: 20, assetType: "equity" },
  { daysAgo: 40, ticker: "00878.TW", name: "國泰永續高股息", action: "buy", price: 21.8, quantity: 2_000, fee: 62, assetType: "etf" },
  { daysAgo: 20, ticker: "0050.TW", name: "元大台灣50", action: "buy", price: 181, quantity: 100, fee: 26, assetType: "etf" },
  { daysAgo: 14, ticker: "2330.TW", name: "台積電", action: "buy", price: 1_075, quantity: 20, fee: 31, assetType: "equity" },
  { daysAgo: 5, ticker: "2330.TW", name: "台積電", action: "sell", price: 1_120, quantity: 10, fee: 16, assetType: "equity" },
];

// Current market prices so holdings show live value & unrealized P/L.
const QUOTES: Array<{ symbol: string; nameZh: string; price: number; changePercent: number }> = [
  { symbol: "2330.TW", nameZh: "台積電", price: 1_140, changePercent: 0.86 },
  { symbol: "0050.TW", nameZh: "元大台灣50", price: 189.5, changePercent: 0.45 },
  { symbol: "2412.TW", nameZh: "中華電", price: 131.5, changePercent: -0.19 },
  { symbol: "00878.TW", nameZh: "國泰永續高股息", price: 23.6, changePercent: 0.21 },
];

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

  // 3. Investments (linked to the brokerage account)
  const brokerageId = idFor("凱基證券");
  const investmentRows: InvestmentDraft[] = INVESTMENTS.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    currency: "TWD",
    linkedAccountId: brokerageId,
    date: dtLocal(r.daysAgo, 10, 30),
    action: r.action,
    price: r.price,
    quantity: r.quantity,
    fee: r.fee,
    note: "",
    assetType: r.assetType,
  }));
  await repo.importInvestmentRecords(investmentRows);

  // 4. Current market quotes
  await repo.saveMarketQuotes(
    QUOTES.map((q) => ({
      symbol: q.symbol,
      name: q.nameZh,
      nameZh: q.nameZh,
      nameEn: null,
      currency: "TWD",
      price: q.price,
      change: +(q.price * q.changePercent / 100).toFixed(2),
      changePercent: q.changePercent,
      marketTime: new Date().toISOString(),
    })),
    "demo",
  );

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
    { accountId: idFor("國泰世華 數位帳戶"), amount: 72_000, currency: "TWD", category: "收入", subcategory: "薪資", merchant: "公司", entryType: "income", settlementStatus: "settled", note: "", frequency: "monthly", dayOfMonth: 5, nextRunDate: dateOnly(5), isActive: true },
    { accountId: idFor("國泰世華 數位帳戶"), amount: -18_500, currency: "TWD", category: "居住", subcategory: "房租", merchant: "房東", entryType: "expense", settlementStatus: "settled", note: "", frequency: "monthly", dayOfMonth: 1, nextRunDate: dateOnly(12), isActive: true },
    { accountId: idFor("玉山 Pi 拍錢包卡"), amount: -390, currency: "TWD", category: "娛樂", subcategory: "訂閱", merchant: "Netflix", entryType: "expense", settlementStatus: "settled", note: "", frequency: "monthly", dayOfMonth: 8, nextRunDate: dateOnly(8), isActive: true },
  ];
  for (const r of recurring) await repo.createRecurringTransaction(r);
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
const DEMO_BACKUP_KEY = "northstar.preDemoSnapshot.v1";

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
    localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(snapshot));
    localStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    // Couldn't safely preserve the real data → do not proceed.
    try { localStorage.removeItem(DEMO_BACKUP_KEY); } catch { /* ignore */ }
    throw new Error("無法安全保存你目前的資料，已取消進入示範模式（你的資料未被更動）。可先到設定手動匯出備份。");
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
  let raw: string | null = null;
  try { raw = localStorage.getItem(DEMO_BACKUP_KEY); } catch { raw = null; }

  if (raw) {
    const snapshot = JSON.parse(raw) as Parameters<FinanceRepository["importSnapshot"]>[0];
    await repo.importSnapshot(snapshot);
  } else {
    await clearAllData(repo);
  }

  try {
    localStorage.removeItem(DEMO_BACKUP_KEY);
    localStorage.removeItem(DEMO_FLAG_KEY);
  } catch { /* ignore */ }
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
    marketQuotes: [],
    settings,
    dailyFxRates: [],
    dailyPrices: [],
    financialGoals: [],
    manualPriceSnapshots: [],
  });
}
