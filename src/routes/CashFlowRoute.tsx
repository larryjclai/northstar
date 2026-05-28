import {
  ArrowsLeftRight,
  CalendarPlus,
  PencilSimple,
  Plus,
  Receipt,
  TrendDown,
  TrendUp,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { DateTimeField } from "../components/DateTimeField";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { LedgerDraft, RecurringDraft, TransferDraft } from "../data/repositories";
import { evaluateAmountExpression, formatNumber, nowAsDatetimeLocal, todayInTimezone } from "../domain";
import type { LedgerTransaction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

type CashDrawerMode = "income" | "expense" | "transfer";

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
  const { accounts, ledger, recurring, settings } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyLedger = useMemo(() => makeEmptyLedger(timezone), [timezone]);
  const emptyTransfer = useMemo(() => makeEmptyTransfer(timezone), [timezone]);
  const emptyRecurring = useMemo(() => makeEmptyRecurring(timezone), [timezone]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<CashDrawerMode>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  const [amountExpression, setAmountExpression] = useState(String(Math.abs(emptyLedger.amount)));
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [recurringForm, setRecurringForm] = useState<RecurringDraft>(emptyRecurring);
  const [accountSelectionMode, setAccountSelectionMode] = useState<"auto" | "manual">("auto");

  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");

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
      setLedgerForm((current) => ({
        ...emptyLedger,
        date: nowAsDatetimeLocal(timezone),
        currency: appSettings?.primaryCurrency ?? current.currency,
        entryType: mode === "income" ? "income" : "expense",
        settlementStatus: "settled",
      }));
      setAmountExpression(String(Math.abs(emptyLedger.amount)));
      setAccountSelectionMode("auto");
    } else {
      setTransferForm({ ...emptyTransfer, date: nowAsDatetimeLocal(timezone) });
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
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
      if (editingId) await updateLedger.mutateAsync({ ...payload, id: editingId });
      else await createLedger.mutateAsync(payload);
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
    setDrawerMode(row.entryType === "income" ? "income" : "expense");
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
      entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
      settlementStatus: row.settlementStatus ?? "settled",
      note: row.note,
    });
    setAccountSelectionMode("manual");
    setAmountExpression(String(Math.abs(row.amount)));
    setMessage("");
    setDrawerOpen(true);
  }

  const monthKey = todayInTimezone(timezone).slice(0, 7);
  const monthRows = useMemo(() => ledgerRows.filter((row) => row.date.startsWith(monthKey)), [ledgerRows, monthKey]);
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
          <button className="ns-btn" onClick={() => openCreate("income")}><TrendUp size={14} />收入</button>
          <button className="ns-btn" onClick={() => openCreate("expense")}><TrendDown size={14} />支出</button>
          <button className="ns-btn" onClick={() => openCreate("transfer")}><ArrowsLeftRight size={14} />轉帳</button>
          <button className="ns-btn" onClick={() => downloadCsv("northstar-ledger.csv", exportLedgerCsv(ledgerRows, accountName))}>
            匯出 CSV
          </button>
          <label style={{ display: "inline-flex" }}>
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={handleCsv} />
            <span className="ns-btn" style={{ cursor: "pointer" }}><UploadSimple size={14} />匯入</span>
          </label>
          <button className="ns-btn primary" onClick={() => openCreate("expense")}>
            <Plus size={14} />記一筆
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
                        width: `${(r.amount / topCategorySpend[0].amount) * 100}%`,
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
                  <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{r.name}</span>
                    <span className="num">{formatNumber(r.amount)}</span>
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

      <CashFlowEntryDrawer
        open={drawerOpen}
        mode={drawerMode}
        onClose={closeDrawer}
        onModeChange={(next) => {
          setDrawerMode(next);
          if (next !== "transfer") {
            const entryType: LedgerDraft["entryType"] = next === "income" ? "income" : "expense";
            setLedgerForm((current) => ({
              ...current,
              entryType,
              settlementStatus:
                current.settlementStatus === "receivable" || current.settlementStatus === "payable"
                  ? (entryType === "income" ? "receivable" : "payable")
                  : "settled",
            }));
          }
        }}
        editing={Boolean(editingId)}
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

