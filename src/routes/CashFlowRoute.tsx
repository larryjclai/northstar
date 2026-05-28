import {
  ArrowsLeftRight,
  Calendar,
  CalendarPlus,
  Funnel,
  PencilSimple,
  Plus,
  Receipt,
  Tag,
  TrendDown,
  TrendUp,
  Trash,
  UploadSimple,
  X,
  ForkKnife,
  Car,
  GameController,
  MonitorPlay,
  House,
  Pill,
  GraduationCap,
  DotsThree,
  Briefcase,
  Money,
  Wrench,
  Gift,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { DateTimeField } from "../components/DateTimeField";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import { SegmentedControl } from "../components/SegmentedControl";
import { TickerSearchField } from "../components/TickerSearchField";
import { DatePicker } from "../components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { LedgerDraft, RecurringDraft, TransferDraft } from "../data/repositories";
import { evaluateAmountExpression, formatNumber, nowAsDatetimeLocal, todayInTimezone } from "../domain";
import type { LedgerTransaction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { CashFlowEntryDrawer } from "./CashFlowEntryDrawer";

type CashDrawerMode = "income" | "expense" | "transfer" | "receivable" | "payable";

const CHART_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
];

function CfMark({ label, color, size = 32 }: { label: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        background: color, color: "var(--ns-bg)",
        borderRadius: "var(--ns-r-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--ns-font-display)", fontWeight: 600,
        fontSize: size <= 28 ? 11 : 13, letterSpacing: "0.02em",
      }}
    >
      {label.slice(0, 2)}
    </div>
  );
}

