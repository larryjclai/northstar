import {
  ArrowsLeftRight,
  CalendarBlank,
  Check,
  CopySimple,
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
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";
import { CategoriesTab } from "./CategoriesTab";
import { MerchantsTab } from "./MerchantsTab";
import { RecurringRulesTab } from "./RecurringRulesTab";
import { DateScopeControl } from "../components/DateScopeControl";
import { AccountFilter } from "../components/AccountFilter";
import { AppSelect } from "../components/AppSelect";
import { CategoryFilter } from "../components/CategoryFilter";
import { NumberField } from "../components/NumberField";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { Glyph } from "../lib/icons";
import { readableTextColor } from "../lib/color";
import { SegmentedControl } from "../components/SegmentedControl";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { DatePicker } from "../components/ui/date-picker";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { useToast } from "../components/Toast";
import type { LedgerDraft, TransferDraft } from "../data/repositories";
import { buildLedgerSuggestions, buildMerchantCategoryMap, buildOutstandingSettlements, evaluateAmountExpression, formatNumber, installmentLabel, isNeutralLedgerRow, isWithinDateScope, makeDefaultDateScope, nextRecurringDate, nowAsDatetimeLocal, recurringFrequencyLabels, resolveDateScope, todayInTimezone } from "../domain";
import { convertCurrency, formatCompactNumber } from "../domain/currency";
import type { Account, LedgerTransaction, RecurringFrequency, RecurringTransaction } from "../domain";
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

const TYPE_ORDER: CashType[] = ["expense", "income", "ar", "ap", "transfer"];
const RECURRING_OPTIONS = [
  { value: "none", label: "單次交易（不重複）" },
  { value: "weekly", label: "每週" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
];

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
    counterAccountId: null,
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
  const { accounts, ledger, recurring, settings, dailyFxRates, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyLedger = useMemo(() => makeEmptyLedger(timezone), [timezone]);
  const emptyTransfer = useMemo(() => makeEmptyTransfer(timezone), [timezone]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<CashType>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurringRuleId, setEditingRecurringRuleId] = useState<string | null>(null);
  // When editing a recurring-rule occurrence, the pending edit waits here while
  // the user picks the scope (this / future / all).
  const [recurringEditPrompt, setRecurringEditPrompt] = useState<(LedgerDraft & { id: string }) | null>(null);
  // A receivable/payable awaiting its settle-account choice.
  const [settlePrompt, setSettlePrompt] = useState<LedgerTransaction | null>(null);
  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState("none");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [installmentPeriods, setInstallmentPeriods] = useState(0);
  // Installment delete prompt: the row whose delete button was pressed, used to
  // show the three-option chooser (this period / this and later / whole group).
  const [installmentDeletePrompt, setInstallmentDeletePrompt] = useState<LedgerTransaction | null>(null);

  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  const [amountExpression, setAmountExpression] = useState(String(Math.abs(emptyLedger.amount)));
  const [entryDisplayCurrency, setEntryDisplayCurrency] = useState(emptyLedger.currency);
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [counterparty, setCounterparty] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const toast = useToast();
  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "month"));
  // `?account=<id>` deep-link from the Accounts page pre-selects that account.
  const { account: accountParam } = useSearch({ strict: false }) as { account?: string };
  const [selectedAccount, setSelectedAccount] = useState(accountParam ?? "all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "categories" | "merchants" | "recurring">("overview");
  // Cashflow chart bucketing granularity (日/週/月/年).
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("day");
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const navigate = useNavigate();

  // Follow the deep-link param if it changes after mount (e.g. clicking a
  // different account while the ledger is already open).
  useEffect(() => {
    if (accountParam) setSelectedAccount(accountParam);
  }, [accountParam]);

  useEffect(() => {
    if (dateScope.preset !== "month" && chartGranularity === "day") setChartGranularity("week");
  }, [dateScope.preset, chartGranularity]);

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
  const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);

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
  const applyRecurringEdit = useRepositoryMutation(
    (repository, input: { id: string; scope: import("../data/repositories").RecurringEditScope; draft: LedgerDraft }) =>
      repository.applyRecurringScopeEdit(input.id, input.scope, input.draft),
    ["ledger", "accounts", "recurring"],
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
  const createInstallmentPlan = useRepositoryMutation(
    (repository, input: { draft: LedgerDraft; periods: number }) =>
      repository.createInstallmentPlan(input.draft, input.periods),
    ["ledger", "accounts"],
  );
  const deleteInstallmentPlan = useRepositoryMutation(
    (repository, input: { groupId: string; fromIndex?: number }) =>
      repository.deleteInstallmentPlan(input.groupId, input.fromIndex !== undefined ? { fromIndex: input.fromIndex } : undefined),
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
    // Always default a fresh entry to a one-off transaction. The control is
    // component-level state, so without this reset it would "stick" to whatever
    // recurrence the previous entry used.
    setDrawerRecurringFreq("none");
    setInstallmentPeriods(0);
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
    setInstallmentPeriods(0);
    setMessage("");
  }

  function changeType(next: CashType) {
    setDrawerType(next);
    if (next === "transfer") {
      setTransferForm({ ...emptyTransfer, date: nowAsDatetimeLocal(timezone) });
    } else {
      const toRp = next === "ar" || next === "ap";
      setLedgerForm((current) => ({
        ...current,
        entryType: entryTypeFor(next),
        settlementStatus: settlementFor(next),
        // Receivable/payable pick their settle account at 結清 time, so clear any
        // account carried over from an expense/income draft.
        accountId: toRp ? "" : current.accountId,
        // 代墊 counter account only applies to 應收/應付; clear it otherwise.
        counterAccountId: toRp ? current.counterAccountId ?? null : null,
      }));
    }
  }

  function cashTypeFromRow(row: LedgerTransaction): CashType {
    if (row.entryType === "transfer") return "transfer";
    return row.settlementStatus === "receivable"
      ? "ar"
      : row.settlementStatus === "payable"
        ? "ap"
        : row.entryType === "income"
          ? "income"
          : "expense";
  }

  function startEdit(row: LedgerTransaction) {
    const type = cashTypeFromRow(row);
    setDrawerType(type);
    setEditingId(row.id);
    setCounterparty(row.settlementStatus === "settled" ? "" : row.merchant);
    setDueDate("");
    setLedgerForm({
      accountId: row.accountId,
      counterAccountId: row.counterAccountId ?? null,
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
    setInstallmentPeriods(0);
    setEditingRecurringRuleId(row.recurringRuleId ?? null);
    setMessage("");
    setDrawerOpen(true);
  }

  function startDuplicate(row: LedgerTransaction, transferPair?: { source: LedgerTransaction; dest: LedgerTransaction }) {
    const type = cashTypeFromRow(row);
    setDrawerType(type);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setDrawerRecurringFreq("none");
    setCounterparty(row.settlementStatus === "settled" ? "" : row.merchant);
    setDueDate("");
    setMessage("");

    if (type === "transfer") {
      const source = transferPair?.source ?? row;
      const dest = transferPair?.dest;
      setTransferForm({
        date: source.date,
        sourceAccountId: source.accountId,
        destinationAccountId: dest?.accountId ?? "",
        sourceCurrency: source.currency,
        destinationCurrency: dest?.currency ?? source.currency,
        sourceAmount: Math.abs(source.amount),
        destinationAmount: Math.abs(dest?.amount ?? source.amount),
        note: source.note,
        feeAmount: 0,
      });
    } else {
      setLedgerForm({
        accountId: row.accountId,
        counterAccountId: row.counterAccountId ?? null,
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
        feeAmount: 0,
      });
      setEntryDisplayCurrency(row.originalCurrency ?? row.currency);
      setAmountExpression(String(Math.abs(row.originalAmount ?? row.amount)));
    }
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
        // 代墊 counter account only applies to 應收/應付.
        counterAccountId: isReceivablePayable ? (ledgerForm.counterAccountId || null) : null,
        amount: signedAmount,
        originalAmount,
        originalCurrency,
        name: ledgerForm.name.trim() || (isReceivablePayable ? counterparty.trim() : ""),
        category: ledgerForm.category.trim(),
        subcategory: ledgerForm.subcategory.trim(),
        merchant: (isReceivablePayable ? counterparty : ledgerForm.merchant).trim(),
        note,
        // Fees attach to newly-created income/expense rows; the repo emits a
        // linked 手續費 expense leg. Edits never carry a fee (consistent with
        // transfer behaviour: re-editing can't retroactively add fee legs).
        feeAmount: !editingId && (entryType === "expense" || entryType === "income") ? (ledgerForm.feeAmount || 0) : 0,
      };
      // Expense/income/transfer need an account up front; receivable/payable
      // defer the settle account to 結清 time (only the optional 代墊 account
      // may be set now).
      if (!isReceivablePayable && !payload.accountId) throw new Error("請選擇帳戶。");
      if (isReceivablePayable && !payload.merchant) throw new Error("請填寫對象。");
      if (editingId) {
        // Editing an occurrence generated by a recurring rule → ask the user
        // whether the change applies to this one, future ones, or all of them.
        if (editingRecurringRuleId) {
          setRecurringEditPrompt({ ...payload, id: editingId });
          return;
        }
        await updateLedger.mutateAsync({ ...payload, id: editingId });
        toast.success("已更新交易");
        if (drawerRecurringFreq !== "none") {
          const frequency = drawerRecurringFreq as RecurringFrequency;
          const dayOfMonth = parseInt(payload.date.slice(8, 10));
          await createRecurring.mutateAsync({
             frequency,
             dayOfMonth,
             accountId: payload.accountId,
             counterAccountId: payload.counterAccountId ?? null,
             amount: payload.amount,
             currency: payload.currency,
             category: payload.category,
             subcategory: payload.subcategory,
             merchant: payload.merchant,
             entryType: payload.entryType as "income" | "expense",
             settlementStatus: payload.settlementStatus,
             note: payload.note,
             nextRunDate: nextRecurringDate(payload.date.slice(0, 10), frequency, dayOfMonth),
             isActive: true
          });
          toast.success("已建立週期規則");
        }
      } else if (installmentPeriods >= 2) {
        await createInstallmentPlan.mutateAsync({ draft: payload, periods: installmentPeriods });
        toast.success(`已建立 ${installmentPeriods} 期分期計畫`);
      } else {
        await createLedger.mutateAsync(payload);
        toast.success("已新增交易");
        if (drawerRecurringFreq !== "none") {
          const frequency = drawerRecurringFreq as RecurringFrequency;
          const dayOfMonth = parseInt(payload.date.slice(8, 10));
          await createRecurring.mutateAsync({
             frequency,
             dayOfMonth,
             accountId: payload.accountId,
             counterAccountId: payload.counterAccountId ?? null,
             amount: payload.amount,
             currency: payload.currency,
             category: payload.category,
             subcategory: payload.subcategory,
             merchant: payload.merchant,
             entryType: payload.entryType as "income" | "expense",
             settlementStatus: payload.settlementStatus,
             note: payload.note,
             nextRunDate: nextRecurringDate(payload.date.slice(0, 10), frequency, dayOfMonth),
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

  async function applyRecurringScope(scope: import("../data/repositories").RecurringEditScope) {
    if (!recurringEditPrompt) return;
    const { id, ...draft } = recurringEditPrompt;
    try {
      await applyRecurringEdit.mutateAsync({ id, scope, draft });
      toast.success(scope === "this" ? "已更新此筆" : scope === "future" ? "已更新此筆與未來" : "已更新全部");
      await rememberCategories.mutateAsync([{ category: draft.category, subcategory: draft.subcategory }]);
      rememberMerchantNames([draft.merchant]);
      setRecurringEditPrompt(null);
      closeDrawer();
    } catch (error) {
      setRecurringEditPrompt(null);
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

  function requestDelete(row: LedgerTransaction) {
    if (row.installmentGroupId) {
      setInstallmentDeletePrompt(row);
    } else {
      void handleDelete(row.id);
    }
  }

  async function handleInstallmentDelete(mode: "this" | "later" | "all") {
    if (!installmentDeletePrompt) return;
    const row = installmentDeletePrompt;
    setInstallmentDeletePrompt(null);
    try {
      if (mode === "this") {
        await deleteLedger.mutateAsync(row.id);
        toast.success("已刪除此期分期");
      } else if (mode === "later") {
        await deleteInstallmentPlan.mutateAsync({ groupId: row.installmentGroupId!, fromIndex: row.installmentIndex ?? undefined });
        toast.success("已刪除此期與之後的分期");
      } else {
        await deleteInstallmentPlan.mutateAsync({ groupId: row.installmentGroupId! });
        toast.success("已刪除整組分期");
      }
    } catch (e) {
      toast.error("刪除失敗");
    }
  }

  // The settle account is only known now (the counterparty has paid), so ✓
  // opens a chooser instead of settling immediately.
  function markSettled(row: LedgerTransaction) {
    setSettlePrompt(row);
  }

  async function confirmSettle(settleAccountId: string) {
    if (!settlePrompt) return;
    const row = settlePrompt;
    const account = accountRows.find((a) => a.id === settleAccountId);
    try {
      await updateLedger.mutateAsync({
        id: row.id,
        accountId: settleAccountId,
        counterAccountId: row.counterAccountId ?? null,
        date: row.date,
        name: row.name,
        amount: row.amount,
        // The money actually lands in this account, so adopt its currency to keep
        // the balance maths consistent (most AR/AP is single-currency anyway).
        currency: account?.currency ?? row.currency,
        category: row.category,
        subcategory: row.subcategory,
        merchant: row.merchant,
        entryType: row.entryType,
        settlementStatus: "settled",
        note: row.note,
      });
      toast.success(row.settlementStatus === "receivable" ? "已收款結清" : "已付款結清");
      setSettlePrompt(null);
    } catch (error) {
      setSettlePrompt(null);
      toast.error(error instanceof Error ? error.message : "結清失敗");
    }
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseLedgerCsv(await file.text(), accountFor));
    event.target.value = "";
  }

  const scopedRows = useMemo(() => ledgerRows.filter((row) => {
    if (!isWithinDateScope(row.date, dateRange)) return false;
    if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
    if (selectedCategory !== "all" && row.category !== selectedCategory) return false;
    return true;
  }), [ledgerRows, dateRange, selectedAccount, selectedCategory]);
  const activityRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return scopedRows;
    return scopedRows.filter((row) => [
      row.name,
      row.merchant,
      row.category,
      row.subcategory,
      row.note,
      accountName(row.accountId),
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [scopedRows, searchQuery, accountRows]);
  const periodIncome = scopedRows
    .filter((row) => row.entryType === "income" && row.settlementStatus === "settled" && !isNeutralLedgerRow(row))
    .reduce((sum, row) => sum + Math.max(0, toPrimary(row) ?? 0), 0);
  const periodExpense = scopedRows
    .filter((row) => row.entryType === "expense" && row.settlementStatus === "settled" && !isNeutralLedgerRow(row))
    // Signed: expense amounts are negative, so −amount is positive spend; a
    // refund (positive-amount expense) nets back out instead of adding.
    .reduce((sum, row) => sum - (toPrimary(row) ?? 0), 0);
  const periodNet = periodIncome - periodExpense;
  const periodTransferCount = new Set(scopedRows.filter((row) => row.entryType === "transfer").map((row) => row.groupId ?? row.id)).size;
  const missingFx = [...new Set(scopedRows
    .filter((row) => !isNeutralLedgerRow(row) && row.settlementStatus === "settled" && toPrimary(row) === null)
    .map((row) => `${row.currency} → ${primaryCurrency}`))];

  // Category spending for donut chart (all categories, not just top 5)
  const allCategorySpend = useMemo(() => {
    const map = new Map<string, number>();
    // Use unfiltered-by-category rows for the donut so it always shows all categories
    const baseRows = ledgerRows.filter((row) => {
      if (!isWithinDateScope(row.date, dateRange)) return false;
      if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
      return true;
    });
    for (const row of baseRows) {
      if (row.entryType !== "expense" || row.settlementStatus !== "settled" || isNeutralLedgerRow(row)) continue;
      const key = row.category || "未分類";
      // Signed (−amount): refunds net against the category they refund.
      map.set(key, (map.get(key) ?? 0) - (toPrimary(row) ?? 0));
    }
    const defaultColors = ["var(--ns-chart-1)","var(--ns-chart-2)","var(--ns-chart-3)","var(--ns-chart-4)","var(--ns-chart-5)","#2dd4bf","#fb923c","#a78bfa","#f472b6","#facc15"];
    return [...map.entries()]
      // A category can net negative if refunds exceed spend in the period;
      // hide it from the spend donut rather than drawing a negative slice.
      .filter(([, amount]) => amount > 0)
      .map(([name, amount], idx) => {
        const catSetting = appSettings?.categories.find(c => c.name === name);
        return { name, amount, color: catSetting?.color || defaultColors[idx % defaultColors.length], icon: catSetting?.iconName || 'Tag' };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [ledgerRows, dateRange, selectedAccount, appSettings, toPrimary]);

  const totalCategorySpend = allCategorySpend.reduce((s, c) => s + c.amount, 0);

  const topCategorySpend = useMemo(() => allCategorySpend.slice(0, 5), [allCategorySpend]);

  const topMerchantSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of scopedRows) {
      if (row.entryType !== "expense" || row.settlementStatus !== "settled" || !row.merchant || isNeutralLedgerRow(row)) continue;
      // Signed (−amount): refunds net against the merchant they refund.
      map.set(row.merchant, (map.get(row.merchant) ?? 0) - (toPrimary(row) ?? 0));
    }
    return [...map.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [scopedRows, toPrimary]);

  // Cashflow chart data: per-bucket income + expense as side-by-side bars, plus
  // a running cumulative net across the period (drawn on a secondary axis).
  // The granularity (日/週/月/年) controls both bucket size and the visible
  // window, anchored to the selected month. Respects the account/category
  // filters; transfers and pass-through rows are excluded (neutral movements).
  const cashflowBars = useMemo(() => {
    const rows = ledgerRows.filter((row) => {
      if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
      if (selectedCategory !== "all" && row.category !== selectedCategory) return false;
      if (row.settlementStatus !== "settled") return false;
      if (isNeutralLedgerRow(row)) return false;
      return row.entryType === "income" || row.entryType === "expense";
    });
    const slots = buildCashflowBuckets(chartGranularity, dateRange).map((b) => ({
      ...b, income: 0, expense: 0, net: 0, cumulativeNet: 0,
    }));
    const byKey = new Map(slots.map((s) => [s.key, s]));
    for (const row of rows) {
      const slot = byKey.get(cashflowBucketKey(chartGranularity, row.date));
      if (!slot) continue;
      const value = toPrimary(row) ?? 0;
      // value is signed (expense negative). Both bars grow upward, so expense
      // is its positive magnitude; a refund (positive expense) nets it down.
      if (row.entryType === "income") slot.income += Math.max(0, value);
      else slot.expense += -value;
    }
    // Cumulative net = running total of (income − expense) across the window,
    // so the line shows the period's savings trajectory rather than echoing
    // the per-bucket bars.
    let running = 0;
    for (const s of slots) {
      s.net = s.income - s.expense;
      running += s.net;
      s.cumulativeNet = running;
    }
    return slots;
  }, [ledgerRows, selectedAccount, selectedCategory, chartGranularity, dateRange, toPrimary]);


  const [page, setPage] = useState(1);
  const pageSize = 50;
  
  useEffect(() => {
    setPage(1);
  }, [dateRange, selectedAccount, selectedCategory, searchQuery]);
  
  const sortedRows = useMemo(

    () => [...ledgerRows].sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows],
  );

  const displayRows = useMemo(() => mergeTransferRows(activityRows, ledgerRows), [activityRows, ledgerRows]);
  const totalPages = Math.ceil(displayRows.length / pageSize);
  const paginatedRows = useMemo(() => displayRows.slice((page - 1) * pageSize, page * pageSize), [displayRows, page]);
  const dayGroups = useMemo(() => groupByDay(paginatedRows, toPrimary), [paginatedRows, toPrimary]);

  const periodLabel = dateRange.label;

  // Unsettled receivables / payables (respecting the account filter).
  const settlements = useMemo(
    () => buildOutstandingSettlements(
      selectedAccount === "all" ? ledgerRows : ledgerRows.filter((r) => r.accountId === selectedAccount),
      (amount, currency) => convertCurrency(amount, currency, primaryCurrency, appSettings, { dailyRates: fxHistory }) ?? amount,
    ),
    [ledgerRows, selectedAccount, appSettings, fxHistory, primaryCurrency],
  );

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Skeleton className="h-[200px]" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[320px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px]" style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{periodLabel}</div>
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
            記帳
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsv} />
          <DateScopeControl value={dateScope} onChange={setDateScope} />

          <AccountFilter accounts={accountRows} value={selectedAccount} onChange={setSelectedAccount} className="text-body" style={{ minWidth: 116 }} />

          <CategoryFilter categories={categories} value={selectedCategory} onChange={setSelectedCategory} />

          <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap" onClick={() => csvInputRef.current?.click()}>
            <UploadSimple size={14} />匯入 CSV
          </Button>
          <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap" onClick={() => downloadCsv("northstar-ledger.csv", exportLedgerCsv(scopedRows, accountName))}>
            <DownloadSimple size={14} />匯出 CSV
          </Button>
          <Button className="h-9 sm:h-9 whitespace-nowrap" onClick={() => openCreate("expense")}>
            <Plus size={14} weight="bold" />記一筆
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--ns-border)', marginBottom: 24, overflowX: "auto" }}>
        {[
          { id: 'overview', label: '交易' },
          { id: 'categories', label: '分類' },
          { id: 'merchants', label: '商家' },
          { id: 'recurring', label: '週期規則' },
        ].map(t => (
          <button key={t.id} className="text-sm" onClick={() => setActiveTab(t.id as any)} style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: "nowrap",
            fontFamily: 'inherit', fontWeight: activeTab === t.id ? 600 : 400,
            color: activeTab === t.id ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
            borderBottom: activeTab === t.id ? '2px solid var(--ns-accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.12s',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {missingFx.length > 0 ? (
            <Card className="text-body" style={{ padding: "10px 14px", marginBottom: 14, color: "var(--ns-neg)" }}>
              總額不完整：缺少匯率 {missingFx.join("、")}。請至設定更新匯率；原幣交易仍會保留。
            </Card>
          ) : null}
          {/* Outstanding receivables / payables reminder */}
          {settlements.items.length > 0 ? (
            <Card style={{ padding: "12px 16px", marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span className="ns-eyebrow">未結清</span>
              {settlements.receivableTotal > 0 ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收 {settlements.receivableCount}</Badge>
                  <span className="num text-[15px]" style={{ color: "var(--ns-pos)" }}>+{primaryCurrency} {formatNumber(settlements.receivableTotal)}</span>
                </div>
              ) : null}
              {settlements.payableTotal > 0 ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付 {settlements.payableCount}</Badge>
                  <span className="num text-[15px]" style={{ color: "var(--ns-neg)" }}>−{primaryCurrency} {formatNumber(settlements.payableTotal)}</span>
                </div>
              ) : null}
              <span className="muted text-xs" style={{ marginLeft: "auto" }}>結清後會計入收支 · 在下方明細點 ✓ 結清</span>
            </Card>
          ) : null}
          {/* Summary layer — single column on phones (the chart + category cards
              stack), 2-up only from lg. The old fixed `minmax(0,1fr) 320px` grid
              had no breakpoint, so on a phone the 320px column crushed the chart
              card to a few px and the two cards jammed together. */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ marginBottom: 20 }}>
        {/* Cashflow Chart */}
        <Card id="cashflow-chart" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>現金流 · Net</div>
              <div className={"ns-num-lg " + (periodNet >= 0 ? "pos" : "neg")}>
                {periodNet >= 0 ? "+" : "−"}{primaryCurrency} {formatNumber(Math.abs(periodNet))}
              </div>
            </div>
            <div style={{ flex: 1 }}/>
            {/* Income / Spending / Savings — 儲蓄率 hero + secondary 收入/支出 pair */}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              {/* Hero: 儲蓄率 */}
              <div className="ns-surface" style={{ padding: "10px 14px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 104 }}>
                <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 2 }}>儲蓄率</div>
                <div
                  className={"num " + (periodIncome > 0 && periodNet >= 0 ? "pos" : "muted")}
                  style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", lineHeight: 1.1 }}
                >
                  {periodIncome > 0 ? `${((periodNet / periodIncome) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
              {/* Secondary: 收入 / 支出 stacked compact */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
                  <span className="muted text-caption" style={{ minWidth: 28 }}>收入</span>
                  <span className="num pos text-caption" style={{ fontWeight: 500 }}>{primaryCurrency} {formatNumber(periodIncome)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
                  <span className="muted text-caption" style={{ minWidth: 28 }}>支出</span>
                  <span className="num neg text-caption" style={{ fontWeight: 500 }}>{primaryCurrency} {formatNumber(periodExpense)}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Legend + 日/週/月/年 granularity selector */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {([
                { label: "收入", color: "var(--ns-pos)" },
                { label: "支出", color: "var(--ns-neg)" },
              ]).map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                  <span className="muted text-caption">{l.label}</span>
                </div>
              ))}
              {/* Cumulative-net line legend uses a horizontal stroke */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 2, background: "var(--ns-accent)", flexShrink: 0, borderRadius: 1 }} />
                <span className="muted text-caption">累積淨額</span>
              </div>
            </div>
            <SegmentedControl value={chartGranularity} options={CHART_GRANULARITY_OPTIONS} onChange={setChartGranularity} />
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* Grouped income/expense bars (left axis) + a cumulative-net line
                  on a secondary right axis so the running total doesn't get
                  squashed by the per-bucket bar scale. */}
              <ComposedChart data={cashflowBars} margin={{ top: 6, right: 6, bottom: 0, left: 4 }} barCategoryGap={chartGranularity === "day" ? "12%" : "24%"} barGap={2}>
                {/* Left axis: per-bucket bar magnitudes */}
                <YAxis
                  yAxisId="bars"
                  width={44}
                  tick={{ fontSize: 10.5, fill: resolveColor("var(--ns-fg-dim)") }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompactNumber(Math.abs(v as number))}
                />
                {/* Right axis: cumulative net (can go negative) */}
                <YAxis
                  yAxisId="cum"
                  orientation="right"
                  width={44}
                  tick={{ fontSize: 10.5, fill: resolveColor("var(--ns-accent)") }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompactNumber(v as number)}
                />
                <ReferenceLine yAxisId="cum" y={0} stroke={resolveColor("var(--ns-border-strong)")} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10.5, fill: resolveColor("var(--ns-fg-dim)") }}
                  tickLine={false}
                  axisLine={false}
                  interval={chartGranularity === "day" ? 3 : 0}
                  minTickGap={4}
                />
                <Tooltip
                  cursor={{ fill: resolveColor("var(--ns-bg-hover)") }}
                  contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any, name: any) => {
                    const labelMap: Record<string, string> = { income: "收入", expense: "支出", cumulativeNet: "累積淨額" };
                    const val = v as number;
                    // Cumulative net shows explicit sign; bars show their magnitude.
                    const display = name === "cumulativeNet"
                      ? `${val >= 0 ? "+" : "−"}${primaryCurrency} ${formatNumber(Math.abs(val))}`
                      : `${primaryCurrency} ${formatNumber(Math.abs(val))}`;
                    return [display, labelMap[name] ?? name];
                  }}
                  labelFormatter={(v) => String(v)}
                />
                {/* Side-by-side bars (no stackId → grouped), both grow upward */}
                <Bar yAxisId="bars" dataKey="income" fill="var(--ns-pos)" radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="bars" dataKey="expense" fill="var(--ns-neg)" radius={[2, 2, 0, 0]} maxBarSize={18} />
                {/* Cumulative net trajectory across the period */}
                <Line yAxisId="cum" dataKey="cumulativeNet" stroke="var(--ns-accent)" strokeWidth={1.75} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="ns-eyebrow">分類支出 · {periodLabel}</div>
            {selectedCategory !== "all" && (
              <Button variant="ghost" size="xs" onClick={() => setSelectedCategory("all")}>
                <X size={10} weight="bold" />清除篩選
              </Button>
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
                    <div className="text-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Glyph name={r.icon} size={14} />
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                      <span className="num muted text-xs">
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
            <div className="muted text-body" style={{ textAlign: "center", padding: "30px 0" }}>本月尚無支出</div>
          )}
        </Card>
      </div>

      {preview ? (
        <Card style={{ marginBottom: 16, padding: "var(--ns-pad-card)" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
          </div>
          {preview.invalid.map((item) => (
            <div key={item.row} className="text-body" style={{ color: "var(--ns-neg)" }}>Row {item.row}: {item.reason}</div>
          ))}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Button
              onClick={async () => {
                const rows = preview.valid.map((item) => item.value);
                await importLedger.mutateAsync(rows);
                rememberMerchantNames(rows.map((row) => row.merchant));
                setPreview(null);
                toast.success(`成功匯入 ${rows.length} 筆資料`);
              }}
            >
              確認匯入
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)}>取消</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* Transactions grouped by day */}
        <Card style={{ padding: 0 }}>
           <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--ns-border)" }}>
             <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
               <span className="text-[15px]" style={{ fontWeight: 600 }}>近期動態</span>
               <span className="muted text-xs">{displayRows.length} 筆</span>
             </div>
             {/* Search on its own row below the title (B9). */}
             <label style={{ position: "relative", display: "block", marginTop: 10 }}>
               <MagnifyingGlass size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ns-muted)" }} />
               <input className="ns-input text-xs" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋商家、分類或備註" style={{ width: "100%", height: 34, padding: "0 12px 0 30px" }} />
             </label>
           </div>

           {dayGroups.length === 0 ? (
            <div style={{ padding: "56px 20px", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Receipt size={24} weight="duotone" />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒有記帳資料</div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => openCreate("expense")}><Plus size={14} weight="bold" />新增交易</Button>
                <Button variant="outline" onClick={() => csvInputRef.current?.click()}><UploadSimple size={14} />匯入 CSV</Button>
              </div>
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
                  <span className="dim mono text-caption">
                    Net <span className={g.net >= 0 ? "pos" : "neg"}>
                      {(g.net >= 0 ? "+" : "−")}{primaryCurrency} {formatNumber(Math.abs(g.net))}
                    </span>
                  </span>
                </div>
                {g.rows.map((r, i) => {
                  const catGroup = appSettings?.categories.find((c) => c.name === r.category);
                  return (
                    <LedgerRow
                      key={r.id}
                      row={r}
                      transferPair={r.transferPair}
                      accountName={accountName}
                      categoryIcon={catGroup?.iconName || undefined}
                      onEdit={() => setDetailRow(r)}
                      onOpenEdit={() => startEdit(r)}
                      onDuplicate={() => startDuplicate(r, r.transferPair)}
                      onDelete={() => requestDelete(r)}
                      onSettle={() => markSettled(r)}
                    />
                  );
                })}
              </div>
            ))
           )}
        </Card>

        {/* Side rankings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <RankingCard title="商家花費排行" rows={topMerchantSpend} emptyText="此期間尚無商家資料" currency={primaryCurrency} />
          <UpcomingPayments recurringRows={recurringRows} accountName={accountName} onPost={async (id) => { try { await postRecurring.mutateAsync(id); toast.success("已記入交易"); } catch { toast.error("記入失敗"); } }} posting={postRecurring.isPending} />
        </div>
      </div>
      </>
      )}

      {activeTab === "categories" && (
        <CategoriesTab dateRange={dateRange} ledgerRows={ledgerRows} appSettings={appSettings} primaryCurrency={primaryCurrency} toPrimary={toPrimary} onSettingsClick={() => setCategoryDrawerOpen(true)} />
      )}

      {activeTab === "merchants" && (
        <MerchantsTab dateRange={dateRange} ledgerRows={ledgerRows} primaryCurrency={primaryCurrency} toPrimary={toPrimary} />
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
        installmentPeriods={installmentPeriods}
        setInstallmentPeriods={setInstallmentPeriods}
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
        onDuplicate={(row) => { setDetailRow(null); startDuplicate(row, (row as LedgerTransaction & { transferPair?: { source: LedgerTransaction; dest: LedgerTransaction } }).transferPair); }}
        onDelete={(row) => { setDetailRow(null); requestDelete(row); }}
        accountName={accountName}
        recurringRows={recurringRows}
        onRefund={async (row, refundAmount, refundDate, refundNote) => {
          // A refund is a positive-amount expense linked to the original row.
          // It nets against the same category's spend instead of inflating
          // income (see assertLedgerInvariants + refundOfLedgerId).
          await createLedger.mutateAsync({
            accountId: row.accountId,
            counterAccountId: null,
            date: refundDate,
            name: `${row.name || row.category || "支出"} 退款`,
            amount: Math.abs(refundAmount),
            currency: row.currency,
            originalAmount: null,
            originalCurrency: null,
            category: row.category,
            subcategory: row.subcategory,
            merchant: row.merchant,
            entryType: "expense",
            settlementStatus: "settled",
            note: refundNote,
            refundOfLedgerId: row.id,
          });
          setDetailRow(null);
        }}
      />
      {recurringEditPrompt && (
        <RecurringScopeModal
          pending={applyRecurringEdit.isPending}
          onCancel={() => setRecurringEditPrompt(null)}
          onChoose={applyRecurringScope}
        />
      )}
      {installmentDeletePrompt && (
        <InstallmentDeleteModal
          row={installmentDeletePrompt}
          pending={deleteLedger.isPending || deleteInstallmentPlan.isPending}
          onCancel={() => setInstallmentDeletePrompt(null)}
          onChoose={handleInstallmentDelete}
        />
      )}
      {settlePrompt && (
        <SettleModal
          row={settlePrompt}
          accounts={accountRows}
          pending={updateLedger.isPending}
          onCancel={() => setSettlePrompt(null)}
          onConfirm={confirmSettle}
        />
      )}
    </div>
  );
}

/* ─────────── Receivable/payable settle-account chooser ─────────── */

function SettleModal({
  row,
  accounts,
  pending,
  onCancel,
  onConfirm,
}: {
  row: LedgerTransaction;
  accounts: Account[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (accountId: string) => void;
}) {
  const isReceivable = row.settlementStatus === "receivable";
  const [accountId, setAccountId] = useState(row.accountId || "");
  const amountLabel = `${currencySymbol(row.currency)}${formatNumber(Math.abs(row.amount))}`;
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)", padding: 20 }}
      >
        <div className="text-[15px]" style={{ fontWeight: 600, marginBottom: 4 }}>{isReceivable ? "收款結清" : "付款結清"}</div>
        <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          {row.merchant || row.name || (isReceivable ? "應收款項" : "應付款項")} · {amountLabel}
          <br />
          {isReceivable ? "款項實際收到哪個帳戶？" : "從哪個帳戶付款？"}
        </div>
        <DrawerField label={isReceivable ? "收款帳戶" : "付款帳戶"} required>
          <AccountFilter
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            allowAll={false}
            placeholder="選擇帳戶"
            style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
          />
        </DrawerField>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
          <Button onClick={() => accountId && onConfirm(accountId)} disabled={pending || !accountId}>
            <Check size={14} weight="bold" />結清
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Recurring edit scope chooser ─────────── */

function RecurringScopeModal({
  pending,
  onCancel,
  onChoose,
}: {
  pending: boolean;
  onCancel: () => void;
  onChoose: (scope: import("../data/repositories").RecurringEditScope) => void;
}) {
  const options: { scope: import("../data/repositories").RecurringEditScope; label: string; desc: string }[] = [
    { scope: "this", label: "只改此次紀錄", desc: "僅更新這一筆，不影響規則與其他紀錄。" },
    { scope: "future", label: "此次與未來紀錄", desc: "更新這一筆，並修改週期規則（影響日後產生的紀錄）。" },
    { scope: "all", label: "全部紀錄（過去＋現在＋未來）", desc: "更新規則與所有已產生的紀錄（保留各自日期）。" },
  ];
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)", padding: 20 }}
      >
        <div className="text-[15px]" style={{ fontWeight: 600, marginBottom: 4 }}>套用變更範圍</div>
        <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginBottom: 16 }}>這是由週期規則產生的紀錄，請選擇要套用的範圍。</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o) => (
            <button
              key={o.scope}
              disabled={pending}
              onClick={() => onChoose(o.scope)}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: "var(--ns-r-md)",
                border: "1px solid var(--ns-border)", background: "var(--ns-bg-card)",
                cursor: pending ? "default" : "pointer", fontFamily: "inherit", opacity: pending ? 0.6 : 1,
              }}
            >
              <div className="text-body" style={{ fontWeight: 500, color: "var(--ns-fg)" }}>{o.label}</div>
              <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginTop: 3, lineHeight: 1.5 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Installment delete scope chooser ─────────── */

function InstallmentDeleteModal({
  row,
  pending,
  onCancel,
  onChoose,
}: {
  row: LedgerTransaction;
  pending: boolean;
  onCancel: () => void;
  onChoose: (mode: "this" | "later" | "all") => void;
}) {
  const label = installmentLabel(row);
  const options: { mode: "this" | "later" | "all"; label: string; desc: string }[] = [
    { mode: "this", label: "僅刪除此期", desc: "只刪除這一期分期紀錄，其餘各期保留。" },
    { mode: "later", label: "此期與之後", desc: `刪除第 ${row.installmentIndex ?? "?"} 期及之後所有未到期的分期紀錄。` },
    { mode: "all", label: "整組分期", desc: "刪除這筆購物的全部分期紀錄（共 " + (row.installmentTotal ?? "?") + " 期）。" },
  ];
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)", padding: 20 }}
      >
        <div className="text-[15px]" style={{ fontWeight: 600, marginBottom: 4 }}>刪除分期紀錄</div>
        <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginBottom: 16 }}>
          {label ? `這是第 ${row.installmentIndex}/${row.installmentTotal} 期的分期紀錄，請選擇刪除範圍。` : "請選擇刪除範圍。"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o) => (
            <button
              key={o.mode}
              disabled={pending}
              onClick={() => onChoose(o.mode)}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: "var(--ns-r-md)",
                border: "1px solid var(--ns-border)", background: "var(--ns-bg-card)",
                cursor: pending ? "default" : "pointer", fontFamily: "inherit", opacity: pending ? 0.6 : 1,
              }}
            >
              <div className="text-body" style={{ fontWeight: 500, color: o.mode === "all" ? "var(--ns-neg)" : "var(--ns-fg)" }}>{o.label}</div>
              <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginTop: 3, lineHeight: 1.5 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Ledger row ─────────────── */

function LedgerRow({
  row,
  transferPair,
  accountName,
  categoryIcon,
  onEdit,
  onOpenEdit,
  onDuplicate,
  onDelete,
  onSettle,
}: {
  row: LedgerTransaction;
  /** When set, this row is a collapsed transfer (both legs) — render 來源 → 目標. */
  transferPair?: { source: LedgerTransaction; dest: LedgerTransaction };
  accountName: (id: string) => string;
  categoryIcon?: string;
  /** Row click → open the detail panel. */
  onEdit: () => void;
  /** Pencil → jump straight into edit mode (B10). */
  onOpenEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSettle: () => void;
}) {
  const isTransfer = row.entryType === "transfer";

  // Collapsed transfer: one row, 來源帳戶 → 目標帳戶, source outflow as the
  // headline figure plus the destination amount (and rate when cross-currency).
  if (isTransfer && transferPair) {
    const { source, dest } = transferPair;
    const crossCcy = source.currency !== dest.currency;
    const rate = crossCcy && dest.amount !== 0 ? Math.abs(source.amount) / Math.abs(dest.amount) : null;
    const subtitleParts = [
      `${accountName(source.accountId)} → ${accountName(dest.accountId)}`,
      rate ? `@${rate.toFixed(rate >= 100 ? 2 : 4).replace(/0+$/, "").replace(/\.$/, "")}` : null,
      source.note || null,
    ].filter(Boolean);
    return (
      <div
        className="ns-cf-row"
        onClick={onEdit}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--ns-border)", cursor: "pointer" }}
      >
        <div style={{ width: 34, height: 34, borderRadius: "var(--ns-r-sm)", flexShrink: 0, background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ArrowsLeftRight size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="text-sm" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              轉帳{crossCcy ? ` · ${source.currency} → ${dest.currency}` : ""}
            </span>
          </div>
          <div className="muted text-caption" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitleParts.join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num text-[14.5px]" style={{ color: "var(--ns-fg)" }}>{currencySymbol(source.currency)}{formatNumber(Math.abs(source.amount))}</div>
          {crossCcy ? (
            <div className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>→ {currencySymbol(dest.currency)}{formatNumber(Math.abs(dest.amount))}</div>
          ) : null}
        </div>
        <div className="ns-cf-actions" style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" title="複製" onClick={onDuplicate}><CopySimple size={13} /></Button>
          <Button variant="ghost" size="icon-sm" title="刪除" onClick={onDelete} style={{ color: "var(--ns-neg)" }}><Trash size={13} /></Button>
        </div>
      </div>
    );
  }

  const isReceivable = row.settlementStatus === "receivable";
  const isPayable = row.settlementStatus === "payable";
  const positive = row.amount >= 0;
  const color = isTransfer ? "var(--ns-fg)" : positive ? "var(--ns-pos)" : "var(--ns-neg)";
  const sign = isTransfer ? "" : positive ? "+" : "−";
  const subtitle = [
    row.category ? `${row.category}${row.subcategory ? ` / ${row.subcategory}` : ""}` : null,
    row.merchant || null,
    row.accountId ? accountName(row.accountId) : null,
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
        {isTransfer ? <ArrowsLeftRight size={15} /> : categoryIcon ? <Glyph name={categoryIcon} size={16} /> : <Tag size={15} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="text-sm" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {row.name || row.category || (isTransfer ? "轉帳" : "未命名")}
          </span>
          {isReceivable ? <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收</Badge> : null}
          {isPayable ? <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付</Badge> : null}
          {installmentLabel(row) ? <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>{installmentLabel(row)}</Badge> : null}
        </div>
        <div className="muted text-caption" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        {row.originalCurrency && row.originalAmount != null ? (
          <>
            <div className="num text-[14.5px]" style={{ color }}>{sign}{currencySymbol(row.originalCurrency)}{formatNumber(Math.abs(row.originalAmount))}</div>
            <div className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>≈ {currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
          </>
        ) : (
          <div className="num text-[14.5px]" style={{ color }}>{sign}{currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
        )}
      </div>
      <div className="ns-cf-actions" style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
        {(isReceivable || isPayable) ? (
          <Button variant="ghost" size="icon-sm" title="結清" onClick={onSettle}><Check size={14} /></Button>
        ) : null}
        {!isTransfer ? (
          <Button variant="ghost" size="icon-sm" title="編輯" onClick={onOpenEdit}><PencilSimple size={13} /></Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" title="複製" onClick={onDuplicate}><CopySimple size={13} /></Button>
        <Button variant="ghost" size="icon-sm" title="刪除" onClick={onDelete} style={{ color: "var(--ns-neg)" }}><Trash size={13} /></Button>
      </div>
    </div>
  );
}

/* ─────────────── Stat + ranking cards ─────────────── */

function StatCard({ label, value, tone }: { label: string; value: string; tone: "pos" | "neg" | "muted" }) {
  const color = tone === "pos" ? "var(--ns-pos)" : tone === "neg" ? "var(--ns-neg)" : "var(--ns-fg)";
  return (
    <Card style={{ padding: 18 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="num text-stat" style={{ fontWeight: 500, color }}>{value}</div>
    </Card>
  );
}

function RankingCard({ title, rows, emptyText, currency }: { title: string; rows: Array<{ name: string; amount: number }>; emptyText: string; currency: string }) {
  const max = rows[0]?.amount ?? 1;
  return (
    <Card style={{ padding: "var(--ns-pad-card)" }}>
      <div className="text-sm" style={{ fontWeight: 600, marginBottom: 14 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="muted text-body">{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((row) => (
            <div key={row.name}>
              <div className="text-body" style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
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
    </Card>
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
    <Card style={{ padding: "var(--ns-pad-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <CalendarBlank size={15} weight="duotone" style={{ color: "var(--ns-accent)" }} />
        <span className="text-sm" style={{ fontWeight: 600 }}>近 2 週固定收支</span>
      </div>
      {upcoming.length === 0 ? (
        <div className="muted text-body">近期沒有排定的週期事件。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {upcoming.map((row) => (
            <div key={row.id} className="text-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.merchant || row.category}</div>
                <div className="muted text-caption">{row.nextRunDate} · {accountName(row.accountId)}</div>
              </div>
              <span className="num" style={{ color: row.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)", whiteSpace: "nowrap" }}>
                {row.entryType === "income" ? "+" : "−"}{row.currency} {formatNumber(Math.abs(row.amount))}
              </span>
              <Button variant="ghost" size="xs" className="whitespace-nowrap" disabled={posting} onClick={() => onPost(row.id)} title="立即記入這筆交易">記入</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
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
  installmentPeriods,
  setInstallmentPeriods,
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
  accountRows: Array<Pick<Account, "id" | "name" | "currency" | "type" | "iconName" | "color">>;
  onSubmitLedger: () => void;
  onSubmitTransfer: () => void;
  message: string;
  drawerRecurringFreq: string;
  setDrawerRecurringFreq: (v: string) => void;
  editingRecurringRuleId: string | null;
  recurringRows: import("../domain").RecurringTransaction[];
  installmentPeriods: number;
  setInstallmentPeriods: (v: number) => void;
}) {
  const [amountFocused, setAmountFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => { if (open) setShowAdvanced(false); }, [open]);

  // Installment: valid when type=expense, account is credit, not editing, and periods >= 2.
  const selectedAccount = accountRows.find((a) => a.id === ledgerForm.accountId);
  const isCreditAccount = selectedAccount?.type === "credit";
  const canInstallment = type === "expense" && isCreditAccount && !editing;
  const activeInstallment = canInstallment && installmentPeriods >= 2;

  // Per-period preview amount
  const installmentPreviewAmount = (() => {
    if (!activeInstallment) return null;
    const raw = Math.abs(Number(amountExpression) || 0);
    if (!raw) return null;
    return Math.round(raw / installmentPeriods);
  })();

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
        .filter((a): a is (typeof accountRows)[number] => Boolean(a))
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
          <h2 className="text-lg" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
            {editing ? "編輯交易" : "新增交易"}
          </h2>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉"><X size={16} /></Button>
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
                  className="text-body"
                  onClick={() => onTypeChange(t)}
                  style={{
                    padding: "6px 14px", borderRadius: 999, fontWeight: 500, cursor: "pointer",
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
            <div className="text-xs" style={{
              padding: "10px 14px", borderRadius: "var(--ns-r-sm)",
              background: "var(--ns-accent-soft)", border: "1px solid var(--ns-accent)",
              display: "flex", alignItems: "center", gap: 8,
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
                <AppSelect
                  value={entryDisplayCurrency}
                  onChange={setEntryDisplayCurrency}
                  options={entryCurrencies.map((currency) => ({ value: currency, label: currency }))}
                  searchPlaceholder="搜尋幣別…"
                  style={{
                    padding: "0 10px 0 14px", fontSize: 16, color: meta.color,
                    fontFamily: "var(--ns-font-mono)", fontWeight: 500,
                    flexShrink: 0, borderRight: "1px solid var(--ns-border)",
                    height: "100%", background: "transparent", border: "none",
                    width: 92, minWidth: 92,
                  }}
                />
              ) : (
                <span className="text-xl" style={{
                  padding: "0 14px", color: meta.color,
                  fontFamily: "var(--ns-font-mono)", fontWeight: 500,
                  flexShrink: 0, borderRight: "1px solid var(--ns-border)",
                  height: "100%", display: "flex", alignItems: "center",
                  userSelect: "none",
                }}>
                  {type === "transfer" ? transferForm.sourceCurrency : entryDisplayCurrency}
                </span>
              )}
              {type === "transfer" ? (
                <NumberField
                  className="text-stat"
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    padding: "0 14px", fontFamily: "var(--ns-font-mono)",
                    color: meta.color, textAlign: "right", height: "100%",
                    minWidth: 0, width: "100%",
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                  decimals={2}
                  value={transferForm.sourceAmount}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  onChange={(v) => {
                    const sameCcy = transferForm.sourceCurrency === transferForm.destinationCurrency;
                    setTransferForm({ ...transferForm, sourceAmount: v, destinationAmount: sameCcy ? v : transferForm.destinationAmount });
                  }}
                  placeholder="0"
                />
              ) : (
                <input
                  className="text-stat"
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    padding: "0 14px", fontFamily: "var(--ns-font-mono)",
                    color: meta.color, textAlign: "right", height: "100%",
                    minWidth: 0, width: "100%",
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
              <div className="muted text-caption" style={{ marginTop: 5 }}>
                ≈ {ledgerForm.currency} {formatNumber(convertedHint.converted)}（1 {entryDisplayCurrency} ≈ {convertedHint.rate} {ledgerForm.currency}）
              </div>
            )}
            {activeInstallment && installmentPreviewAmount !== null && (
              <div className="muted text-caption" style={{ marginTop: 5 }}>
                每期約 {entryDisplayCurrency} {formatNumber(installmentPreviewAmount)}，共 {installmentPeriods} 期
              </div>
            )}
          </DrawerField>

          {/* Date (+ currency for transfer). Expense/income render date + account
              inside the progressive block. Receivable/payable do NOT pick a
              settle account here — it's chosen at 結清 time (the counterparty
              may not have said which account they'll use yet). */}
          {!isAcct && (
            <div style={{ display: "grid", gridTemplateColumns: type === "transfer" ? "1fr 1fr" : "1fr", gap: 14 }}>
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
              {type === "transfer" && (
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
                <AccountFilter
                  accounts={accountRows}
                  value={transferForm.sourceAccountId}
                  onChange={(id) => {
                    const account = accountRows.find((a) => a.id === id);
                    setTransferForm({ ...transferForm, sourceAccountId: id, sourceCurrency: account?.currency ?? transferForm.sourceCurrency });
                  }}
                  allowAll={false}
                  placeholder="選擇帳戶"
                  style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                />
              </DrawerField>
              <DrawerField label="至（轉入）" required>
                <AccountFilter
                  accounts={accountRows}
                  value={transferForm.destinationAccountId}
                  onChange={(id) => {
                    const account = accountRows.find((a) => a.id === id);
                    const destCurrency = account?.currency ?? transferForm.destinationCurrency;
                    const sameCcy = transferForm.sourceCurrency === destCurrency;
                    setTransferForm({ ...transferForm, destinationAccountId: id, destinationCurrency: destCurrency, destinationAmount: sameCcy ? transferForm.sourceAmount : transferForm.destinationAmount });
                  }}
                  allowAll={false}
                  placeholder="選擇帳戶"
                  style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                />
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
              <div className="muted text-caption" style={{ marginTop: 4 }}>
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
              <div className="muted text-caption" style={{ marginTop: 4 }}>跨行/跨國轉帳手續費，將從轉出帳戶另計一筆「手續費」支出。</div>
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
                        className="text-xs"
                        onClick={() => setLedgerForm({ ...ledgerForm, category: c.name, subcategory: "" })}
                        style={{
                          padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                          background: active ? color : "var(--ns-bg-card)",
                          // Contrast-aware text so light category colors don't swallow
                          // the label; faint border gives light chips edge definition (B14).
                          color: active ? readableTextColor(color) : "var(--ns-fg)",
                          border: active ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--ns-border)",
                          fontFamily: "inherit", transition: "all 0.12s",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {c.iconName && <Glyph name={c.iconName} size={14} />}
                        {c.name}
                      </button>
                    );
                  })}
                  {categories.length === 0 ? <span className="muted text-xs">尚未建立分類，可於設定新增。</span> : null}
                </div>
                {subcategories.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: 10, borderLeft: "2px solid var(--ns-border)" }}>
                    {subcategories.map((s) => {
                      const active = ledgerForm.subcategory === s;
                      return (
                        <button
                          key={s}
                          className="text-xs"
                          onClick={() => setLedgerForm({ ...ledgerForm, subcategory: s })}
                          style={{
                            padding: "4px 10px", borderRadius: 999, cursor: "pointer",
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
                    <AccountFilter
                      accounts={accountRows}
                      value={ledgerForm.accountId}
                      onChange={(id) => {
                        const account = accountRows.find((a) => a.id === id);
                        setLedgerForm({ ...ledgerForm, accountId: id, currency: account?.currency ?? ledgerForm.currency });
                      }}
                      allowAll={false}
                      placeholder="選擇帳戶"
                      style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                    />
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

              {/* Installment — surfaced in the main body (not buried in 更多選項)
                  so picking a credit card immediately reveals the option. */}
              {canInstallment && (
                <DrawerField label="分期付款（信用卡）">
                  <input
                    className="ns-input"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    placeholder="0"
                    style={{ fontFamily: "var(--ns-font-mono)" }}
                    value={installmentPeriods === 0 ? "" : installmentPeriods}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setInstallmentPeriods(Number.isNaN(v) || v < 0 ? 0 : Math.min(60, v));
                    }}
                  />
                  <div className="muted text-caption" style={{ marginTop: 4 }}>
                    {activeInstallment
                      ? `總額將平均拆成 ${installmentPeriods} 筆，逐月入帳到對應的帳單週期。`
                      : "輸入 2–60（期數）啟用分期；留空或填 0 表示不分期。"}
                  </div>
                </DrawerField>
              )}

              {/* 4 · Advanced: fee, recurring, note */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs"
                  style={{ background: "none", border: "none", color: "var(--ns-fg-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontFamily: "inherit" }}
                >
                  {showAdvanced ? <CaretDown size={13} /> : <CaretRight size={13} />}
                  更多選項（手續費、週期、備註）
                </button>
              </div>
              {showAdvanced && (
                <>
                  {(type === "expense" || type === "income") && !editing && !activeInstallment && (
                    <DrawerField label={`外加手續費（選填） · ${ledgerForm.currency}`}>
                      <input
                        className="ns-input"
                        placeholder="0"
                        style={{ fontFamily: "var(--ns-font-mono)" }}
                        {...expenseFeeField}
                      />
                      <div className="muted text-caption" style={{ marginTop: 4 }}>
                        {type === "income"
                          ? "薪轉/跨行/海外匯入手續費，將另計一筆「手續費」支出。收入以總額（gross）計入，帳戶實際入帳為總額扣除手續費。"
                          : "海外刷卡/跨國交易手續費，將另計一筆「手續費」支出。"}
                      </div>
                    </DrawerField>
                  )}
                  {!activeInstallment && (
                    <DrawerField label="週期交易">
                      <AppSelect
                        value={drawerRecurringFreq}
                        onChange={setDrawerRecurringFreq}
                        options={RECURRING_OPTIONS}
                        style={{ width: "100%", height: 40 }}
                      />
                    </DrawerField>
                  )}
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
              <div className="text-xs" style={{ padding: "12px 14px", borderRadius: "var(--ns-r-md)", background: `color-mix(in srgb, ${meta.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`, color: "var(--ns-fg-muted)", lineHeight: 1.6 }}>
                {type === "ar"
                  ? "應收帳款：對方欠你的錢。若你已先用某帳戶代墊，選下方「付款帳戶」會在建立時立即扣款，對方還款時點 ✓ 結清會入「收款帳戶」，整筆代墊不計收支；留空則結清後才計入收入。"
                  : "應付帳款：你欠對方的錢。若你已先收到款項，選下方「收款帳戶」會在建立時立即入帳，付款時點 ✓ 結清會由「付款帳戶」扣款，整筆代墊不計收支；留空則結清後才計入支出。"}
              </div>
              <DrawerField label={type === "ar" ? "對象（欠款方）" : "對象（收款方）"} required>
                <input className="ns-input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={type === "ar" ? "例：小明、ABC 公司" : "例：房東、供應商"} />
              </DrawerField>
              <DrawerField label={type === "ar" ? "付款帳戶（我先墊付，建立時扣款，選填）" : "收款帳戶（我先收到，建立時入帳，選填）"}>
                <AccountFilter
                  accounts={accountRows}
                  value={ledgerForm.counterAccountId ?? "all"}
                  onChange={(id) => setLedgerForm({ ...ledgerForm, counterAccountId: id === "all" ? null : id })}
                  allowAll
                  allLabel={type === "ar" ? "不指定（結清後才計收入）" : "不指定（結清後才計支出）"}
                  placeholder="選擇帳戶"
                  style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                />
              </DrawerField>
              <DrawerField label={type === "ar" ? "預計收款日（選填）" : "付款截止日（選填）"}>
                <input className="ns-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ fontFamily: "var(--ns-font-mono)" }} />
              </DrawerField>
              <DrawerField label="分類">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {categories.map((c) => {
                    const active = ledgerForm.category === c.name;
                    return (
                      <button
                        key={c.name}
                        className="text-xs"
                        onClick={() => setLedgerForm({ ...ledgerForm, category: c.name, subcategory: "" })}
                        style={{
                          padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                          background: active ? (c.color || "var(--ns-accent)") : "var(--ns-bg-card)",
                          color: active ? readableTextColor(c.color || "var(--ns-accent)") : "var(--ns-fg)",
                          border: active ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--ns-border)",
                          fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {c.iconName && <Glyph name={c.iconName} size={14} />}
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
                <AppSelect
                  value={drawerRecurringFreq}
                  onChange={setDrawerRecurringFreq}
                  options={RECURRING_OPTIONS}
                  style={{ width: "100%", height: 40 }}
                />
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

          {message ? <div className="text-body" style={{ color: "var(--ns-neg)" }}>{message}</div> : null}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 8 }}>
          <Button variant="outline" className="shrink-0 grow-0 basis-20 justify-center" onClick={onClose}>取消</Button>
          <Button
            className="flex-1 justify-center"
            style={{ background: meta.color, borderColor: meta.color, color: "#fff" }}
            onClick={type === "transfer" ? onSubmitTransfer : onSubmitLedger}
          >
            <Check size={14} weight="bold" />
            {editing ? "儲存變更" : type === "ar" ? "記錄應收" : type === "ap" ? "記錄應付" : type === "transfer" ? "建立轉帳" : "儲存交易"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DrawerField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="text-caption" style={{ display: "block", color: "var(--ns-fg-muted)", marginBottom: 6, letterSpacing: 0.04, textTransform: "uppercase" }}>
        {label}
        {required ? <span style={{ color: "var(--ns-neg)", marginLeft: 3 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

/* ─────────────── helpers ─────────────── */

/** A transfer's two legs (same groupId) collapse into one display row so the
 * activity list shows "來源 → 目標" once instead of a 轉出/轉入 pair. */
type DisplayRow = LedgerTransaction & { transferPair?: { source: LedgerTransaction; dest: LedgerTransaction } };

function mergeTransferRows(rows: LedgerTransaction[], allRows: LedgerTransaction[]): DisplayRow[] {
  const seen = new Set<string>();
  const out: DisplayRow[] = [];
  for (const row of rows) {
    if (row.entryType === "transfer" && row.groupId) {
      if (seen.has(row.groupId)) continue;
      seen.add(row.groupId);
      // Look the pair up from the full ledger so an account/search filter that
      // matched only one leg still renders the complete transfer.
      const legs = allRows.filter((r) => r.groupId === row.groupId && r.entryType === "transfer" && r.deletedAt === null);
      const source = legs.find((l) => l.amount < 0) ?? row;
      const dest = legs.find((l) => l.id !== source.id) ?? row;
      out.push({ ...source, transferPair: { source, dest } });
    } else {
      out.push(row);
    }
  }
  return out;
}

/* ─────────── Cashflow chart bucketing (日/週/月/年) ─────────── */
type ChartGranularity = "day" | "week" | "month" | "year";

const CHART_GRANULARITY_OPTIONS: Array<{ value: ChartGranularity; label: string }> = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

/** Local-time `YYYY-MM-DD` (avoids the UTC shift of `Date.toISOString`). */
function isoLocal(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Monday (ISO week start) of the week containing `dateStr`. */
function mondayOf(dateStr: string): string {
  const dt = new Date(dateStr.slice(0, 10) + "T00:00:00");
  const dow = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - dow);
  return isoLocal(dt);
}

/** Which bucket a row's date falls into, for the given granularity. */
function cashflowBucketKey(granularity: ChartGranularity, dateStr: string): string {
  const d = dateStr.slice(0, 10);
  if (granularity === "day") return d;
  if (granularity === "month") return d.slice(0, 7);
  if (granularity === "year") return d.slice(0, 4);
  return mondayOf(d); // week
}

/** Ordered list of buckets ({key, label}) for the visible window. */
function buildCashflowBuckets(granularity: ChartGranularity, range: { start: string | null; end: string | null }): Array<{ key: string; label: string }> {
  const start = range.start ?? isoLocal(new Date());
  const end = range.end ?? start;
  if (granularity === "day") {
    return enumerateDays(start, end).map((day) => ({ key: day, label: day.slice(5) }));
  }
  if (granularity === "month") {
    return enumerateMonths(start, end).map((month) => ({ key: month, label: `${Number(month.slice(5, 7))}月` }));
  }
  if (granularity === "year") {
    return enumerateYears(start, end).map((year) => ({ key: year, label: year }));
  }
  return enumerateWeeks(start, end).map((week) => {
    const dt = new Date(`${week}T00:00:00`);
    return { key: week, label: `${dt.getMonth() + 1}/${dt.getDate()}` };
  });
}

function enumerateDays(start: string, end: string) {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    out.push(isoLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function enumerateWeeks(start: string, end: string) {
  const out: string[] = [];
  const cursor = new Date(`${mondayOf(start)}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    out.push(isoLocal(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

function enumerateMonths(start: string, end: string) {
  const out: string[] = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00`);
  const last = end.slice(0, 7);
  while (isoLocal(cursor).slice(0, 7) <= last) {
    out.push(isoLocal(cursor).slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function enumerateYears(start: string, end: string) {
  const first = Number(start.slice(0, 4));
  const last = Number(end.slice(0, 4));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => String(first + index));
}

function groupByDay<T extends LedgerTransaction>(rows: T[], toPrimary: (row: LedgerTransaction, amount?: number) => number | null) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), row]);
  }
  return [...map.entries()].map(([date, dayRows]) => ({
    date,
    rows: dayRows,
    net: dayRows.reduce((sum, row) => (isNeutralLedgerRow(row) ? sum : sum + (toPrimary(row) ?? 0)), 0),
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
      <span className="muted text-caption" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Sparkle size={12} weight="fill" style={{ color: "var(--ns-accent)" }} />
        依過往紀錄建議
      </span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="text-xs"
          onClick={() => onPick(chip.key)}
          style={{
            padding: "4px 11px", borderRadius: 999, cursor: "pointer",
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
              className="text-body"
              style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", background: "transparent", border: "none", color: "var(--ns-fg)", cursor: "pointer" }}
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