function CashFlowEntryDrawer({
  open,
  mode,
  onClose,
  onModeChange,
  editing,
  ledgerForm,
  setLedgerForm,
  amountExpression,
  setAmountExpression,
  transferForm,
  setTransferForm,
  merchantSuggestions,
  categories,
  subcategories,
  accountRows,
  onAccountSelected,
  onSubmitSingle,
  onSubmitTransfer,
  message,
}: {
  open: boolean;
  mode: CashDrawerMode;
  onClose: () => void;
  onModeChange: (mode: CashDrawerMode) => void;
  editing: boolean;
  ledgerForm: LedgerDraft;
  setLedgerForm: (value: LedgerDraft) => void;
  amountExpression: string;
  setAmountExpression: (value: string) => void;
  transferForm: TransferDraft;
  setTransferForm: (value: TransferDraft) => void;
  merchantSuggestions: string[];
  categories: string[];
  subcategories: string[];
  accountRows: Array<{ id: string; name: string; currency: string }>;
  onAccountSelected: (id: string) => void;
  onSubmitSingle: () => void;
  onSubmitTransfer: () => void;
  message: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const settledLabel = mode === "income" ? "已收款" : "已付款";

  return (
    <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose}>
      <div className="absolute inset-y-0 right-0 flex h-full w-full sm:w-[680px] lg:w-[740px]" onClick={(event) => event.stopPropagation()}>
        <div className="h-full w-full border-l shadow-2xl animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]" style={{ background: "var(--ns-panel-bg)", borderColor: "var(--ns-panel-border)" }}>
          <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--ns-panel-border)" }}>
            <div>
              <h2 className="text-lg font-semibold">{editing ? "編輯收支" : "新增收支"}</h2>
              <p className="text-xs" style={{ color: "var(--ns-muted)" }}>右側抽屜快速記錄收入、支出與轉帳。</p>
            </div>
            <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-md outline-none transition hover:opacity-70" aria-label="關閉">
              <X size={18} />
            </button>
          </header>

          <div className="px-5 pt-4">
            <SegmentedControl
              value={mode}
              onChange={onModeChange}
              options={[
                { value: "income", label: "收入", icon: <TrendUp size={16} /> },
                { value: "expense", label: "支出", icon: <TrendDown size={16} /> },
                { value: "transfer", label: "轉帳", icon: <ArrowsLeftRight size={16} /> },
              ]}
            />
          </div>

          <div className="h-[calc(100%-120px)] overflow-y-auto px-5 pb-6 pt-4">
            {mode === "transfer" ? (
              <div className="grid gap-3">
                <Field label="來源帳戶">
                  <SelectInput value={transferForm.sourceAccountId} onChange={(event) => {
                    const account = accountRows.find((item) => item.id === event.target.value);
                    setTransferForm({ ...transferForm, sourceAccountId: event.target.value, sourceCurrency: account?.currency ?? transferForm.sourceCurrency });
                  }}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="目標帳戶">
                  <SelectInput value={transferForm.destinationAccountId} onChange={(event) => {
                    const account = accountRows.find((item) => item.id === event.target.value);
                    setTransferForm({ ...transferForm, destinationAccountId: event.target.value, destinationCurrency: account?.currency ?? transferForm.destinationCurrency });
                  }}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </SelectInput>
                </Field>
                <DateTimeField label="時間" value={transferForm.date} onChange={(value) => setTransferForm({ ...transferForm, date: value })} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={`來源金額 ${transferForm.sourceCurrency}`}><TextInput type="number" value={transferForm.sourceAmount} onChange={(event) => setTransferForm({ ...transferForm, sourceAmount: Number(event.target.value) })} /></Field>
                  <Field label={`目標金額 ${transferForm.destinationCurrency}`}><TextInput type="number" value={transferForm.destinationAmount ?? ""} onChange={(event) => setTransferForm({ ...transferForm, destinationAmount: Number(event.target.value) })} /></Field>
                </div>
                <Field label="備註"><TextInput value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} /></Field>
                {message ? <StatusText>{message}</StatusText> : null}
                <div className="flex gap-2">
                  <ActionButton onClick={onSubmitTransfer}>建立轉帳</ActionButton>
                  <ActionButton variant="secondary" onClick={onClose}>取消</ActionButton>
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <Field label="名稱">
                  <TextInput value={ledgerForm.name} onChange={(event) => setLedgerForm({ ...ledgerForm, name: event.target.value })} placeholder="例如 晚餐、咖啡、股利" className="py-3 text-base font-semibold" />
                </Field>

                <Field label="商家">
                  <MerchantAutocomplete value={ledgerForm.merchant} suggestions={merchantSuggestions} onChange={(next) => setLedgerForm({ ...ledgerForm, merchant: next })} placeholder="例如 7-ELEVEN、Lyft" />
                </Field>

                <Field label="金額 / 算式">
                  <TextInput value={amountExpression} onChange={(event) => setAmountExpression(event.target.value)} placeholder="120+85" inputMode="decimal" className="text-right text-lg font-semibold tabular" />
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="幣別">
                    <TextInput value={ledgerForm.currency} onChange={(event) => setLedgerForm({ ...ledgerForm, currency: event.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="狀態">
                    <SelectInput value={ledgerForm.settlementStatus} onChange={(event) => setLedgerForm({ ...ledgerForm, settlementStatus: event.target.value as LedgerDraft["settlementStatus"] })}>
                      <option value="settled">{settledLabel}</option>
                      {mode === "income" ? <option value="receivable">應收帳款</option> : <option value="payable">應付帳款</option>}
                    </SelectInput>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="分類">
                    <TextInput list="cashflow-categories" value={ledgerForm.category} onChange={(event) => setLedgerForm({ ...ledgerForm, category: event.target.value })} placeholder="選擇或輸入分類" />
                  </Field>
                  <Field label="子分類">
                    <TextInput list="cashflow-subcategories" value={ledgerForm.subcategory} onChange={(event) => setLedgerForm({ ...ledgerForm, subcategory: event.target.value })} placeholder="未分類" />
                  </Field>
                </div>

                <Field label="帳戶">
                  <SelectInput value={ledgerForm.accountId} onChange={(event) => onAccountSelected(event.target.value)}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </SelectInput>
                </Field>

                <DateTimeField label="日期 + 時間" value={ledgerForm.date} onChange={(value) => setLedgerForm({ ...ledgerForm, date: value })} />

                <Field label="備註">
                  <TextAreaInput value={ledgerForm.note} onChange={(event) => setLedgerForm({ ...ledgerForm, note: event.target.value })} rows={3} placeholder="可留空" />
                </Field>

                <datalist id="cashflow-categories">
                  {categories.map((category) => <option key={category} value={category} />)}
                </datalist>
                <datalist id="cashflow-subcategories">
                  {subcategories.map((subcategory) => <option key={subcategory} value={subcategory} />)}
                </datalist>

                {message ? <StatusText>{message}</StatusText> : null}
                <div className="flex gap-2">
                  <ActionButton onClick={onSubmitSingle}>{editing ? "儲存" : mode === "income" ? "新增收入" : "新增支出"}</ActionButton>
                  <ActionButton variant="secondary" onClick={onClose}>取消</ActionButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
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
        title: isTransfer ? "轉帳 / 換匯" : first.name || `${first.category}${first.subcategory ? ` / ${first.subcategory}` : ""}`,
        subtitle: isTransfer
          ? `${group[0].currency} → ${group[1].currency} · ${formatRecordTime(first.date)}`
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