function DailyBars({ data }: { data: Array<{ income: number; expense: number }> }) {
  if (!data.length) return null;
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const w = 1000;
  const h = 80;
  const gap = 3;
  const bw = (w - (data.length - 1) * gap) / data.length;
  const mid = h / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--ns-border)" />
      {data.map((d, i) => {
        const hIn = (d.income / max) * (h * 0.42);
        const hEx = (d.expense / max) * (h * 0.42);
        return (
          <g key={i}>
            {d.income > 0 && (
              <rect x={i * (bw + gap)} y={mid - hIn} width={bw} height={Math.max(hIn, 1)} fill="var(--ns-pos)" rx="1.5" />
            )}
            {d.expense > 0 && (
              <rect x={i * (bw + gap)} y={mid} width={bw} height={Math.max(hEx, 1)} fill="var(--ns-neg)" rx="1.5" />
            )}
            {d.income === 0 && d.expense === 0 && (
              <rect x={i * (bw + gap)} y={mid - 0.5} width={bw} height={1} fill="var(--ns-fg-dim)" rx="0.5" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function formatGroupDate(dateStr: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
  if (dateStr === today) return `今天 · ${label}`;
  if (dateStr === yesterday) return `昨天 · ${label}`;
  return label;
}

function makeEmptyLedger(timezone: string): LedgerDraft {
  return {
    accountId: "",
    date: nowAsDatetimeLocal(timezone),
    name: "",
    amount: 100,
    currency: "TWD",
    category: "餐飲",
    subcategory: "點心",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
  };
}

function makeEmptyTransfer(timezone: string): TransferDraft {
  return {
    date: nowAsDatetimeLocal(timezone),
    sourceAccountId: "",
    destinationAccountId: "",
    sourceCurrency: "TWD",
    destinationCurrency: "TWD",
    sourceAmount: 1000,
    destinationAmount: 1000,
    note: "",
  };
}

function makeEmptyRecurring(timezone: string): RecurringDraft {
  return {
    accountId: "",
    amount: -390,
    currency: "TWD",
    category: "餐飲",
    subcategory: "飲料",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "訂閱",
    dayOfMonth: 1,
    nextRunDate: todayInTimezone(timezone),
    isActive: true,
  };
}

export function CashFlowRoute() {
  const navigate = useNavigate();
  const { ledger, accounts, recurring, settings } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyLedger = useMemo(() => makeEmptyLedger(timezone), [timezone]);
  const emptyTransfer = useMemo(() => makeEmptyTransfer(timezone), [timezone]);
  const emptyRecurring = useMemo(() => makeEmptyRecurring(timezone), [timezone]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<CashDrawerMode>("expense");
  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState<"none" | "daily" | "weekly" | "monthly" | "yearly">("none");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  const [amountExpression, setAmountExpression] = useState(String(Math.abs(emptyLedger.amount)));
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [recurringForm, setRecurringForm] = useState<RecurringDraft>(emptyRecurring);
  const [accountSelectionMode, setAccountSelectionMode] = useState<"auto" | "manual">("auto");

  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");
  const [settleDraft, setSettleDraft] = useState<LedgerTransaction | null>(null);

  const [filterMonth, setFilterMonth] = useState(() => todayInTimezone(timezone).slice(0, 7));
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const appSettings = settings.data;
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const recurringRows = recurring.data ?? [];

  const categories = appSettings?.categories.length ? appSettings.categories : [];
  const categoryNames = categories.map((category) => category.name);
  const subcategories = categories.find((category) => category.name === ledgerForm.category)?.children ?? [];
  const recurringSubcategories = categories.find((category) => category.name === recurringForm.category)?.children ?? [];

  const merchants = appSettings?.merchants ?? [];
  const merchantPool = useMemo(() => uniqueClean([...merchants, ...ledgerRows.map((row) => row.merchant)]), [merchants, ledgerRows]);
  const merchantSuggestions = useMemo(() => buildMerchantSuggestions(merchantPool, ledgerForm.merchant), [merchantPool, ledgerForm.merchant]);
  const recurringMerchantSuggestions = useMemo(() => buildMerchantSuggestions(merchantPool, recurringForm.merchant), [merchantPool, recurringForm.merchant]);

  const accountName = (id: string) => accountRows.find((account) => account.id === id)?.name ?? id;
  const accountIdFor = (nameOrId: string) => accountRows.find((account) => account.id === nameOrId || account.name === nameOrId)?.id;
  const groupedRows = useMemo(() => groupLedgerRows(ledgerRows), [ledgerRows]);
  const availableAccountIds = useMemo(() => new Set(accountRows.map((account) => account.id)), [accountRows]);

  const createLedger = useRepositoryMutation((repository, input: LedgerDraft) => repository.createLedgerTransaction(input), ["ledger", "accounts"]);
  const updateLedger = useRepositoryMutation((repository, input: LedgerDraft & { id: string }) => repository.updateLedgerTransaction(input.id, input), ["ledger", "accounts"]);
  const deleteLedger = useRepositoryMutation((repository, id: string) => repository.deleteLedgerTransaction(id), ["ledger", "accounts"]);
  const createTransfer = useRepositoryMutation((repository, input: TransferDraft) => repository.createTransfer(input), ["ledger", "accounts"]);
  const importLedger = useRepositoryMutation((repository, input: LedgerDraft[]) => repository.importLedgerTransactions(input), ["ledger", "accounts"]);

  const createRecurring = useRepositoryMutation((repository, input: RecurringDraft) => repository.createRecurringTransaction(input), ["recurring"]);
  const deleteRecurring = useRepositoryMutation((repository, id: string) => repository.deleteRecurringTransaction(id), ["recurring"]);
  const postRecurring = useRepositoryMutation((repository, id: string) => repository.postRecurringTransaction(id), ["recurring", "ledger", "accounts"]);

  const rememberMerchants = useRepositoryMutation(async (repository, input: string[]) => {
    const nextNames = uniqueClean(input);
    if (nextNames.length === 0) return;
    const current = await repository.getAppSettings();
    const existing = new Set(current.merchants.map((merchant) => merchant.trim()).filter(Boolean));
    const additions = nextNames.filter((merchant) => !existing.has(merchant));
    if (additions.length === 0) return;
    await repository.updateAppSettings({ ...current, merchants: [...current.merchants, ...additions] });
  }, ["settings"]);

  const rememberCategories = useRepositoryMutation(async (repository, input: Array<{ category: string; subcategory: string }>) => {
    const nextItems = input
      .map((item) => ({ category: item.category.trim(), subcategory: item.subcategory.trim() }))
      .filter((item) => item.category);
    if (nextItems.length === 0) return;

    const current = await repository.getAppSettings();
    const nextCategories = current.categories.map((category) => ({ ...category, children: [...category.children] }));
    let changed = false;

    for (const item of nextItems) {
      let category = nextCategories.find((candidate) => candidate.name === item.category);
      if (!category) {
        category = { name: item.category, children: [] };
        nextCategories.push(category);
        changed = true;
      }
      if (item.subcategory && !category.children.includes(item.subcategory)) {
        category.children.push(item.subcategory);
        changed = true;
      }
    }

    if (!changed) return;
    await repository.updateAppSettings({ ...current, categories: nextCategories });
  }, ["settings"]);

  function rememberMerchantNames(names: string[]) {
    const nextNames = uniqueClean(names);
    if (nextNames.length === 0) return;
    void rememberMerchants.mutateAsync(nextNames).catch((error) => {
      console.warn("[cash-flow] failed to remember merchants", error);
    });
  }

  function syncAccountDefaults(accountId: string) {
    setAccountSelectionMode("manual");
    const account = accountRows.find((item) => item.id === accountId);
    if (account) setLedgerForm((current) => ({ ...current, accountId, currency: account.currency }));
  }

  function openCreate(mode: CashDrawerMode) {
    setDrawerMode(mode);
    setDrawerOpen(true);
    setEditingId(null);
    setMessage("");
    if (mode !== "transfer") {
      const isReceivable = mode === "receivable";
      const isPayable = mode === "payable";
      const entryType = mode === "income" || isReceivable ? "income" : "expense";
      setLedgerForm((current) => ({
        ...emptyLedger,
        date: nowAsDatetimeLocal(timezone),
        currency: appSettings?.primaryCurrency ?? current.currency,
        entryType,
        settlementStatus: isReceivable ? "receivable" : isPayable ? "payable" : "settled",
      }));
      setDrawerRecurringFreq("none");
      setAmountExpression(String(Math.abs(emptyLedger.amount)));
      setAccountSelectionMode("auto");
    } else {
      setTransferForm({ ...emptyTransfer, date: nowAsDatetimeLocal(timezone) });
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setTransferEditingIds(null);
    setMessage("");
  }

  useEffect(() => {
    if (!drawerOpen || drawerMode === "transfer" || editingId || accountSelectionMode !== "auto") return;
    const accountId = findLastUsedAccountIdForCategory(ledgerRows, availableAccountIds, {
      category: ledgerForm.category,
      subcategory: ledgerForm.subcategory,
      entryType: drawerMode === "income" ? "income" : "expense",
    });
    if (!accountId) return;
    const account = accountRows.find((item) => item.id === accountId);
    if (!account) return;

    setLedgerForm((current) => {
      if (current.accountId === accountId && current.currency === account.currency) return current;
      return { ...current, accountId, currency: account.currency };
    });
  }, [
    accountRows,
    accountSelectionMode,
    availableAccountIds,
    drawerMode,
    drawerOpen,
    editingId,
    ledgerForm.category,
    ledgerForm.subcategory,
    ledgerRows,
  ]);

  async function submitRecurring() {
    setMessage("");
    try {
      if (!recurringForm.accountId) throw new Error("請選擇帳戶。");
      await createRecurring.mutateAsync(recurringForm);
      rememberMerchantNames([recurringForm.merchant]);
      setRecurringForm({ ...emptyRecurring, currency: appSettings?.primaryCurrency ?? emptyRecurring.currency });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "週期事件儲存失敗。");
    }
  }

  async function submitSingle() {
    setMessage("");
    try {
      const amount = Math.abs(evaluateAmountExpression(amountExpression));
      const entryType: LedgerDraft["entryType"] = drawerMode === "income" ? "income" : "expense";
      const signedAmount = entryType === "expense" ? -amount : amount;
      const payload: LedgerDraft = {
        ...ledgerForm,
        entryType,
        amount: signedAmount,
        name: ledgerForm.name.trim(),
        category: ledgerForm.category.trim(),
        subcategory: ledgerForm.subcategory.trim(),
        merchant: ledgerForm.merchant.trim(),
      };
      if (!payload.accountId) throw new Error("請選擇帳戶。");
      if (editingId) {
        await updateLedger.mutateAsync({ ...payload, id: editingId });
      } else {
        await createLedger.mutateAsync(payload);
        if (drawerRecurringFreq !== "none") {
          const dateObj = new Date(payload.date);
          await createRecurring.mutateAsync({
            entryType: payload.entryType as "income" | "expense",
            category: payload.category,
            subcategory: payload.subcategory,
            merchant: payload.merchant,
            currency: payload.currency,
            amount: payload.amount,
            accountId: payload.accountId,
            settlementStatus: payload.settlementStatus ?? "settled",
            dayOfMonth: dateObj.getDate(),
            nextRunDate: payload.date.split("T")[0],
            isActive: true,
            note: payload.note,
          });
        }
      }
      await rememberCategories.mutateAsync([{ category: payload.category, subcategory: payload.subcategory }]);
      rememberMerchantNames([payload.merchant]);
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "收支儲存失敗。");
    }
  }

  async function submitTransfer() {
    setMessage("");
    try {
      if (!transferForm.sourceAccountId || !transferForm.destinationAccountId) throw new Error("請選擇來源和目標帳戶。");
      
      if (transferEditingIds) {
        for (const id of transferEditingIds) {
          await deleteLedger.mutateAsync(id);
        }
      }
      
      await createTransfer.mutateAsync(transferForm);
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轉帳儲存失敗。");
    }
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseLedgerCsv(await file.text(), accountIdFor));
    event.target.value = "";
  }

  function startEdit(row: LedgerTransaction) {
    const type = row.entryType ?? (row.amount >= 0 ? "income" : "expense");
    if (row.settlementStatus === "receivable") setDrawerMode("receivable");
    else if (row.settlementStatus === "payable") setDrawerMode("payable");
    else setDrawerMode(type);

    setEditingId(row.id);
    setLedgerForm({
      accountId: row.accountId,
      date: row.date,
      name: row.name,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      subcategory: row.subcategory,
      merchant: row.merchant,
      entryType: type,
      settlementStatus: row.settlementStatus ?? "settled",
      note: row.note,
    });
    setAccountSelectionMode("manual");
    setAmountExpression(String(Math.abs(row.amount)));
    setMessage("");
    setDrawerOpen(true);
  }

  const [transferEditingIds, setTransferEditingIds] = useState<string[] | null>(null);

  function startEditTransfer(rows: LedgerTransaction[]) {
    const expense = rows.find((r) => r.amount < 0);
    const income = rows.find((r) => r.amount > 0);
    if (!expense || !income) return;
    
    setTransferEditingIds([expense.id, income.id]);
    setTransferForm({
      sourceAccountId: expense.accountId,
      destinationAccountId: income.accountId,
      date: expense.date,
      sourceAmount: Math.abs(expense.amount),
      destinationAmount: income.amount,
      sourceCurrency: expense.currency,
      destinationCurrency: income.currency,
      note: expense.note || "",
    });
    setDrawerMode("transfer");
    setDrawerOpen(true);
  }

  async function handleSettleConfirm(accountId: string, date: string) {
    if (!settleDraft) return;
    try {
      // 1. Update original transaction to settled
      await updateLedger.mutateAsync({
        ...settleDraft,
        settlementStatus: "settled",
      });
      // 2. Create offsetting transaction
      const isReceivable = settleDraft.settlementStatus === "receivable";
      const newEntryType = isReceivable ? "income" : "expense";
      // Ensure positive for income, negative for expense
      const amount = isReceivable ? Math.abs(settleDraft.amount) : -Math.abs(settleDraft.amount);
      
      const newTransaction: LedgerDraft = {
        accountId,
        date,
        name: `結清：${settleDraft.name}`,
        amount,
        currency: settleDraft.currency,
        category: settleDraft.category,
        subcategory: settleDraft.subcategory,
        merchant: settleDraft.merchant,
        entryType: newEntryType,
        settlementStatus: "settled",
        note: "應收/應付帳款結清",
      };
      await createLedger.mutateAsync(newTransaction);
      setSettleDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "結清失敗。");
    }
  }

  const monthRows = useMemo(() => ledgerRows.filter((row) => {
    if (!row.date.startsWith(filterMonth)) return false;
    if (filterAccount !== "all" && row.accountId !== filterAccount) return false;
    if (filterCategory !== "all" && row.category !== filterCategory) return false;
    return true;
  }), [ledgerRows, filterMonth, filterAccount, filterCategory]);
  
  const monthIncome = monthRows.filter((row) => row.entryType === "income").reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const monthExpense = monthRows.filter((row) => row.entryType === "expense").reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const monthNet = monthIncome - monthExpense;
  const monthTransferCount = monthRows.filter((row) => row.entryType === "transfer").length;

  const topCategorySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of monthRows) {
      if (row.entryType !== "expense") continue;
      const key = row.subcategory ? `${row.category} / ${row.subcategory}` : row.category;
      map.set(key, (map.get(key) ?? 0) + Math.abs(row.amount));
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [monthRows]);

  const topMerchantSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of monthRows) {
      if (row.entryType !== "expense" || !row.merchant.trim()) continue;
      const key = row.merchant.trim();
      map.set(key, (map.get(key) ?? 0) + Math.abs(row.amount));
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [monthRows]);

  const dailyStats = useMemo(() => {
    const now = todayInTimezone(timezone);
    const year = parseInt(now.slice(0, 4));
    const month = parseInt(now.slice(5, 7));
    const daysInMonth = new Date(year, month, 0).getDate();
    const byDay = new Map<number, { income: number; expense: number }>();
    for (let i = 1; i <= daysInMonth; i++) {
      byDay.set(i, { income: 0, expense: 0 });
    }
    for (const row of monthRows) {
      if (row.entryType === "transfer") continue;
      const day = parseInt(row.date.slice(8, 10));
      const stats = byDay.get(day)!;
      if (row.entryType === "income") {
        stats.income += Math.max(0, row.amount);
      } else {
        stats.expense += Math.abs(row.amount);
      }
    }
    return Array.from({ length: daysInMonth }, (_, i) => byDay.get(i + 1)!);
  }, [monthRows, timezone]);

  const dateGroups = useMemo(() => {
    const byDate = new Map<string, typeof groupedRows>();
    for (const group of groupedRows) {
      const date = group.rows[0].date.slice(0, 10);
      byDate.set(date, [...(byDate.get(date) ?? []), group]);
    }
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [groupedRows]);

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>
            {new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long" })}
          </div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            現金流
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn" onClick={() => navigate({ to: "/cash-flow/categories" })}><Tag size={14} />分類</button>
          
          <DatePicker 
            value={filterMonth + "-01"} 
            onChange={(val) => setFilterMonth(val.slice(0, 7))} 
          />

          <Select value={filterAccount} onValueChange={(val) => setFilterAccount(val ?? "all")}>
            <SelectTrigger className="w-[140px] ns-btn" style={{ padding: "0 10px", height: "36px" }}>
              <SelectValue placeholder="所有帳戶">
                {filterAccount === "all" ? "所有帳戶" : accountRows.find(a => a.id === filterAccount)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有帳戶</SelectItem>
              {accountRows.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={(val) => setFilterCategory(val ?? "all")}>
            <SelectTrigger className="w-[140px] ns-btn" style={{ padding: "0 10px", height: "36px" }}>
              <SelectValue placeholder="所有類別">
                {filterCategory === "all" ? "所有類別" : filterCategory}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有類別</SelectItem>
              {categories.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <button className="ns-btn primary" onClick={() => openCreate("expense")}>
            <Plus size={14} />新增交易
          </button>
        </div>
      </div>

      {/* ── Top summary: two-up ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Net monthly card */}
        <div className="ns-card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 14 }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>本月淨額</div>
              <div
                className="ns-num-lg"
                style={{ color: monthNet >= 0 ? "var(--ns-pos)" : "var(--ns-neg)" }}
              >
                {monthNet >= 0 ? "+" : "−"}{formatNumber(Math.abs(monthNet))} TWD
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
              <div>
                <div className="muted">收入</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>{formatNumber(monthIncome)}</div>
              </div>
              <div>
                <div className="muted">支出</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>{formatNumber(monthExpense)}</div>
              </div>
              {monthIncome > 0 && (
                <div>
                  <div className="muted">儲蓄率</div>
                  <div className="num pos" style={{ fontSize: 18, fontWeight: 500 }}>
                    {Math.max(0, (monthNet / monthIncome) * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
          <DailyBars data={dailyStats} />
          <div className="dim mono" style={{ fontSize: 10.5, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span>1日</span><span>8日</span><span>15日</span><span>22日</span><span>月末</span>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="ns-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="ns-eyebrow">本月支出分類</div>
          </div>
          {topCategorySpend.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>本月尚無支出資料</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {topCategorySpend.map((r, i) => (
                <div
                  key={r.name}
                  style={{ display: "grid", gridTemplateColumns: "70px 1fr 80px", gap: 10, alignItems: "center", fontSize: 12.5 }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(r.amount / monthExpense) * 100}%`,
                        height: "100%",
                        background: CHART_COLORS[i % 5],
                        borderRadius: 99,
                      }}
                    />
                  </div>
                  <span className="num" style={{ textAlign: "right" }}>{formatNumber(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {topMerchantSpend.length > 0 && (
            <>
              <div className="ns-eyebrow" style={{ marginTop: 18, marginBottom: 10 }}>商家排行</div>
              <div style={{ display: "grid", gap: 8 }}>
                {topMerchantSpend.slice(0, 4).map((r) => (
                  <div key={r.name} style={{ display: "grid", gridTemplateColumns: "70px 1fr 80px", gap: 10, alignItems: "center", fontSize: 12.5 }}>
                    <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(r.amount / monthExpense) * 100}%`,
                          height: "100%",
                          background: "var(--ns-fg-dim)",
                          borderRadius: 99,
                        }}
                      />
                    </div>
                    <span className="num" style={{ textAlign: "right" }}>{formatNumber(r.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── CSV import preview ── */}
      {preview && (
        <div className="ns-card" style={{ marginBottom: 16, padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
          </div>
          {preview.invalid.map((item) => (
            <div key={item.row} style={{ color: "var(--ns-neg)", fontSize: 13 }}>Row {item.row}: {item.reason}</div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="ns-btn primary"
              onClick={async () => {
                const rows = preview.valid.map((item) => item.value);
                await importLedger.mutateAsync(rows);
                rememberMerchantNames(rows.map((row) => row.merchant));
                setPreview(null);
              }}
            >
              確認匯入
            </button>
            <button className="ns-btn" onClick={() => setPreview(null)}>取消</button>
          </div>
        </div>
      )}

      {/* ── Status message ── */}
      {message && <div style={{ marginBottom: 12 }}><StatusText>{message}</StatusText></div>}

      {/* ── Transaction list grouped by date ── */}
      <div className="ns-card" style={{ padding: 0 }}>
        {dateGroups.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Receipt size={24} weight="duotone" />}
              title="還沒有記帳資料"
              description="點擊右上角「記一筆」新增收支，或匯入 CSV 歷史資料。"
              action={
                <button className="ns-btn primary" onClick={() => openCreate("expense")}>
                  <Receipt size={16} />新增支出
                </button>
              }
            />
          </div>
        ) : (
          dateGroups.map(([date, groups]) => {
            const dayNet = groups.reduce((s, g) => s + g.amount, 0);
            return (
              <div key={date}>
                <div
                  style={{
                    padding: "14px 22px",
                    background: "var(--ns-bg-elev)",
                    borderBottom: "1px solid var(--ns-border)",
                    borderTop: "1px solid var(--ns-border)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span className="ns-eyebrow">{formatGroupDate(date)}</span>
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    {dayNet >= 0 ? "+" : "−"}{formatNumber(Math.abs(dayNet))} TWD
                  </span>
                </div>
                {groups.map((group, gi) => {
                  const isIncome = group.typeLabel === "收入";
                  const isTransfer = group.typeLabel === "轉帳";
                  const initials = isTransfer
                    ? "↔"
                    : (group.title || "?").replace(/\s+/g, "").slice(0, 2).toUpperCase();
                  const color = isTransfer
                    ? "var(--ns-fg-muted)"
                    : isIncome
                    ? "var(--ns-chart-1)"
                    : CHART_COLORS[1 + (gi % 4)];
                  return (
                    <div key={group.id} className="ns-row" style={{ gap: 12 }}>
                      <CfMark label={initials} color={color} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14, fontWeight: 500,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {group.title}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>{group.subtitle}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isTransfer ? (
                          <span className="ns-pill">↔ 轉帳</span>
                        ) : (
                          <div
                            className={"num " + (isIncome ? "pos" : "")}
                            style={{ fontSize: 14.5, minWidth: 100, textAlign: "right" }}
                          >
                            {isIncome ? "+" : "−"}{formatNumber(Math.abs(group.amount))} {group.currency}
                          </div>
                        )}
                        {group.rows.length === 1 && !isTransfer && (
                          <button
                            className="ns-btn ghost"
                            style={{ padding: 6 }}
                            onClick={() => startEdit(group.rows[0])}
                            title="編輯"
                          >
                            <PencilSimple size={13} />
                          </button>
                        )}
                        {isTransfer && group.rows.length === 2 && (
                          <button
                            className="ns-btn ghost"
                            style={{ padding: 6 }}
                            onClick={() => startEditTransfer(group.rows)}
                            title="編輯"
                          >
                            <PencilSimple size={13} />
                          </button>
                        )}
                        {group.rows.length === 1 && !isTransfer && (group.rows[0].settlementStatus === "receivable" || group.rows[0].settlementStatus === "payable") && (
                          <button
                            className="ns-btn primary"
                            style={{ padding: "4px 8px", fontSize: 12 }}
                            onClick={() => setSettleDraft(group.rows[0])}
                            title="結清"
                          >
                            結清
                          </button>
                        )}
                        <button
                          className="ns-btn ghost"
                          style={{ padding: 6, color: "var(--ns-neg)" }}
                          onClick={async () => {
                            for (const row of group.rows) await deleteLedger.mutateAsync(row.id);
                          }}
                          title="刪除"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* ── Recurring events (collapsed by default) ── */}
      <details
        className="ns-card"
        style={{ marginTop: 16, padding: 0, cursor: "pointer" }}
      >
        <summary
          style={{
            padding: "14px 22px", cursor: "pointer", userSelect: "none",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500,
          }}
        >
          <span>週期事件（每月固定收支）</span>
          <span className="ns-pill">{recurringRows.length} 個</span>
        </summary>
        <div style={{ borderTop: "1px solid var(--ns-border)", padding: "20px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20 }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>新增週期事件</div>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="帳戶">
                  <SelectInput value={recurringForm.accountId} onChange={(event) => {
                    const account = accountRows.find((item) => item.id === event.target.value);
                    setRecurringForm({ ...recurringForm, accountId: event.target.value, currency: account?.currency ?? recurringForm.currency });
                  }}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </SelectInput>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="類型">
                    <SelectInput value={recurringForm.entryType} onChange={(event) => {
                      const entryType = event.target.value as RecurringDraft["entryType"];
                      const amount = Math.abs(recurringForm.amount);
                      setRecurringForm({ ...recurringForm, entryType, amount: entryType === "expense" ? -amount : amount });
                    }}>
                      <option value="expense">支出</option>
                      <option value="income">收入</option>
                    </SelectInput>
                  </Field>
                  <Field label="金額">
                    <TextInput type="number" value={Math.abs(recurringForm.amount)} onChange={(event) => {
                      const amount = Math.abs(Number(event.target.value));
                      setRecurringForm({ ...recurringForm, amount: recurringForm.entryType === "expense" ? -amount : amount });
                    }} />
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="分類">
                    <SelectInput value={recurringForm.category} onChange={(event) => {
                      const category = event.target.value;
                      const firstChild = categories.find((item) => item.name === category)?.children[0] ?? "";
                      setRecurringForm({ ...recurringForm, category, subcategory: firstChild });
                    }}>
                      {categoryNames.map((category) => <option key={category} value={category}>{category}</option>)}
                    </SelectInput>
                  </Field>
                  <Field label="子分類">
                    <SelectInput value={recurringForm.subcategory} onChange={(event) => setRecurringForm({ ...recurringForm, subcategory: event.target.value })}>
                      <option value="">未分類</option>
                      {recurringSubcategories.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
                    </SelectInput>
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="每月日期">
                    <TextInput type="number" min={1} max={31} value={recurringForm.dayOfMonth} onChange={(event) => setRecurringForm({ ...recurringForm, dayOfMonth: Number(event.target.value) })} />
                  </Field>
                  <Field label="下次日期">
                    <TextInput type="date" value={recurringForm.nextRunDate} onChange={(event) => setRecurringForm({ ...recurringForm, nextRunDate: event.target.value })} />
                  </Field>
                </div>
                <Field label="商家">
                  <MerchantAutocomplete
                    value={recurringForm.merchant}
                    suggestions={recurringMerchantSuggestions}
                    onChange={(next) => setRecurringForm({ ...recurringForm, merchant: next })}
                    placeholder="例如 Spotify"
                  />
                </Field>
                <Field label="備註">
                  <TextInput value={recurringForm.note} onChange={(event) => setRecurringForm({ ...recurringForm, note: event.target.value })} />
                </Field>
                <button className="ns-btn primary" onClick={submitRecurring}>
                  <CalendarPlus size={16} />建立週期事件
                </button>
              </div>
            </div>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>已建立的週期事件</div>
              {recurringRows.length === 0 ? (
                <EmptyState
                  icon={<CalendarPlus size={24} weight="duotone" />}
                  title="尚未建立週期事件"
                  description="你可以建立每月固定扣款或固定收入，降低重複輸入。"
                />
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {recurringRows.map((row) => (
                    <div
                      key={row.id}
                      className="ns-row"
                      style={{ gap: 12, borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          {row.category}{row.subcategory ? ` / ${row.subcategory}` : ""}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {row.merchant || accountName(row.accountId)} · 下次 {row.nextRunDate} · 每月 {row.dayOfMonth} 日
                        </div>
                      </div>
                      <div className="num" style={{ fontSize: 14, fontWeight: 500 }}>
                        {row.entryType === "income" ? "+" : "−"}{formatNumber(Math.abs(row.amount))} {row.currency}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ns-btn" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => postRecurring.mutate(row.id)}>產生本期</button>
                        <button className="ns-btn ghost" style={{ padding: 6, color: "var(--ns-neg)" }} onClick={() => deleteRecurring.mutate(row.id)}>
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* Settlement Modal */}
      {settleDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={() => setSettleDraft(null)}>
          <div className="ns-card" style={{ width: 400, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>結清帳款</h3>
            <div style={{ marginBottom: 16, fontSize: 14 }}>
              你要結清 <strong style={{ color: settleDraft.settlementStatus === "receivable" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                {settleDraft.settlementStatus === "receivable" ? "應收" : "應付"} {formatNumber(Math.abs(settleDraft.amount))} {settleDraft.currency}
              </strong> ({settleDraft.name})？<br/>
              系統將會建立一筆對應的{settleDraft.settlementStatus === "receivable" ? "收入" : "支出"}。
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const accountId = formData.get("accountId") as string;
              const date = formData.get("date") as string;
              if (accountId && date) handleSettleConfirm(accountId, date);
            }}>
              <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
                <Field label="結清入帳帳戶">
                  <SelectInput name="accountId" defaultValue={settleDraft.accountId}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="結清日期">
                  <TextInput name="date" type="date" defaultValue={todayInTimezone(timezone)} required />
                </Field>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" className="ns-btn" onClick={() => setSettleDraft(null)}>取消</button>
                <button type="submit" className="ns-btn primary">確認結清</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CashFlowEntryDrawer
        open={drawerOpen}
        mode={drawerMode}
        onClose={closeDrawer}
        onModeChange={(next) => {
          setDrawerMode(next);
          if (next !== "transfer") {
            const isReceivable = next === "receivable";
            const isPayable = next === "payable";
            const entryType: LedgerDraft["entryType"] = next === "income" || isReceivable ? "income" : "expense";
            setLedgerForm((current) => ({
              ...current,
              entryType,
              settlementStatus: isReceivable ? "receivable" : isPayable ? "payable" : "settled",
            }));
          }
        }}
        editing={Boolean(editingId)}
        drawerRecurringFreq={drawerRecurringFreq}
        setDrawerRecurringFreq={setDrawerRecurringFreq}
        ledgerForm={ledgerForm}
        setLedgerForm={setLedgerForm}
        amountExpression={amountExpression}
        setAmountExpression={setAmountExpression}
        transferForm={transferForm}
        setTransferForm={setTransferForm}
        merchantSuggestions={merchantSuggestions}
        categories={categoryNames}
        subcategories={subcategories}
        accountRows={accountRows}
        onAccountSelected={syncAccountDefaults}
        onSubmitSingle={submitSingle}
        onSubmitTransfer={submitTransfer}
        message={message}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const color = tone === "positive"
    ? "var(--ns-positive)"
    : tone === "negative"
      ? "var(--ns-negative)"
      : "var(--ns-text)";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--ns-panel-border)", background: "var(--ns-panel-surface)", boxShadow: "var(--ns-shadow)" }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

function DashboardListCard({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: Array<{ name: string; amount: number }>;
  emptyText: string;
}) {
  const max = rows[0]?.amount ?? 1;
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--ns-panel-border)", background: "var(--ns-panel-surface)", boxShadow: "var(--ns-shadow)" }}>
      <div className="mb-3 text-sm font-semibold tracking-wide">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{row.name}</span>
                <span className="tabular" style={{ color: "var(--ns-muted)" }}>{formatNumber(row.amount)}</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(8, (row.amount / max) * 100)}%`, background: "var(--ns-accent)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function groupLedgerRows(rows: LedgerTransaction[]) {
  const byGroup = new Map<string, LedgerTransaction[]>();
  const singles: LedgerTransaction[][] = [];
  for (const row of rows) {
    if (!row.groupId) singles.push([row]);
    else byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row]);
  }

  return [...singles, ...byGroup.values()]
    .map((group) => {
      const first = group[0];
      const isTransfer = group.length === 2 && group.some((row) => row.amount < 0) && group.some((row) => row.amount > 0);
      const amount = isTransfer ? Math.abs(group.find((row) => row.amount < 0)?.amount ?? 0) : group.reduce((sum, row) => sum + row.amount, 0);
      return {
        id: first.groupId ?? first.id,
        rows: group,
        title: isTransfer ? "轉帳" : first.name || `${first.category}${first.subcategory ? ` / ${first.subcategory}` : ""}`,
        subtitle: isTransfer
          ? [
            `${group[0].currency} → ${group[1].currency}`,
            formatRecordTime(first.date),
            first.note || "無備註"
          ].filter(Boolean).join(" · ")
          : [
            settlementLabel(first.settlementStatus),
            formatRecordTime(first.date),
            `${first.category}${first.subcategory ? ` / ${first.subcategory}` : ""}`,
            first.merchant,
            first.note || "無備註",
          ].filter(Boolean).join(" · "),
        amount,
        currency: isTransfer ? group[0].currency : first.currency,
        typeLabel: isTransfer ? "轉帳" : first.entryType === "income" ? "收入" : "支出",
      };
    })
    .sort((a, b) => b.rows[0].date.localeCompare(a.rows[0].date));
}

function settlementLabel(status: LedgerTransaction["settlementStatus"]) {
  if (status === "receivable") return "應收";
  if (status === "payable") return "應付";
  return "已收付";
}

function formatRecordTime(value: string) {
  if (!value.includes("T")) return value;
  return value.replace("T", " ");
}

function MerchantAutocomplete({
  value,
  suggestions,
  onChange,
  placeholder,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const showPanel = open && suggestions.length > 0;

  return (
    <div className="relative">
      <TextInput
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!showPanel) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
            return;
          }
          if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            onChange(suggestions[activeIndex]);
            setOpen(false);
          }
        }}
        placeholder={placeholder}
      />
      {showPanel ? (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)", boxShadow: "var(--ns-shadow-strong)" }}>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(suggestion);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm transition"
              style={{ background: index === activeIndex ? "var(--ns-accent-soft)" : "transparent" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function uniqueClean(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildMerchantSuggestions(merchants: string[], query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return merchants.slice(0, 12);

  return merchants
    .map((merchant, index) => ({ merchant, index, score: merchantMatchScore(merchant, normalizedQuery) }))
    .filter((item) => item.score > -1)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .map((item) => item.merchant);
}

function merchantMatchScore(rawMerchant: string, normalizedQuery: string) {
  const merchant = normalizeText(rawMerchant);
  if (!merchant) return -1;
  if (merchant === normalizedQuery) return 300;
  if (merchant.startsWith(normalizedQuery)) return 200;

  const tokenHit = merchant.split(/[\s\-_.]+/).some((token) => token.startsWith(normalizedQuery));
  if (tokenHit) return 120;
  if (merchant.includes(normalizedQuery)) return 80;
  return -1;
}

function findLastUsedAccountIdForCategory(
  rows: LedgerTransaction[],
  availableAccountIds: Set<string>,
  target: Pick<LedgerDraft, "category" | "subcategory" | "entryType">,
) {
  const category = target.category.trim();
  if (!category) return "";
  const subcategory = target.subcategory.trim();

  const rankedRows = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const exact = rankedRows.find((row) =>
    row.entryType === target.entryType &&
    row.category.trim() === category &&
    row.subcategory.trim() === subcategory &&
    availableAccountIds.has(row.accountId),
  );
  if (exact) return exact.accountId;

  const byCategory = rankedRows.find((row) =>
    row.entryType === target.entryType &&
    row.category.trim() === category &&
    availableAccountIds.has(row.accountId),
  );
  return byCategory?.accountId ?? "";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}
