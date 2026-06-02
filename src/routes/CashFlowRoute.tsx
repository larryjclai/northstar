import {
  ArrowsLeftRight,
  CalendarBlank,
  Check,
  DownloadSimple,
  Plus,
  Receipt,
  Tag,
  Trash,
  UploadSimple,
  X,
  Funnel,
  CaretDown,
  CaretRight,
  PencilSimple,
  Gear,
  MagnifyingGlass,
  Sparkle,
} from "@phosphor-icons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, Cell, PieChart, Pie, XAxis } from "recharts";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";
import { CategoriesTab } from "./CategoriesTab";
import { MerchantsTab } from "./MerchantsTab";
import { RecurringRulesTab } from "./RecurringRulesTab";
import { MonthPicker } from "../components/ui/month-picker";
import { SegmentedControl } from "../components/SegmentedControl";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { DatePicker } from "../components/ui/date-picker";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { useToast } from "../components/Toast";
import type { LedgerDraft, TransferDraft } from "../data/repositories";
import { buildLedgerSuggestions, buildMerchantCategoryMap, evaluateAmountExpression, formatNumber, nowAsDatetimeLocal, recurringFrequencyLabels, todayInTimezone } from "../domain";
import { convertCurrency } from "../domain/currency";
import type { LedgerTransaction, RecurringTransaction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { useNumericField } from "../hooks/useNumericField";

/**
 * Transaction types surfaced in the entry drawer. `ar` / `ap` (應收 / 應付)
 * are persisted as income / expense rows whose `settlementStatus` is
 * receivable / payable, matching the existing data model. The "對象" is stored
 * in `merchant`, and any due date is appended to `note` until dedicated
 * counterparty / dueDate fields land in the data layer.
 */
type CashType = "expense" | "income" | "transfer" | "ar" | "ap";

const TYPE_META: Record<CashType, { label: string; color: string; sign: string; eyebrow: string }> = {
  expense: { label: "支出", color: "var(--ns-neg)", sign: "−", eyebrow: "支出金額" },
  income: { label: "收入", color: "var(--ns-pos)", sign: "+", eyebrow: "收入金額" },
  transfer: { label: "轉帳", color: "var(--ns-accent)", sign: "", eyebrow: "轉帳金額" },
  ar: { label: "應收帳款", color: "var(--ns-chart-3)", sign: "+", eyebrow: "應收金額" },
  ap: { label: "應付帳款", color: "var(--ns-chart-5)", sign: "−", eyebrow: "應付金額" },
};

const TYPE_ORDER: CashType[] = ["expense", "income", "transfer", "ar", "ap"];

function entryTypeFor(type: CashType): LedgerDraft["entryType"] {
  return type === "income" || type === "ar" ? "income" : "expense";
}
function settlementFor(type: CashType): LedgerDraft["settlementStatus"] {
  if (type === "ar") return "receivable";
  if (type === "ap") return "payable";
  return "settled";
}

function makeEmptyLedger(timezone: string): LedgerDraft {
  return {
    accountId: "",
    date: nowAsDatetimeLocal(timezone),
    name: "",
    amount: 0,
    currency: "TWD",
    category: "",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    feeAmount: 0,
  };
}

function makeEmptyTransfer(timezone: string): TransferDraft {
  return {
    date: nowAsDatetimeLocal(timezone),
    sourceAccountId: "",
    destinationAccountId: "",
    sourceCurrency: "TWD",
    destinationCurrency: "TWD",
    sourceAmount: 0,
    destinationAmount: 0,
    note: "",
    feeAmount: 0,
  };
}

export function CashFlowRoute() {
  const { accounts, ledger, recurring, settings, dailyFxRates } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyLedger = useMemo(() => makeEmptyLedger(timezone), [timezone]);
  const emptyTransfer = useMemo(() => makeEmptyTransfer(timezone), [timezone]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<CashType>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurringRuleId, setEditingRecurringRuleId] = useState<string | null>(null);
  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState("none");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  const [amountExpression, setAmountExpression] = useState(String(Math.abs(emptyLedger.amount)));
  const [entryDisplayCurrency, setEntryDisplayCurrency] = useState(emptyLedger.currency);
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [counterparty, setCounterparty] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");
  const toast = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => todayInTimezone(timezone).slice(0, 7));
  // `?account=<id>` deep-link from the Accounts page pre-selects that account.
  const { account: accountParam } = useSearch({ strict: false }) as { account?: string };
  const [selectedAccount, setSelectedAccount] = useState(accountParam ?? "all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "categories" | "merchants" | "recurring">("overview");
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const navigate = useNavigate();

  // Follow the deep-link param if it changes after mount (e.g. clicking a
  // different account while the ledger is already open).
  useEffect(() => {
    if (accountParam) setSelectedAccount(accountParam);
  }, [accountParam]);

  const appSettings = settings.data;
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const recurringRows = recurring.data ?? [];
  const fxHistory = dailyFxRates.data ?? [];
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const toPrimary = useCallback((row: LedgerTransaction, amount = row.amount) =>
    convertCurrency(amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }),
  [appSettings, fxHistory, primaryCurrency]);

  const categories = appSettings?.categories.length ? appSettings.categories : [];
  const categoryNames = categories.map((category) => category.name);
  const subcategories = categories.find((category) => category.name === ledgerForm.category)?.children ?? [];

  const merchants = appSettings?.merchants ?? [];
  const merchantPool = useMemo(
    () => uniqueClean([...merchants, ...ledgerRows.map((row) => row.merchant)]),
    [merchants, ledgerRows],
  );
  const merchantSuggestions = useMemo(
    () => buildMerchantSuggestions(merchantPool, ledgerForm.merchant),
    [merchantPool, ledgerForm.merchant],
  );
  // Each merchant's most-used (category, subcategory) from expense history, so
  // picking a merchant can auto-fill its usual category.
  const merchantCategoryMap = useMemo(() => buildMerchantCategoryMap(ledgerRows), [ledgerRows]);
  const categoryForMerchant = (merchant: string) => merchantCategoryMap.get(merchant.trim()) ?? null;

  // Once a category is chosen, suggest the merchants and accounts most often
  // used with it (from settled expense history). Drives the progressive flow:
  // pick 分類 → see 建議商家 chips + a suggested 帳戶.
  const categorySuggestions = useMemo(
    () => buildLedgerSuggestions(ledgerRows, { category: ledgerForm.category }),
    [ledgerRows, ledgerForm.category],
  );

  const accountName = (id: string) => accountRows.find((account) => account.id === id)?.name ?? id;
  const accountFor = (nameOrId: string) =>
    accountRows.find((account) => account.id === nameOrId || account.name === nameOrId);

  const createLedger = useRepositoryMutation(
    (repository, input: LedgerDraft) => repository.createLedgerTransaction(input),
    ["ledger", "accounts"],
  );
  const updateLedger = useRepositoryMutation(
    (repository, input: LedgerDraft & { id: string }) => repository.updateLedgerTransaction(input.id, input),
    ["ledger", "accounts"],
  );
  const deleteLedger = useRepositoryMutation(
    (repository, id: string) => repository.deleteLedgerTransaction(id),
    ["ledger", "accounts"],
  );
  const updateSettingsMutation = useRepositoryMutation(
    (repository, input: import("../domain/types").AppSettings) => repository.updateAppSettings(input),
    ["settings"],
  );
  const createRecurring = useRepositoryMutation(
    (repository, input: import("../data/repositories").RecurringDraft) => repository.createRecurringTransaction(input),
    ["recurring"],
  );
  const postRecurring = useRepositoryMutation(
    (repository, id: string) => repository.postRecurringTransaction(id),
    ["recurring", "ledger", "accounts"],
  );
  const createTransfer = useRepositoryMutation(
    (repository, input: TransferDraft) => repository.createTransfer(input),
    ["ledger", "accounts"],
  );
  const importLedger = useRepositoryMutation(
    (repository, input: LedgerDraft[]) => repository.importLedgerTransactions(input),
    ["ledger", "accounts"],
  );

  const rememberMerchants = useRepositoryMutation(async (repository, input: string[]) => {
    const nextNames = uniqueClean(input);
    if (nextNames.length === 0) return;
    const current = await repository.getAppSettings();
    const existing = new Set(current.merchants.map((merchant) => merchant.trim()).filter(Boolean));
    const additions = nextNames.filter((merchant) => !existing.has(merchant));
    if (additions.length === 0) return;
    await repository.updateAppSettings({ ...current, merchants: [...current.merchants, ...additions] });
  }, ["settings"]);

  const rememberCategories = useRepositoryMutation(
    async (repository, input: Array<{ category: string; subcategory: string }>) => {
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
    },
    ["settings"],
  );

  function rememberMerchantNames(names: string[]) {
    const nextNames = uniqueClean(names);
    if (nextNames.length === 0) return;
    void rememberMerchants.mutateAsync(nextNames).catch((error) => {
      console.warn("[cash-flow] failed to remember merchants", error);
    });
  }

  function openCreate(type: CashType) {
    setDrawerType(type);
    setDrawerOpen(true);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setMessage("");
    setCounterparty("");
    setDueDate("");
    if (type === "transfer") {
      setTransferForm({ ...emptyTransfer, date: nowAsDatetimeLocal(timezone) });
    } else {
      const defaultCurrency = appSettings?.primaryCurrency ?? emptyLedger.currency;
      setLedgerForm({
        ...emptyLedger,
        date: nowAsDatetimeLocal(timezone),
        currency: defaultCurrency,
        // No category pre-selected: leaving it empty lets the progressive flow
        // (category → suggested merchant/account) and the merchant→category
        // auto-fill both take effect instead of being shadowed by a default.
        category: "",
        entryType: entryTypeFor(type),
        settlementStatus: settlementFor(type),
      });
      setEntryDisplayCurrency(defaultCurrency);
      setAmountExpression(String(Math.abs(emptyLedger.amount)));
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setMessage("");
  }

  function changeType(next: CashType) {
    setDrawerType(next);
    if (next === "transfer") {
      setTransferForm({ ...emptyTransfer, date: nowAsDatetimeLocal(timezone) });
    } else {
      setLedgerForm((current) => ({
        ...current,
        entryType: entryTypeFor(next),
        settlementStatus: settlementFor(next),
      }));
    }
  }

  function startEdit(row: LedgerTransaction) {
    const type: CashType =
      row.settlementStatus === "receivable"
        ? "ar"
        : row.settlementStatus === "payable"
          ? "ap"
          : row.entryType === "income"
            ? "income"
            : "expense";
    setDrawerType(type);
    setEditingId(row.id);
    setCounterparty(row.settlementStatus === "settled" ? "" : row.merchant);
    setDueDate("");
    setLedgerForm({
      accountId: row.accountId,
      date: row.date,
      name: row.name,
      amount: row.amount,
      currency: row.currency,
      originalAmount: row.originalAmount,
      originalCurrency: row.originalCurrency,
      category: row.category,
      subcategory: row.subcategory,
      merchant: row.merchant,
      entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
      settlementStatus: row.settlementStatus ?? "settled",
      note: row.note,
    });
    setEntryDisplayCurrency(row.originalCurrency ?? row.currency);
    setAmountExpression(String(Math.abs(row.originalAmount ?? row.amount)));
    setDrawerRecurringFreq("none");
    setEditingRecurringRuleId(row.recurringRuleId ?? null);
    setMessage("");
    setDrawerOpen(true);
  }

  async function submitLedger() {
    setMessage("");
    try {
      const rawAmount = Math.abs(evaluateAmountExpression(amountExpression));
      const entryType = entryTypeFor(drawerType);
      const isForeignCurrency = entryDisplayCurrency !== ledgerForm.currency;

      let signedAmount: number;
      let originalAmount: number | null = null;
      let originalCurrency: string | null = null;

      if (isForeignCurrency) {
        const converted = convertCurrency(rawAmount, entryDisplayCurrency, ledgerForm.currency, appSettings);
        if (converted === null) throw new Error(`找不到 ${entryDisplayCurrency} → ${ledgerForm.currency} 的匯率，請先在「設定 → 匯率」中新增。`);
        signedAmount = entryType === "expense" ? -converted : converted;
        originalAmount = entryType === "expense" ? -rawAmount : rawAmount;
        originalCurrency = entryDisplayCurrency;
      } else {
        signedAmount = entryType === "expense" ? -rawAmount : rawAmount;
      }

      const isReceivablePayable = drawerType === "ar" || drawerType === "ap";
      const note = dueDate ? `${ledgerForm.note ? `${ledgerForm.note} · ` : ""}到期 ${dueDate}`.trim() : ledgerForm.note;
      const payload: LedgerDraft = {
        ...ledgerForm,
        entryType,
        settlementStatus: settlementFor(drawerType),
        amount: signedAmount,
        originalAmount,
        originalCurrency,
        name: ledgerForm.name.trim() || (isReceivablePayable ? counterparty.trim() : ""),
        category: ledgerForm.category.trim(),
        subcategory: ledgerForm.subcategory.trim(),
        merchant: (isReceivablePayable ? counterparty : ledgerForm.merchant).trim(),
        note,
        // Fees only attach to newly-created expenses; the repo emits a linked
        // 手續費 leg. Edits and non-expense rows never carry a fee.
        feeAmount: !editingId && entryType === "expense" ? (ledgerForm.feeAmount || 0) : 0,
      };
      if (!payload.accountId) throw new Error("請選擇帳戶。");
      if (isReceivablePayable && !payload.merchant) throw new Error("請填寫對象。");
      if (editingId) {
        await updateLedger.mutateAsync({ ...payload, id: editingId });
        toast.success("已更新交易");
        if (drawerRecurringFreq !== "none") {
          await createRecurring.mutateAsync({
             frequency: drawerRecurringFreq as any,
             dayOfMonth: parseInt(payload.date.slice(8, 10)),
             accountId: payload.accountId,
             amount: payload.amount,
             currency: payload.currency,
             category: payload.category,
             subcategory: payload.subcategory,
             merchant: payload.merchant,
             entryType: payload.entryType as "income" | "expense",
             settlementStatus: payload.settlementStatus,
             note: payload.note,
             nextRunDate: payload.date.slice(0, 10),
             isActive: true
          });
          toast.success("已建立週期規則");
        }
      } else {
        await createLedger.mutateAsync(payload);
        toast.success("已新增交易");
        if (drawerRecurringFreq !== "none") {
          await createRecurring.mutateAsync({
             frequency: drawerRecurringFreq as any,
             dayOfMonth: parseInt(payload.date.slice(8, 10)),
             accountId: payload.accountId,
             amount: payload.amount,
             currency: payload.currency,
             category: payload.category,
             subcategory: payload.subcategory,
             merchant: payload.merchant,
             entryType: payload.entryType as "income" | "expense",
             settlementStatus: payload.settlementStatus,
             note: payload.note,
             nextRunDate: payload.date.slice(0, 10),
             isActive: true
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
      if (!transferForm.sourceAccountId || !transferForm.destinationAccountId)
        throw new Error("請選擇來源和目標帳戶。");
      await createTransfer.mutateAsync(transferForm);
      toast.success("已建立轉帳");
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轉帳儲存失敗。");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteLedger.mutateAsync(id);
      toast.success("已刪除交易");
    } catch (e) {
      toast.error("刪除失敗");
    }
  }

  async function markSettled(row: LedgerTransaction) {
    await updateLedger.mutateAsync({
      id: row.id,
      accountId: row.accountId,
      date: row.date,
      name: row.name,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      subcategory: row.subcategory,
      merchant: row.merchant,
      entryType: row.entryType,
      settlementStatus: "settled",
      note: row.note,
    });
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseLedgerCsv(await file.text(), accountFor));
    event.target.value = "";
  }

  const monthKey = selectedMonth;
  const monthRows = useMemo(() => ledgerRows.filter((row) => {
    if (!row.date.startsWith(monthKey)) return false;
    if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
    if (selectedCategory !== "all" && row.category !== selectedCategory) return false;
    return true;
  }), [ledgerRows, monthKey, selectedAccount, selectedCategory]);
  const activityRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return monthRows;
    return monthRows.filter((row) => [
      row.name,
      row.merchant,
      row.category,
      row.subcategory,
      row.note,
      accountName(row.accountId),
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [monthRows, searchQuery, accountRows]);
  const monthIncome = monthRows
    .filter((row) => row.entryType === "income" && row.settlementStatus === "settled")
    .reduce((sum, row) => sum + Math.max(0, toPrimary(row) ?? 0), 0);
  const monthExpense = monthRows
    .filter((row) => row.entryType === "expense" && row.settlementStatus === "settled")
    .reduce((sum, row) => sum + Math.abs(toPrimary(row) ?? 0), 0);
  const monthNet = monthIncome - monthExpense;
  const monthTransferCount = new Set(monthRows.filter((row) => row.entryType === "transfer").map((row) => row.groupId ?? row.id)).size;
  const missingFx = [...new Set(monthRows
    .filter((row) => row.entryType !== "transfer" && row.settlementStatus === "settled" && toPrimary(row) === null)
    .map((row) => `${row.currency} → ${primaryCurrency}`))];

  // Category spending for donut chart (all categories, not just top 5)
  const allCategorySpend = useMemo(() => {
    const map = new Map<string, number>();
    // Use unfiltered-by-category rows for the donut so it always shows all categories
    const baseRows = ledgerRows.filter((row) => {
      if (!row.date.startsWith(monthKey)) return false;
      if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
      return true;
    });
    for (const row of baseRows) {
      if (row.entryType !== "expense" || row.settlementStatus !== "settled") continue;
      const key = row.category || "未分類";
      map.set(key, (map.get(key) ?? 0) + Math.abs(toPrimary(row) ?? 0));
    }
    const defaultColors = ["var(--ns-chart-1)","var(--ns-chart-2)","var(--ns-chart-3)","var(--ns-chart-4)","var(--ns-chart-5)","#2dd4bf","#fb923c","#a78bfa","#f472b6","#facc15"];
    return [...map.entries()]
      .map(([name, amount], idx) => {
        const catSetting = appSettings?.categories.find(c => c.name === name);
        return { name, amount, color: catSetting?.color || defaultColors[idx % defaultColors.length], icon: catSetting?.iconName || '📦' };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [ledgerRows, monthKey, selectedAccount, appSettings, toPrimary]);

  const totalCategorySpend = allCategorySpend.reduce((s, c) => s + c.amount, 0);

  const topCategorySpend = useMemo(() => allCategorySpend.slice(0, 5), [allCategorySpend]);

  const topMerchantSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of monthRows) {
      if (row.entryType !== "expense" || row.settlementStatus !== "settled" || !row.merchant) continue;
      map.set(row.merchant, (map.get(row.merchant) ?? 0) + Math.abs(toPrimary(row) ?? 0));
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [monthRows, toPrimary]);

  const dailyNetData = useMemo(() => {
    const [year, month] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = [];
    let cum = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${monthKey}-${i.toString().padStart(2, "0")}`;
      let net = 0;
      for (const row of monthRows) {
        if (row.date.startsWith(dateStr) && row.entryType !== "transfer" && row.settlementStatus === "settled") {
          net += toPrimary(row) ?? 0;
        }
      }
      cum += net;
      // `cum` is the running net cash flow through the month — a smooth
      // trajectory that stays readable even when only a few days have activity
      // (unlike scattered per-day bars).
      data.push({ date: i, net, cum });
    }
    return data;
  }, [monthRows, monthKey, toPrimary]);


  const [page, setPage] = useState(1);
  const pageSize = 50;
  
  useEffect(() => {
    setPage(1);
  }, [monthKey, selectedAccount, selectedCategory, searchQuery]);
  
  const sortedRows = useMemo(

    () => [...ledgerRows].sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows],
  );

  const totalPages = Math.ceil(activityRows.length / pageSize);
  const paginatedRows = useMemo(() => activityRows.slice((page - 1) * pageSize, page * pageSize), [activityRows, page]);
  const dayGroups = useMemo(() => groupByDay(paginatedRows, toPrimary), [paginatedRows, toPrimary]);

  const monthLabel = monthKey.replace("-", " / ");

  return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{monthLabel}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
            記帳
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          
          <MonthPicker 
            value={selectedMonth} 
            onChange={setSelectedMonth} 
            triggerClassName="h-[36px] whitespace-nowrap"
          />

          <div style={{ position: "relative" }}>
            <select
              className="ns-input"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ appearance: "none", padding: "0 28px 0 12px", height: 36, boxSizing: "border-box", fontSize: 13, minWidth: 116 }}
            >
              <option value="all">所有帳戶</option>
              {accountRows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <CaretDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ns-muted)" }} />
          </div>

          <div style={{ position: "relative" }}>
            <select
              className="ns-input"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ appearance: "none", padding: "0 28px 0 12px", height: 36, boxSizing: "border-box", fontSize: 13, minWidth: 116 }}
            >
              <option value="all">所有分類</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <CaretDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ns-muted)" }} />
          </div>

          <button className="ns-btn primary" style={{ height: 36, boxSizing: "border-box", whiteSpace: "nowrap" }} onClick={() => openCreate("expense")}>
            <Plus size={14} weight="bold" />記一筆
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--ns-border)', marginBottom: 24, overflowX: "auto" }}>
        {[
          { id: 'overview', label: '交易' },
          { id: 'categories', label: '分類' },
          { id: 'merchants', label: '商家' },
          { id: 'recurring', label: '週期規則' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: "nowrap",
            fontFamily: 'inherit', fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400,
            color: activeTab === t.id ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
            borderBottom: activeTab === t.id ? '2px solid var(--ns-accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.12s',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {missingFx.length > 0 ? (
            <div className="ns-card" style={{ padding: "10px 14px", marginBottom: 14, color: "var(--ns-neg)", fontSize: 13 }}>
              總額不完整：缺少匯率 {missingFx.join("、")}。請至設定更新匯率；原幣交易仍會保留。
            </div>
          ) : null}
          {/* Summary layer */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20, marginBottom: 20 }}>
        {/* Cashflow Chart */}
        <div className="ns-card" id="cashflow-chart" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>本月現金流 · Net</div>
              <div className={"ns-num-lg " + (monthNet >= 0 ? "pos" : "neg")}>
                {monthNet >= 0 ? "+" : "−"}{primaryCurrency} {formatNumber(Math.abs(monthNet))}
              </div>
            </div>
            <div style={{ flex: 1 }}/>
            {/* Income / Spending / Savings as side-by-side comparison cards. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(92px, 1fr))", gap: 8 }}>
              {([
                { label: "收入", value: `${primaryCurrency} ${formatNumber(monthIncome)}`, cls: "pos" },
                { label: "支出", value: `${primaryCurrency} ${formatNumber(monthExpense)}`, cls: "neg" },
                { label: "儲蓄率", value: monthIncome > 0 ? `${((monthNet / monthIncome) * 100).toFixed(1)}%` : "—", cls: monthIncome > 0 && monthNet >= 0 ? "pos" : "muted" },
              ]).map((s) => (
                <div key={s.label} className="ns-surface" style={{ padding: "8px 12px", borderRadius: "var(--ns-r-sm)" }}>
                  <div className="muted" style={{ fontSize: 11 }}>{s.label}</div>
                  <div className={"num " + s.cls} style={{ fontSize: 16, fontWeight: 500, whiteSpace: "nowrap" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyNetData}>
                <defs>
                  <linearGradient id="cashflowCum" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  cursor={{ stroke: resolveColor("var(--ns-border)") }}
                  contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any) => [`${primaryCurrency} ${formatNumber(v as number)}`, "累積淨額"]}
                  labelFormatter={(v) => `${monthLabel} / ${v}`}
                />
                <Area type="monotone" dataKey="cum" stroke="var(--ns-accent)" fill="url(#cashflowCum)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="dim mono" style={{ fontSize: 10.5, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span>1號</span><span>15號</span><span>月底</span>
          </div>
        </div>

        <div className="ns-card" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="ns-eyebrow">分類支出 · {monthLabel}</div>
            {selectedCategory !== "all" && (
              <button className="ns-btn ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setSelectedCategory("all")}>
                <X size={10} weight="bold" />清除篩選
              </button>
            )}
          </div>

          {/* Category Bar List */}
          {allCategorySpend.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {allCategorySpend.map((r) => {
                const pct = totalCategorySpend > 0 ? (r.amount / totalCategorySpend) * 100 : 0;
                const isActive = selectedCategory === "all" || selectedCategory === r.name;
                const displayPct = pct < 1 ? "<1" : pct.toFixed(1);
                return (
                  <div
                    key={r.name}
                    onClick={() => setSelectedCategory(prev => prev === r.name ? "all" : r.name)}
                    style={{
                      cursor: "pointer",
                      opacity: isActive ? 1 : 0.45,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{r.icon}</span>
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                      <span className="num muted" style={{ fontSize: 12 }}>
                        {displayPct}% · {primaryCurrency} {formatNumber(r.amount)}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: r.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13, textAlign: "center", padding: "30px 0" }}>本月尚無支出</div>
          )}
        </div>
      </div>

      {preview ? (
        <div className="ns-card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
          </div>
          {preview.invalid.map((item) => (
            <div key={item.row} style={{ fontSize: 13, color: "var(--ns-neg)" }}>Row {item.row}: {item.reason}</div>
          ))}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              className="ns-btn primary"
              onClick={async () => {
                const rows = preview.valid.map((item) => item.value);
                await importLedger.mutateAsync(rows);
                rememberMerchantNames(rows.map((row) => row.merchant));
                setPreview(null);
                toast.success(`成功匯入 ${rows.length} 筆資料`);
              }}
            >
              確認匯入
            </button>
            <button className="ns-btn" onClick={() => setPreview(null)}>取消</button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* Transactions grouped by day */}
        <div className="ns-card" style={{ padding: 0 }}>
           <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--ns-border)", flexWrap: "wrap" }}>
             <span style={{ fontWeight: 600, fontSize: 15 }}>Recent activity</span>
             <label style={{ position: "relative", minWidth: 180, flex: "0 1 260px" }}>
               <MagnifyingGlass size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ns-muted)" }} />
               <input className="ns-input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋商家、分類或備註" style={{ width: "100%", height: 34, padding: "0 12px 0 30px", fontSize: 12.5 }} />
             </label>
             <span className="muted" style={{ fontSize: 12.5 }}>{activityRows.length} events</span>
           </div>

           {dayGroups.length === 0 ? (
            <div style={{ padding: "56px 20px", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Receipt size={24} weight="duotone" />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒有記帳資料</div>
              <button className="ns-btn primary" onClick={() => openCreate("expense")}><Plus size={14} weight="bold" />新增交易</button>
            </div>
           ) : (
            dayGroups.map((g, gi) => (
              <div key={g.date}>
                <div style={{
                  padding: "14px 22px", borderBottom: "1px solid var(--ns-border)",
                  borderTop: gi === 0 ? "none" : "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--ns-bg-elev)",
                }}>
                  <span className="ns-eyebrow">{g.date}</span>
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    Net <span className={g.net >= 0 ? "pos" : "neg"}>
                      {(g.net >= 0 ? "+" : "−")}{primaryCurrency} {formatNumber(Math.abs(g.net))}
                    </span>
                  </span>
                </div>
                {g.rows.map((r, i) => {
                  const catGroup = appSettings?.categories.find((c: any) => c.name === r.category);
                  return (
                    <LedgerRow
                      key={r.id}
                      row={r}
                      accountName={accountName}
                      categoryIcon={catGroup?.iconName || undefined}
                      onEdit={() => setDetailRow(r)}
                      onDelete={() => handleDelete(r.id)}
                      onSettle={() => markSettled(r)}
                    />
                  );
                })}
              </div>
            ))
           )}
        </div>

        {/* Side rankings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <RankingCard title="商家花費排行" rows={topMerchantSpend} emptyText="本月尚無商家資料" currency={primaryCurrency} />
          <UpcomingPayments recurringRows={recurringRows} accountName={accountName} onPost={async (id) => { try { await postRecurring.mutateAsync(id); toast.success("已記入交易"); } catch { toast.error("記入失敗"); } }} posting={postRecurring.isPending} />
        </div>
      </div>
      </>
      )}

      {activeTab === "categories" && (
        <CategoriesTab filterMonth={selectedMonth} ledgerRows={ledgerRows} appSettings={appSettings} primaryCurrency={primaryCurrency} toPrimary={toPrimary} onSettingsClick={() => setCategoryDrawerOpen(true)} />
      )}

      {activeTab === "merchants" && (
        <MerchantsTab filterMonth={selectedMonth} ledgerRows={ledgerRows} primaryCurrency={primaryCurrency} toPrimary={toPrimary} />
      )}

      {activeTab === "recurring" && (
        <RecurringRulesTab />
      )}

      <EntryDrawer
        open={drawerOpen}
        type={drawerType}
        editing={Boolean(editingId)}
        onClose={closeDrawer}
        onTypeChange={changeType}
        ledgerForm={ledgerForm}
        setLedgerForm={(next) => {
          // When account changes, reset display currency to account's currency
          if (next.accountId !== ledgerForm.accountId) {
            setEntryDisplayCurrency(next.currency);
          }
          setLedgerForm(next);
        }}
        entryDisplayCurrency={entryDisplayCurrency}
        setEntryDisplayCurrency={setEntryDisplayCurrency}
        appSettings={appSettings}
        amountExpression={amountExpression}
        setAmountExpression={setAmountExpression}
        transferForm={transferForm}
        setTransferForm={setTransferForm}
        counterparty={counterparty}
        setCounterparty={setCounterparty}
        dueDate={dueDate}
        setDueDate={setDueDate}
        categories={categories}
        subcategories={subcategories}
        merchantSuggestions={merchantSuggestions}
        categorySuggestions={categorySuggestions}
        categoryForMerchant={categoryForMerchant}
        accountRows={accountRows}
        onSubmitLedger={submitLedger}
        onSubmitTransfer={submitTransfer}
        message={message}
        drawerRecurringFreq={drawerRecurringFreq}
        setDrawerRecurringFreq={setDrawerRecurringFreq}
        editingRecurringRuleId={editingRecurringRuleId}
        recurringRows={recurringRows}
      />
      <CategoryManagementDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={appSettings?.categories || []}
        onSave={async (cats) => {
          if (!appSettings) return;
          await updateSettingsMutation.mutateAsync({ ...appSettings, categories: cats });
          toast.success("已更新分類設定");
        }}
      />
      <TransactionDetailPanel
        row={detailRow}
        onClose={() => setDetailRow(null)}
        onEdit={(row) => { setDetailRow(null); startEdit(row); }}
        onDelete={(id) => { setDetailRow(null); handleDelete(id); }}
        accountName={accountName}
        recurringRows={recurringRows}
      />
    </div>
  );
}

/* ─────────────── Ledger row ─────────────── */

function LedgerRow({
  row,
  accountName,
  categoryIcon,
  onEdit,
  onDelete,
  onSettle,
}: {
  row: LedgerTransaction;
  accountName: (id: string) => string;
  categoryIcon?: string;
  onEdit: () => void;
  onDelete: () => void;
  onSettle: () => void;
}) {
  const isTransfer = row.entryType === "transfer";
  const isReceivable = row.settlementStatus === "receivable";
  const isPayable = row.settlementStatus === "payable";
  const positive = row.amount >= 0;
  const color = isTransfer ? "var(--ns-fg)" : positive ? "var(--ns-pos)" : "var(--ns-neg)";
  const sign = isTransfer ? "" : positive ? "+" : "−";
  const subtitle = [
    row.category ? `${row.category}${row.subcategory ? ` / ${row.subcategory}` : ""}` : null,
    row.merchant || null,
    accountName(row.accountId),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="ns-cf-row"
      onClick={onEdit}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--ns-border)", cursor: "pointer" }}
    >
      <div style={{ width: 34, height: 34, borderRadius: "var(--ns-r-sm)", flexShrink: 0, background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isTransfer ? <ArrowsLeftRight size={15} /> : categoryIcon ? <span style={{ fontSize: 16 }}>{categoryIcon}</span> : <Tag size={15} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {row.name || row.category || (isTransfer ? "轉帳" : "未命名")}
          </span>
          {isReceivable ? <span className="ns-pill" style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收</span> : null}
          {isPayable ? <span className="ns-pill" style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付</span> : null}
        </div>
        <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        {row.originalCurrency && row.originalAmount != null ? (
          <>
            <div className="num" style={{ fontSize: 14.5, color }}>{sign}{currencySymbol(row.originalCurrency)}{formatNumber(Math.abs(row.originalAmount))}</div>
            <div className="muted" style={{ fontSize: 10.5, fontFamily: "var(--ns-font-mono)" }}>≈ {currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
          </>
        ) : (
          <div className="num" style={{ fontSize: 14.5, color }}>{sign}{currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
        )}
      </div>
      <div className="ns-cf-actions" style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
        {(isReceivable || isPayable) ? (
          <button className="ns-btn ghost icon" title="結清" onClick={onSettle}><Check size={14} /></button>
        ) : null}
        {!isTransfer ? (
          <button className="ns-btn ghost icon" title="編輯" onClick={onEdit}><PencilSimple size={13} /></button>
        ) : null}
        <button className="ns-btn ghost icon" title="刪除" onClick={onDelete} style={{ color: "var(--ns-neg)" }}><Trash size={13} /></button>
      </div>
    </div>
  );
}

/* ─────────────── Stat + ranking cards ─────────────── */

function StatCard({ label, value, tone }: { label: string; value: string; tone: "pos" | "neg" | "muted" }) {
  const color = tone === "pos" ? "var(--ns-pos)" : tone === "neg" ? "var(--ns-neg)" : "var(--ns-fg)";
  return (
    <div className="ns-card" style={{ padding: 18 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 500, color }}>{value}</div>
    </div>
  );
}

function RankingCard({ title, rows, emptyText, currency }: { title: string; rows: Array<{ name: string; amount: number }>; emptyText: string; currency: string }) {
  const max = rows[0]?.amount ?? 1;
  return (
    <div className="ns-card">
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((row) => (
            <div key={row.name}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
                <span className="num muted">{currency} {formatNumber(row.amount)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(6, (row.amount / max) * 100)}%`, height: "100%", background: "var(--ns-accent)" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UpcomingPayments({ recurringRows, accountName, onPost, posting }: { recurringRows: RecurringTransaction[]; accountName: (id: string) => string; onPost: (id: string) => void; posting: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();
  const upcoming = recurringRows
    .filter((row) => row.isActive && row.nextRunDate >= today && row.nextRunDate <= horizon)
    .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate));

  return (
    <div className="ns-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <CalendarBlank size={15} weight="duotone" style={{ color: "var(--ns-accent)" }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>近 2 週固定收支</span>
      </div>
      {upcoming.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>近期沒有排定的週期事件。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {upcoming.map((row) => (
            <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.merchant || row.category}</div>
                <div className="muted" style={{ fontSize: 11 }}>{row.nextRunDate} · {accountName(row.accountId)}</div>
              </div>
              <span className="num" style={{ color: row.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)", whiteSpace: "nowrap" }}>
                {row.entryType === "income" ? "+" : "−"}{row.currency} {formatNumber(Math.abs(row.amount))}
              </span>
              <button className="ns-btn ghost" style={{ fontSize: 11, padding: "3px 8px", minHeight: "auto", whiteSpace: "nowrap" }} disabled={posting} onClick={() => onPost(row.id)} title="立即記入這筆交易">記入</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Entry drawer (5 types) ─────────────── */

function EntryDrawer({
  open,
  type,
  editing,
  onClose,
  onTypeChange,
  ledgerForm,
  setLedgerForm,
  entryDisplayCurrency,
  setEntryDisplayCurrency,
  appSettings,
  amountExpression,
  setAmountExpression,
  transferForm,
  setTransferForm,
  counterparty,
  setCounterparty,
  dueDate,
  setDueDate,
  categories,
  subcategories,
  merchantSuggestions,
  categorySuggestions,
  categoryForMerchant,
  accountRows,
  onSubmitLedger,
  onSubmitTransfer,
  message,
  drawerRecurringFreq,
  setDrawerRecurringFreq,
  editingRecurringRuleId,
  recurringRows,
}: {
  open: boolean;
  type: CashType;
  editing: boolean;
  onClose: () => void;
  onTypeChange: (type: CashType) => void;
  ledgerForm: LedgerDraft;
  setLedgerForm: (value: LedgerDraft) => void;
  entryDisplayCurrency: string;
  setEntryDisplayCurrency: (v: string) => void;
  appSettings: import("../domain/types").AppSettings | undefined;
  amountExpression: string;
  setAmountExpression: (value: string) => void;
  transferForm: TransferDraft;
  setTransferForm: (value: TransferDraft) => void;
  counterparty: string;
  setCounterparty: (value: string) => void;
  dueDate: string;
  setDueDate: (value: string) => void;
  categories: Array<{ name: string; children: string[]; color?: string; iconName?: string }>;
  subcategories: string[];
  merchantSuggestions: string[];
  categorySuggestions: { merchants: string[]; accountIds: string[] };
  categoryForMerchant: (merchant: string) => { category: string; subcategory: string } | null;
  accountRows: Array<{ id: string; name: string; currency: string }>;
  onSubmitLedger: () => void;
  onSubmitTransfer: () => void;
  message: string;
  drawerRecurringFreq: string;
  setDrawerRecurringFreq: (v: string) => void;
  editingRecurringRuleId: string | null;
  recurringRows: import("../domain").RecurringTransaction[];
}) {
  const [amountFocused, setAmountFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => { if (open) setShowAdvanced(false); }, [open]);

  const destAmountField = useNumericField(
    transferForm.destinationAmount ?? 0,
    (v) => setTransferForm({ ...transferForm, destinationAmount: v }),
  );
  const transferFeeField = useNumericField(
    transferForm.feeAmount ?? 0,
    (v) => setTransferForm({ ...transferForm, feeAmount: v }),
  );
  const expenseFeeField = useNumericField(
    ledgerForm.feeAmount ?? 0,
    (v) => setLedgerForm({ ...ledgerForm, feeAmount: v }),
  );

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

  const meta = TYPE_META[type];
  const isAcct = type === "expense" || type === "income";
  const isRp = type === "ar" || type === "ap";

  const linkedRule = editingRecurringRuleId
    ? recurringRows.find((r) => r.id === editingRecurringRuleId) ?? null
    : null;

  // Currencies available for entry: account's own currency + those in exchange rates
  const entryCurrencies = (() => {
    const accountCurrency = ledgerForm.currency || "TWD";
    const rateCurrencies = (appSettings?.exchangeRates ?? []).flatMap((r) => [r.from, r.to]);
    return [...new Set([accountCurrency, ...rateCurrencies])];
  })();
  const isForeignEntry = isAcct && entryDisplayCurrency !== ledgerForm.currency;
  const convertedHint = (() => {
    if (!isForeignEntry) return null;
    const raw = Math.abs(Number(amountExpression) || 0);
    if (!raw) return null;
    const converted = convertCurrency(raw, entryDisplayCurrency, ledgerForm.currency, appSettings);
    if (converted === null) return null;
    const rate = raw > 0 ? (converted / raw).toFixed(4) : "—";
    return { converted, rate };
  })();

  // History-driven suggestions for the chosen category, shown as one-tap chips.
  // Only surfaced while the relevant field is still empty so we never override
  // a value the user already entered.
  const hasCategory = Boolean(ledgerForm.category.trim());
  const merchantChips = hasCategory && !ledgerForm.merchant.trim()
    ? categorySuggestions.merchants.filter((m) => m && m !== ledgerForm.merchant)
    : [];
  const accountChips = hasCategory && !ledgerForm.accountId
    ? categorySuggestions.accountIds
        .map((id) => accountRows.find((a) => a.id === id))
        .filter((a): a is { id: string; name: string; currency: string } => Boolean(a))
    : [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: "min(500px, 100%)",
          background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)",
          display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "var(--ns-r-sm)", background: meta.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Plus size={15} weight="bold" />
          </div>
          <h2 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 600 }}>
            {editing ? "編輯交易" : "新增交易"}
          </h2>
          <div style={{ flex: 1 }} />
          <button className="ns-btn ghost icon" onClick={onClose} aria-label="關閉"><X size={16} /></button>
        </div>

        {/* Type tabs */}
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TYPE_ORDER.map((t) => {
              const m = TYPE_META[t];
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => onTypeChange(t)}
                  style={{
                    padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: "pointer",
                    border: active ? "none" : "1px solid var(--ns-border)",
                    background: active ? m.color : "var(--ns-bg-card)",
                    color: active ? "#fff" : "var(--ns-fg-dim)",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Recurring rule banner */}
          {linkedRule && (
            <div style={{
              padding: "10px 14px", borderRadius: "var(--ns-r-sm)",
              background: "var(--ns-accent-soft)", border: "1px solid var(--ns-accent)",
              fontSize: 12, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ color: "var(--ns-accent)", fontWeight: 600 }}>週期交易</span>
              <span style={{ color: "var(--ns-fg-muted)" }}>
                此筆由週期規則「{linkedRule.merchant || linkedRule.category}」自動產生（{recurringFrequencyLabels[linkedRule.frequency]}）
              </span>
            </div>
          )}
          {/* Amount */}
          <DrawerField label={`${meta.eyebrow} · ${type === "transfer" ? transferForm.sourceCurrency : entryDisplayCurrency}`} required>
            <div style={{
              display: "flex", alignItems: "center",
              background: "var(--ns-bg-elev)",
              border: amountFocused ? "1px solid var(--ns-accent)" : "1px solid var(--ns-border)",
              boxShadow: amountFocused ? "0 0 0 3px var(--ns-accent-soft)" : "none",
              borderRadius: "var(--ns-r-sm)", height: 52, overflow: "hidden",
              transition: "border-color 0.12s, box-shadow 0.12s",
            }}>
              {isAcct && entryCurrencies.length > 1 ? (
                <select
                  value={entryDisplayCurrency}
                  onChange={(e) => setEntryDisplayCurrency(e.target.value)}
                  style={{
                    padding: "0 10px 0 14px", fontSize: 16, color: meta.color,
                    fontFamily: "var(--ns-font-mono)", fontWeight: 500,
                    flexShrink: 0, borderRight: "1px solid var(--ns-border)",
                    height: "100%", background: "transparent", border: "none",
                    outline: "none", cursor: "pointer", appearance: "none",
                    minWidth: 80,
                  }}
                >
                  {entryCurrencies.map((c) => <option key={c} value={c}>{meta.sign}{c}</option>)}
                </select>
              ) : (
                <span style={{
                  padding: "0 14px", fontSize: 20, color: meta.color,
                  fontFamily: "var(--ns-font-mono)", fontWeight: 500,
                  flexShrink: 0, borderRight: "1px solid var(--ns-border)",
                  height: "100%", display: "flex", alignItems: "center",
                  userSelect: "none",
                }}>
                  {meta.sign}{type === "transfer" ? transferForm.sourceCurrency : entryDisplayCurrency}
                </span>
              )}
              {type === "transfer" ? (
                <input
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    padding: "0 14px", fontSize: 22, fontFamily: "var(--ns-font-mono)",
                    color: meta.color, textAlign: "right", height: "100%",
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                  value={amountFocused
                    ? (transferForm.sourceAmount || "")
                    : (transferForm.sourceAmount ? transferForm.sourceAmount.toLocaleString("zh-TW") : "")}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/[^\d.]/g, "")) || 0;
                    const sameCcy = transferForm.sourceCurrency === transferForm.destinationCurrency;
                    setTransferForm({ ...transferForm, sourceAmount: v, destinationAmount: sameCcy ? v : transferForm.destinationAmount });
                  }}
                  placeholder="0"
                  inputMode="decimal"
                />
              ) : (
                <input
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    padding: "0 14px", fontSize: 22, fontFamily: "var(--ns-font-mono)",
                    color: meta.color, textAlign: "right", height: "100%",
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                  value={amountFocused ? amountExpression : fmtAmountDisplay(amountExpression)}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  onChange={(e) => setAmountExpression(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                />
              )}
            </div>
            {convertedHint && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                ≈ {ledgerForm.currency} {formatNumber(convertedHint.converted)}（1 {entryDisplayCurrency} ≈ {convertedHint.rate} {ledgerForm.currency}）
              </div>
            )}
          </DrawerField>

          {/* Date + account/currency — for transfer & receivable/payable.
              Expense/income render date + account inside the progressive block. */}
          {!isAcct && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <DrawerField label="日期">
                <input
                  className="ns-input"
                  type="datetime-local"
                  value={type === "transfer" ? transferForm.date : ledgerForm.date}
                  onChange={(e) =>
                    type === "transfer"
                      ? setTransferForm({ ...transferForm, date: e.target.value })
                      : setLedgerForm({ ...ledgerForm, date: e.target.value })
                  }
                />
              </DrawerField>
              {type !== "transfer" ? (
                <DrawerField label={type === "ap" ? "支出帳戶" : "收入帳戶"} required>
                  <select
                    className="ns-input"
                    style={{ appearance: "none" }}
                    value={ledgerForm.accountId}
                    onChange={(e) => {
                      const account = accountRows.find((a) => a.id === e.target.value);
                      setLedgerForm({ ...ledgerForm, accountId: e.target.value, currency: account?.currency ?? ledgerForm.currency });
                    }}
                  >
                    <option value="">選擇帳戶</option>
                    {accountRows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </DrawerField>
              ) : (
                <DrawerField label="幣別">
                  <input className="ns-input" value={transferForm.sourceCurrency} disabled />
                </DrawerField>
              )}
            </div>
          )}

          {/* Transfer from → to */}
          {type === "transfer" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <DrawerField label="從（轉出）" required>
                <select
                  className="ns-input"
                  style={{ appearance: "none" }}
                  value={transferForm.sourceAccountId}
                  onChange={(e) => {
                    const account = accountRows.find((a) => a.id === e.target.value);
                    setTransferForm({ ...transferForm, sourceAccountId: e.target.value, sourceCurrency: account?.currency ?? transferForm.sourceCurrency });
                  }}
                >
                  <option value="">選擇帳戶</option>
                  {accountRows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </DrawerField>
              <DrawerField label="至（轉入）" required>
                <select
                  className="ns-input"
                  style={{ appearance: "none" }}
                  value={transferForm.destinationAccountId}
                  onChange={(e) => {
                    const account = accountRows.find((a) => a.id === e.target.value);
                    const destCurrency = account?.currency ?? transferForm.destinationCurrency;
                    const sameCcy = transferForm.sourceCurrency === destCurrency;
                    setTransferForm({ ...transferForm, destinationAccountId: e.target.value, destinationCurrency: destCurrency, destinationAmount: sameCcy ? transferForm.sourceAmount : transferForm.destinationAmount });
                  }}
                >
                  <option value="">選擇帳戶</option>
                  {accountRows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </DrawerField>
            </div>
          )}

          {/* Cross-currency: editable destination amount */}
          {type === "transfer" && transferForm.sourceCurrency !== transferForm.destinationCurrency && (
            <DrawerField label={`對方收到金額 · ${transferForm.destinationCurrency}`} required>
              <input
                className="ns-input"
                placeholder="0"
                style={{ fontFamily: "var(--ns-font-mono)" }}
                {...destAmountField}
              />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                跨幣轉帳：輸入對方帳戶實際收到的金額
                {transferForm.sourceAmount > 0 && (transferForm.destinationAmount ?? 0) > 0
                  ? `（匯率約 1 ${transferForm.sourceCurrency} ≈ ${(transferForm.destinationAmount! / transferForm.sourceAmount).toFixed(4)} ${transferForm.destinationCurrency}）`
                  : ""}
              </div>
            </DrawerField>
          )}

          {/* Transfer fee */}
          {type === "transfer" && (
            <DrawerField label={`手續費（選填） · ${transferForm.sourceCurrency}`}>
              <input
                className="ns-input"
                placeholder="0"
                style={{ fontFamily: "var(--ns-font-mono)" }}
                {...transferFeeField}
              />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>跨行/跨國轉帳手續費，將從轉出帳戶另計一筆「手續費」支出。</div>
            </DrawerField>
          )}

          {/* Expense / income — progressive flow: 分類 → 帳戶 → 名稱/商家 → 更多選項 */}
          {isAcct && (
            <>
              {/* 1 · Category drives the merchant & account suggestions below */}
              <DrawerField label="分類" required>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: subcategories.length ? 10 : 0 }}>
                  {categories.map((c) => {
                    const active = ledgerForm.category === c.name;
                    const color = c.color || "var(--ns-accent)";
                    return (
                      <button
                        key={c.name}
                        onClick={() => setLedgerForm({ ...ledgerForm, category: c.name, subcategory: "" })}
                        style={{
                          padding: "5px 11px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
                          background: active ? color : "var(--ns-bg-card)",
                          color: active ? "#fff" : "var(--ns-fg)",
                          border: active ? "none" : "1px solid var(--ns-border)",
                          fontFamily: "inherit", transition: "all 0.12s",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {c.iconName && <span style={{ fontSize: 14 }}>{c.iconName}</span>}
                        {c.name}
                      </button>
                    );
                  })}
                  {categories.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>尚未建立分類，可於設定新增。</span> : null}
                </div>
                {subcategories.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: 10, borderLeft: "2px solid var(--ns-border)" }}>
                    {subcategories.map((s) => {
                      const active = ledgerForm.subcategory === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setLedgerForm({ ...ledgerForm, subcategory: s })}
                          style={{
                            padding: "4px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                            background: active ? "var(--ns-accent)" : "var(--ns-bg-hover)",
                            color: active ? "#fff" : "var(--ns-fg-muted)",
                            border: active ? "none" : "1px solid var(--ns-border)",
                            fontFamily: "inherit",
                          }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </DrawerField>

              {/* 2 · Account + date, with a suggested account from history */}
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <DrawerField label={type === "expense" ? "支出帳戶" : "收入帳戶"} required>
                    <select
                      className="ns-input"
                      style={{ appearance: "none" }}
                      value={ledgerForm.accountId}
                      onChange={(e) => {
                        const account = accountRows.find((a) => a.id === e.target.value);
                        setLedgerForm({ ...ledgerForm, accountId: e.target.value, currency: account?.currency ?? ledgerForm.currency });
                      }}
                    >
                      <option value="">選擇帳戶</option>
                      {accountRows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </DrawerField>
                  <DrawerField label="日期">
                    <input className="ns-input" type="datetime-local" value={ledgerForm.date} onChange={(e) => setLedgerForm({ ...ledgerForm, date: e.target.value })} />
                  </DrawerField>
                </div>
                {accountChips.length > 0 && (
                  <SuggestionRow
                    chips={accountChips.map((a) => ({ key: a.id, label: a.name }))}
                    onPick={(id) => {
                      const account = accountRows.find((a) => a.id === id);
                      setLedgerForm({ ...ledgerForm, accountId: id, currency: account?.currency ?? ledgerForm.currency });
                    }}
                  />
                )}
              </div>

              {/* 3 · Name + merchant, with suggested merchants for this category */}
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <DrawerField label="名稱">
                    <input className="ns-input" value={ledgerForm.name} onChange={(e) => setLedgerForm({ ...ledgerForm, name: e.target.value })} placeholder={type === "expense" ? "計程車" : "月薪"} />
                  </DrawerField>
                  <DrawerField label="商家 / 來源">
                    <MerchantAutocomplete value={ledgerForm.merchant} suggestions={merchantSuggestions} onChange={(next) => {
                      const patch = { ...ledgerForm, merchant: next };
                      // Reverse path: typing a merchant auto-fills its usual category,
                      // but only when no category has been chosen yet.
                      if (!ledgerForm.category.trim()) {
                        const suggestion = categoryForMerchant(next);
                        if (suggestion?.category) { patch.category = suggestion.category; patch.subcategory = suggestion.subcategory; }
                      }
                      setLedgerForm(patch);
                    }} placeholder={type === "expense" ? "UBER" : "公司"} />
                  </DrawerField>
                </div>
                {merchantChips.length > 0 && (
                  <SuggestionRow
                    chips={merchantChips.map((m) => ({ key: m, label: m }))}
                    onPick={(m) => setLedgerForm({ ...ledgerForm, merchant: m })}
                  />
                )}
              </div>

              {/* 4 · Advanced: fee, recurring, note */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  style={{ background: "none", border: "none", color: "var(--ns-fg-muted)", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontFamily: "inherit" }}
                >
                  {showAdvanced ? <CaretDown size={13} /> : <CaretRight size={13} />}
                  更多選項（手續費、週期、備註）
                </button>
              </div>
              {showAdvanced && (
                <>
                  {type === "expense" && !editing && (
                    <DrawerField label={`外加手續費（選填） · ${ledgerForm.currency}`}>
                      <input
                        className="ns-input"
                        placeholder="0"
                        style={{ fontFamily: "var(--ns-font-mono)" }}
                        {...expenseFeeField}
                      />
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>海外刷卡/跨國交易手續費，將另計一筆「手續費」支出。</div>
                    </DrawerField>
                  )}
                  <DrawerField label="週期交易">
                    <select
                      className="ns-input"
                      value={drawerRecurringFreq}
                      onChange={(e) => setDrawerRecurringFreq(e.target.value)}
                      style={{ appearance: "none" }}
                    >
                      <option value="none">單次交易 (不重複)</option>
                      <option value="weekly">每週</option>
                      <option value="monthly">每月</option>
                      <option value="yearly">每年</option>
                    </select>
                  </DrawerField>
                  <DrawerField label="備註">
                    <input className="ns-input" value={ledgerForm.note} onChange={(e) => setLedgerForm({ ...ledgerForm, note: e.target.value })} placeholder="選填" />
                  </DrawerField>
                </>
              )}
            </>
          )}

          {/* AR / AP */}
          {isRp && (
            <>
              <div style={{ padding: "12px 14px", borderRadius: "var(--ns-r-md)", background: `color-mix(in srgb, ${meta.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`, fontSize: 12.5, color: "var(--ns-fg-muted)", lineHeight: 1.6 }}>
                {type === "ar" ? "應收帳款：對方欠你的錢，尚未入帳。結清後計入收入。" : "應付帳款：你欠對方的錢，尚未付款。結清後計入支出。"}
              </div>
              <DrawerField label={type === "ar" ? "對象（欠款方）" : "對象（收款方）"} required>
                <input className="ns-input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={type === "ar" ? "例：小明、ABC 公司" : "例：房東、供應商"} />
              </DrawerField>
              <DrawerField label={type === "ar" ? "預計收款日" : "付款截止日"}>
                <input className="ns-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ fontFamily: "var(--ns-font-mono)" }} />
              </DrawerField>
              <DrawerField label="分類">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {categories.map((c) => {
                    const active = ledgerForm.category === c.name;
                    return (
                      <button
                        key={c.name}
                        onClick={() => setLedgerForm({ ...ledgerForm, category: c.name, subcategory: "" })}
                        style={{
                          padding: "5px 11px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
                          background: active ? (c.color || "var(--ns-accent)") : "var(--ns-bg-card)",
                          color: active ? "#fff" : "var(--ns-fg)",
                          border: active ? "none" : "1px solid var(--ns-border)",
                          fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {c.iconName && <span style={{ fontSize: 14 }}>{c.iconName}</span>}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </DrawerField>
            </>
          )}

          {/* Recurring + note for transfer / receivable / payable.
              Expense/income keep these inside 更多選項 above. */}
          {!isAcct && (
            <>
              <DrawerField label="週期交易">
                <select
                  className="ns-input"
                  value={drawerRecurringFreq}
                  onChange={(e) => setDrawerRecurringFreq(e.target.value)}
                  style={{ appearance: "none" }}
                >
                  <option value="none">單次交易 (不重複)</option>
                  <option value="weekly">每週</option>
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                </select>
              </DrawerField>

              <DrawerField label="備註">
                <input
                  className="ns-input"
                  value={type === "transfer" ? transferForm.note : ledgerForm.note}
                  onChange={(e) =>
                    type === "transfer"
                      ? setTransferForm({ ...transferForm, note: e.target.value })
                      : setLedgerForm({ ...ledgerForm, note: e.target.value })
                  }
                  placeholder="選填"
                />
              </DrawerField>
            </>
          )}

          {message ? <div style={{ color: "var(--ns-neg)", fontSize: 13 }}>{message}</div> : null}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 8 }}>
          <button className="ns-btn ghost" style={{ flex: "0 0 80px", justifyContent: "center" }} onClick={onClose}>取消</button>
          <button
            className="ns-btn primary"
            style={{ flex: 1, justifyContent: "center", background: meta.color, borderColor: meta.color, color: "#fff" }}
            onClick={type === "transfer" ? onSubmitTransfer : onSubmitLedger}
          >
            <Check size={14} weight="bold" />
            {editing ? "儲存變更" : type === "ar" ? "記錄應收" : type === "ap" ? "記錄應付" : type === "transfer" ? "建立轉帳" : "儲存交易"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11.5, color: "var(--ns-fg-muted)", marginBottom: 6, letterSpacing: 0.04, textTransform: "uppercase" }}>
        {label}
        {required ? <span style={{ color: "var(--ns-neg)", marginLeft: 3 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

/* ─────────────── helpers ─────────────── */

function groupByDay(rows: LedgerTransaction[], toPrimary: (row: LedgerTransaction, amount?: number) => number | null) {
  const map = new Map<string, LedgerTransaction[]>();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), row]);
  }
  return [...map.entries()].map(([date, dayRows]) => ({
    date,
    rows: dayRows,
    net: dayRows.reduce((sum, row) => (row.entryType === "transfer" ? sum : sum + (toPrimary(row) ?? 0)), 0),
  }));
}

function SuggestionRow({
  chips,
  onPick,
}: {
  chips: Array<{ key: string; label: string }>;
  onPick: (key: string) => void;
}) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span className="muted" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Sparkle size={12} weight="fill" style={{ color: "var(--ns-accent)" }} />
        依過往紀錄建議
      </span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onPick(chip.key)}
          style={{
            padding: "4px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer",
            background: "var(--ns-accent-soft)", color: "var(--ns-accent)",
            border: "1px solid color-mix(in srgb, var(--ns-accent) 30%, transparent)",
            fontFamily: "inherit",
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
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
  const showPanel = open && suggestions.length > 0;
  return (
    <div style={{ position: "relative" }}>
      <input
        className="ns-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {showPanel ? (
        <div style={{ position: "absolute", left: 0, right: 0, zIndex: 20, marginTop: 4, overflow: "hidden", borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", background: "var(--ns-bg-card)", boxShadow: "var(--ns-shadow-2)" }}>
          {suggestions.slice(0, 8).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(suggestion);
                setOpen(false);
              }}
              style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", fontSize: 13, background: "transparent", border: "none", color: "var(--ns-fg)", cursor: "pointer" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  TWD: "NT$", USD: "$", JPY: "¥", EUR: "€", GBP: "£", CNY: "¥", HKD: "HK$", AUD: "A$", CAD: "C$", SGD: "S$",
};
function currencySymbol(code: string) {
  return CURRENCY_SYMBOLS[code] ?? code;
}

function fmtAmountDisplay(expr: string): string {
  if (!expr || expr === "0") return "";
  if (/[+\-*/]/.test(expr)) return expr;
  const n = parseFloat(expr);
  if (isNaN(n)) return expr;
  return Number.isInteger(n) ? n.toLocaleString("zh-TW") : n.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
}

function uniqueClean(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  const name = color.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color;
}

function buildMerchantSuggestions(merchants: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return merchants.slice(0, 12);
  return merchants
    .filter((merchant) => merchant.toLowerCase().includes(normalizedQuery))
    .slice(0, 12);
}
