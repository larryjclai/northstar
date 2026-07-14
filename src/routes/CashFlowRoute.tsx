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
import { groupByDay, groupByMonth } from "./cashFlowGrouping";
import { CategoriesTab } from "./CategoriesTab";
import { MerchantsTab } from "./MerchantsTab";
import { RecurringRulesTab } from "./RecurringRulesTab";
import { LedgerDateControl } from "../components/LedgerDateControl";
import { AccountFilter } from "../components/AccountFilter";
import { AppSelect } from "../components/AppSelect";
import { BulkCategorizeCard } from "./BulkCategorizeCard";
import { CategoryFilter } from "../components/CategoryFilter";
import { ModalShell } from "../components/ModalShell";
import { NumberField } from "../components/NumberField";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { Glyph } from "../lib/icons";
import { readableTextColor } from "../lib/color";
import { lockViewportScroll } from "../lib/scrollLock";
import { SegmentedControl } from "../components/SegmentedControl";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { DatePicker } from "../components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { useToast } from "../components/Toast";
import { activeFilterChips } from "./activeFilterChips";
import type { LedgerDraft, TransferDraft } from "../data/repositories";
import { buildLedgerSuggestions, buildMerchantCategoryMap, buildOutstandingSettlements, classifyLedgerGroup, evaluateAmountExpression, filterCategoriesByType, formatNumber, installmentLabel, isNeutralLedgerRow, isWithinDateScope, makeDefaultDateScope, nextRecurringDate, nowAsDatetimeLocal, recurringFrequencyLabels, resolveDateScope, todayInTimezone } from "../domain";
import type { SplitLegInput, SplitSharedFields } from "../domain/splitLegs";
import {
  addSplitLeg,
  derivedSplitTotal,
  enterSplitMode,
  makeEmptySplitLeg,
  removeSplitLeg,
  shouldExitSplitMode,
  splitLegsError,
  toSplitLegInputs,
  updateSplitLeg,
  type SplitLegDraftState,
} from "./splitEntryState";
import { convertCurrency, buildDailyRateIndex, formatCompactNumber } from "../domain/currency";
import type { Account, DateScopeValue, LedgerTransaction, RecurringFrequency, RecurringTransaction, ResolvedDateScope } from "../domain";
import { ALL_BOOKS, bookAccountIdSet, scopeRows } from "../domain/bookScope";
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

/**
 * Normalizes a recurring rule's per-occurrence amount to a monthly figure for
 * the 固定收支 footer estimate (plan 169 step 1) — weekly/biweekly annualized
 * then ÷12, monthly as-is, yearly ÷12. Display-only estimate, not used for any
 * ledger math.
 */
const FREQUENCY_MONTHLY_FACTOR: Record<RecurringFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

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
    postDate: null,
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

const LONG_RANGE_CUSTOM_DAYS = 92;

/**
 * Short ranges (本月, and a custom range ≤ ~3 months) render a flat day list
 * with load-more; long ranges (YTD / 近12個月 / 全部, or a custom range longer
 * than ~3 months) render month-collapsed groups instead (plan 169 variant D).
 */
function isLongRange(dateScope: DateScopeValue, dateRange: ResolvedDateScope): boolean {
  if (dateScope.preset === "ytd" || dateScope.preset === "last12m" || dateScope.preset === "all") return true;
  if (dateScope.preset === "custom" && dateRange.start && dateRange.end) {
    const start = new Date(`${dateRange.start}T00:00:00`).getTime();
    const end = new Date(`${dateRange.end}T00:00:00`).getTime();
    return (end - start) / 86_400_000 > LONG_RANGE_CUSTOM_DAYS;
  }
  return false;
}

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

export function CashFlowRoute() {
  const { accounts, ledger, recurring, settings, dailyFxRates, books, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const activeBookId = useUiPreferences((state) => state.activeBookId);
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
  // 多類別拆分 (plan 182): non-null = the drawer is in MOZE-style split mode,
  // one row per category leg. `editingSplitGroupId` is set while editing an
  // existing split group (save goes through updateSplit with this groupId).
  const [splitLegs, setSplitLegs] = useState<SplitLegDraftState[] | null>(null);
  const [editingSplitGroupId, setEditingSplitGroupId] = useState<string | null>(null);
  // Expanded 拆分 groups in the activity list (collapsed by default).
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());
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
  const { account: accountParam, tx: txParam } = useSearch({ strict: false }) as { account?: string; tx?: string };
  const [selectedAccount, setSelectedAccount] = useState(accountParam ?? "all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
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
  const bookRows = books.data ?? [];
  const recurringRows = recurring.data ?? [];

  // 帳本 (Books) switcher scope (plan 189, docs/ledger-books-plan.md §1 #3/#4/#5/#12):
  // cash-flow is a general view → scoped by the active book / 總帳. Accounts
  // belong to exactly one book, so the existing per-account filter composes on
  // top of this. In 總帳 (activeBookId "all") every id is included → identical
  // to pre-books. The transfer-sibling lookup + suggestion pools keep reading
  // the full ledger so cross-book transfers still render.
  const switcherAccountIds = useMemo(() => bookAccountIdSet(accountRows, activeBookId), [accountRows, activeBookId]);
  const bookAccounts = useMemo(() => accountRows.filter((a) => switcherAccountIds.has(a.id)), [accountRows, switcherAccountIds]);
  const bookLedgerRows = useMemo(() => scopeRows(ledgerRows, switcherAccountIds), [ledgerRows, switcherAccountIds]);
  const fxHistory = dailyFxRates.data ?? [];
  const fxIndex = useMemo(() => buildDailyRateIndex(fxHistory), [fxHistory]);
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const toPrimary = useCallback((row: LedgerTransaction, amount = row.amount) =>
    convertCurrency(amount, row.currency, primaryCurrency, appSettings, { dailyRateIndex: fxIndex, asOfDate: row.date }),
  [appSettings, fxIndex, primaryCurrency]);

  // Deep-link from the Reconcile screen: open the transaction's detail panel once
  // the ledger has loaded (matching what a tap on a CashFlow row does).
  useEffect(() => {
    if (!txParam) return;
    const row = ledgerRows.find((r) => r.id === txParam);
    if (row) setDetailRow(row);
  }, [txParam, ledgerRows]);

  const allCategories = appSettings?.categories.length ? appSettings.categories : [];
  // The entry drawer only offers categories matching the active 收入/支出 type
  // (plan 056). ar/ap/transfer are neither income- nor expense-specific, so they
  // keep the full list. Untagged/"both" categories show for both types; if a type
  // has no tagged categories the helper falls back to the full list so the picker
  // is never empty. This is a picker filter only — spend aggregation is unchanged.
  const categories =
    drawerType === "income" || drawerType === "expense"
      ? filterCategoriesByType(allCategories, drawerType)
      : allCategories;
  const categoryNames = categories.map((category) => category.name);
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
  const createSplitMutation = useRepositoryMutation(
    (repository, input: { shared: SplitSharedFields; legs: SplitLegInput[] }) =>
      repository.createSplit(input.shared, input.legs),
    ["ledger", "accounts"],
  );
  const updateSplitMutation = useRepositoryMutation(
    (repository, input: { groupId: string; shared: SplitSharedFields; legs: SplitLegInput[] }) =>
      repository.updateSplit(input.groupId, input.shared, input.legs),
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

  /**
   * The active user-split legs of `row`'s group, or null when the row is not
   * part of a 多類別拆分. Requires EVERY leg to carry `legKind: "category"` —
   * a fee-leg pair (legKind null) also classifies as "split" (same account,
   * shared groupId) but must keep today's single-row edit behavior, never
   * open the split editor.
   */
  function splitGroupRowsFor(row: LedgerTransaction): LedgerTransaction[] | null {
    if (!row.groupId) return null;
    const rows = ledgerRows.filter((r) => r.groupId === row.groupId && r.deletedAt === null);
    if (rows.length < 2) return null;
    if (classifyLedgerGroup(rows) !== "split") return null;
    if (!rows.every((r) => r.legKind === "category")) return null;
    return rows;
  }

  function openCreate(type: CashType) {
    setDrawerType(type);
    setDrawerOpen(true);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setSplitLegs(null);
    setEditingSplitGroupId(null);
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
    setSplitLegs(null);
    setEditingSplitGroupId(null);
    setInstallmentPeriods(0);
    setMessage("");
  }

  function changeType(next: CashType) {
    // Editing an existing 拆分 group must stay expense/income — switching to
    // transfer/ar/ap would drop the legs and then save a single row over one
    // leg of the group. Ignore those taps while a split edit is open.
    if (editingSplitGroupId && next !== "expense" && next !== "income") return;
    setDrawerType(next);
    // Split mode only exists for expense/income; leaving them drops the legs.
    if (next !== "expense" && next !== "income") {
      setSplitLegs(null);
      setEditingSplitGroupId(null);
    }
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

  /**
   * Hydrate the drawer's split mode from an existing 拆分 group: shared
   * fields come from the first leg, one editable leg row per group leg.
   * `duplicate` opens the same form in create mode (a fresh group on save).
   * Note: leg row ids change on every updateSplit (tombstone + recreate), so
   * nothing here caches leg ids — only the stable groupId.
   */
  function startSplitEdit(groupRows: LedgerTransaction[], duplicate = false) {
    const first = groupRows[0];
    setDrawerType(first.entryType === "income" ? "income" : "expense");
    setEditingId(duplicate ? null : first.id);
    setEditingSplitGroupId(duplicate ? null : first.groupId);
    setEditingRecurringRuleId(null);
    setCounterparty("");
    setDueDate("");
    setLedgerForm({
      accountId: first.accountId,
      counterAccountId: null,
      date: first.date,
      name: first.name,
      amount: first.amount,
      currency: first.currency,
      category: first.category,
      subcategory: first.subcategory,
      merchant: first.merchant,
      entryType: first.entryType,
      settlementStatus: "settled",
      note: first.note,
      postDate: first.postDate ?? null,
    });
    setEntryDisplayCurrency(first.currency);
    const total = groupRows.reduce((sum, r) => sum + Math.abs(r.amount), 0);
    setAmountExpression(String(total));
    setSplitLegs(groupRows.map((r) => ({
      amount: String(Math.abs(r.amount)),
      category: r.category,
      subcategory: r.subcategory,
    })));
    setDrawerRecurringFreq("none");
    setInstallmentPeriods(0);
    setMessage("");
    setDrawerOpen(true);
  }

  function startEdit(row: LedgerTransaction) {
    const splitRows = splitGroupRowsFor(row);
    if (splitRows) {
      startSplitEdit(splitRows);
      return;
    }
    const type = cashTypeFromRow(row);
    setDrawerType(type);
    setSplitLegs(null);
    setEditingSplitGroupId(null);
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
      postDate: row.postDate ?? null,
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
    const splitRows = splitGroupRowsFor(row);
    if (splitRows) {
      startSplitEdit(splitRows, true);
      return;
    }
    const type = cashTypeFromRow(row);
    setDrawerType(type);
    setSplitLegs(null);
    setEditingSplitGroupId(null);
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
        postDate: row.postDate ?? null,
      });
      setEntryDisplayCurrency(row.originalCurrency ?? row.currency);
      setAmountExpression(String(Math.abs(row.originalAmount ?? row.amount)));
    }
    setDrawerOpen(true);
  }

  async function submitLedger() {
    setMessage("");
    try {
      // 多類別拆分: split mode saves through createSplit/updateSplit and never
      // touches the single-row path below (which stays byte-identical).
      if (splitLegs && (drawerType === "expense" || drawerType === "income")) {
        const legsError = splitLegsError(splitLegs);
        if (legsError) throw new Error(legsError);
        if (!ledgerForm.accountId) throw new Error("請選擇帳戶。");
        const splitEntryType = entryTypeFor(drawerType) as "expense" | "income";
        const isCreditSplit = splitEntryType === "expense"
          && accountRows.find((a) => a.id === ledgerForm.accountId)?.type === "credit";
        const shared: SplitSharedFields = {
          accountId: ledgerForm.accountId,
          date: ledgerForm.date,
          name: ledgerForm.name.trim(),
          merchant: ledgerForm.merchant.trim(),
          currency: ledgerForm.currency,
          entryType: splitEntryType,
          settlementStatus: "settled",
          note: ledgerForm.note,
          postDate: isCreditSplit ? (ledgerForm.postDate || null) : null,
        };
        const legs = toSplitLegInputs(splitLegs);
        if (editingId && editingSplitGroupId) {
          await updateSplitMutation.mutateAsync({ groupId: editingSplitGroupId, shared, legs });
          toast.success("已更新拆分交易");
        } else {
          await createSplitMutation.mutateAsync({ shared, legs });
          toast.success(`已新增拆分交易（${legs.length} 筆分類）`);
        }
        await rememberCategories.mutateAsync(legs.map((leg) => ({ category: leg.category, subcategory: leg.subcategory })));
        rememberMerchantNames([shared.merchant]);
        closeDrawer();
        return;
      }
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
      // 延後入帳 only applies to a credit-card expense; clear it otherwise so a
      // posting date never lingers on income/transfer or non-credit accounts.
      const isCreditExpense = entryType === "expense"
        && accountRows.find((a) => a.id === ledgerForm.accountId)?.type === "credit";
      const postDate = isCreditExpense ? (ledgerForm.postDate || null) : null;
      const payload: LedgerDraft = {
        ...ledgerForm,
        entryType,
        settlementStatus: settlementFor(drawerType),
        postDate,
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
             isActive: true,
             seedToday: todayInTimezone(timezone),
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
             isActive: true,
             seedToday: todayInTimezone(timezone),
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

  async function handleDelete(id: string, successMessage = "已刪除交易") {
    try {
      await deleteLedger.mutateAsync(id);
      toast.success(successMessage);
    } catch (e) {
      toast.error("刪除失敗");
    }
  }

  function requestDelete(row: LedgerTransaction) {
    if (row.installmentGroupId) {
      setInstallmentDeletePrompt(row);
    } else if (splitGroupRowsFor(row)) {
      // Deleting any leg of a 拆分 cascades to the whole group (repo-level
      // groupId cascade) — say so instead of pretending it was one row.
      void handleDelete(row.id, "已整組刪除拆分交易");
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
    try {
      setPreview(parseLedgerCsv(await file.text(), accountFor));
    } catch (error) {
      toast.error(`CSV 解析失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      event.target.value = "";
    }
  }

  const scopedRows = useMemo(() => bookLedgerRows.filter((row) => {
    if (!isWithinDateScope(row.date, dateRange)) return false;
    if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
    if (selectedCategory !== "all" && row.category !== selectedCategory) return false;
    return true;
  }), [bookLedgerRows, dateRange, selectedAccount, selectedCategory]);
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
  // Period aggregates: a full filter+reduce pass over `scopedRows` each. Keyed
  // on the scoped rows and converter only — NOT `searchQuery` — so typing in
  // the search box (which only affects `activityRows`) doesn't re-run them.
  const { periodIncome, periodExpense, periodNet, periodTransferCount, missingFx } = useMemo(() => {
    const income = scopedRows
      .filter((row) => row.entryType === "income" && row.settlementStatus === "settled" && !isNeutralLedgerRow(row))
      .reduce((sum, row) => sum + Math.max(0, toPrimary(row) ?? 0), 0);
    const expense = scopedRows
      .filter((row) => row.entryType === "expense" && row.settlementStatus === "settled" && !isNeutralLedgerRow(row))
      // Signed: expense amounts are negative, so −amount is positive spend; a
      // refund (positive-amount expense) nets back out instead of adding.
      .reduce((sum, row) => sum - (toPrimary(row) ?? 0), 0);
    const transferCount = new Set(scopedRows.filter((row) => row.entryType === "transfer").map((row) => row.groupId ?? row.id)).size;
    const missing = [...new Set(scopedRows
      .filter((row) => !isNeutralLedgerRow(row) && row.settlementStatus === "settled" && toPrimary(row) === null)
      .map((row) => `${row.currency} → ${primaryCurrency}`))];
    return {
      periodIncome: income,
      periodExpense: expense,
      periodNet: income - expense,
      periodTransferCount: transferCount,
      missingFx: missing,
    };
  }, [scopedRows, toPrimary, primaryCurrency]);

  // Category spending for donut chart (all categories, not just top 5)
  const allCategorySpend = useMemo(() => {
    const map = new Map<string, number>();
    // Use unfiltered-by-category rows for the donut so it always shows all categories
    const baseRows = bookLedgerRows.filter((row) => {
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
    const defaultColors = ["var(--ns-chart-1)","var(--ns-chart-2)","var(--ns-chart-3)","var(--ns-chart-4)","var(--ns-chart-5)","var(--ns-chart-6)","var(--ns-chart-7)","#a78bfa","#f472b6","#facc15"];
    return [...map.entries()]
      // A category can net negative if refunds exceed spend in the period;
      // hide it from the spend donut rather than drawing a negative slice.
      .filter(([, amount]) => amount > 0)
      .map(([name, amount], idx) => {
        const catSetting = appSettings?.categories.find(c => c.name === name);
        return { name, amount, color: catSetting?.color || defaultColors[idx % defaultColors.length], icon: catSetting?.iconName || 'Tag' };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [bookLedgerRows, dateRange, selectedAccount, appSettings, toPrimary]);

  const totalCategorySpend = allCategorySpend.reduce((s, c) => s + c.amount, 0);

  const topCategorySpend = useMemo(() => allCategorySpend.slice(0, 5), [allCategorySpend]);

  // Cap the 分類支出 bar list to the top N, folding the rest behind an expandable toggle (plan 018).
  const CATEGORY_BAR_LIMIT = 8;

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
    const rows = bookLedgerRows.filter((row) => {
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
  }, [bookLedgerRows, selectedAccount, selectedCategory, chartGranularity, dateRange, toPrimary]);


  const sortedRows = useMemo(

    () => [...ledgerRows].sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows],
  );

  const displayRows = useMemo(() => mergeTransferRows(activityRows, ledgerRows), [activityRows, ledgerRows]);

  // Long ranges (YTD / 近12個月 / 全部 / a >92-day custom range) render
  // month-collapsed groups instead of a flat day list (variant D); load-more
  // doesn't apply there — every month renders (collapsed months are cheap).
  const isLongRangeView = useMemo(() => isLongRange(dateScope, dateRange), [dateScope, dateRange]);

  // Default visible window = the most recent 3 days' worth of rows (「未選期間
  // 時預設只顯示最近 3 天」). `displayRows` is already newest-first, so this is
  // a walk to the 4th distinct day.
  const defaultVisibleCount = useMemo(() => {
    let daysSeen = 0;
    let lastDay: string | null = null;
    let count = 0;
    for (const row of displayRows) {
      const day = row.date.slice(0, 10);
      if (day !== lastDay) {
        if (daysSeen >= 3) break;
        daysSeen++;
        lastDay = day;
      }
      count++;
    }
    return count;
  }, [displayRows]);

  const [visibleCount, setVisibleCount] = useState(defaultVisibleCount);
  // Switching range/filter/search strands whatever window was loaded — reset
  // back to the 3-day default (mirrors the old `setPage(1)` reset). Also keyed
  // on `isInitialLoading`: on mount `ledgerRows` is still `[]` (the SQLite
  // query is async), so the very first `defaultVisibleCount` computes to 0;
  // without this dependency `visibleCount` would stay stuck at that stale 0
  // once real data lands, since none of the filters change on their own.
  useEffect(() => {
    setVisibleCount(defaultVisibleCount);
    // Deliberately NOT reacting to `defaultVisibleCount` itself (only to the
    // filters/load-state transitions that should strand the load-more
    // window) — it's read fresh each time this effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedAccount, selectedCategory, searchQuery, isInitialLoading]);

  const visibleRows = useMemo(() => displayRows.slice(0, visibleCount), [displayRows, visibleCount]);
  const dayGroups = useMemo(() => groupByDay(visibleRows, toPrimary), [visibleRows, toPrimary]);
  const monthGroups = useMemo(() => groupByMonth(displayRows, toPrimary), [displayRows, toPrimary]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  // While searching, auto-expand every month that has a surviving row — the
  // rows are already search-filtered upstream (`activityRows`), so any month
  // present in `monthGroups` during a search necessarily has a match.
  const effectiveExpandedMonths = searchQuery.trim()
    ? new Set(monthGroups.map((m) => m.month))
    : expandedMonths;
  const toggleMonth = (month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };
  // Row tap on a collapsed 拆分 group toggles its inline per-leg expansion
  // (mirrors toggleMonth; the detail panel is not used for split groups).
  const toggleSplit = (groupId: string) => {
    setExpandedSplits((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const periodLabel = dateRange.label;

  // 篩選 popover (plan 168): account/category filters moved out of the
  // header into one popover, mirrored as removable chips under the tab bar.
  // `filterChips` is the single source for the chip list and the count
  // badge, so they can never disagree.
  const filterChips = useMemo(
    () => activeFilterChips({ selectedAccount, selectedCategory, accountName }),
    [selectedAccount, selectedCategory, accountRows],
  );
  const activeFilterCount = filterChips.length;
  function clearAllFilters() {
    setSelectedAccount("all");
    setSelectedCategory("all");
  }
  function clearFilterChip(key: "account" | "category") {
    if (key === "account") setSelectedAccount("all");
    else setSelectedCategory("all");
  }

  // Unsettled receivables / payables (respecting the account filter).
  const settlementConvert = useCallback(
    (amount: number, currency: string) => convertCurrency(amount, currency, primaryCurrency, appSettings, { dailyRateIndex: fxIndex }) ?? amount,
    [appSettings, fxIndex, primaryCurrency],
  );
  const settlements = useMemo(
    () => buildOutstandingSettlements(
      selectedAccount === "all" ? bookLedgerRows : bookLedgerRows.filter((r) => r.accountId === selectedAccount),
      settlementConvert,
    ),
    [bookLedgerRows, selectedAccount, settlementConvert],
  );

  // Render one day-group (header + its rows) — shared by the flat short-range
  // list and by each expanded month in the long-range (variant D) view.
  const renderDayGroup = (g: { date: string; rows: DisplayRow[]; net: number }, indented = false) => (
    <div key={g.date}>
      <div
        className="ns-cf-day-header flex items-center justify-between"
        style={{
          padding: indented ? "10px 20px" : "14px 20px",
          borderBottom: "1px solid var(--ns-border)",
          background: "var(--ns-bg-elev)",
        }}
      >
        <span className="text-xs muted font-medium">{g.date}</span>
        <span className="dim mono text-caption">
          Net <span className={g.net >= 0 ? "pos" : "neg"}>
            {(g.net >= 0 ? "+" : "−")}{primaryCurrency} {formatNumber(Math.abs(g.net))}
          </span>
        </span>
      </div>
      {g.rows.map((r) => {
        const catGroup = appSettings?.categories.find((c) => c.name === r.category);
        return (
          <LedgerRow
            key={r.id}
            row={r}
            transferPair={r.transferPair}
            splitLegs={r.splitLegs}
            splitExpanded={Boolean(r.splitLegs && r.groupId && expandedSplits.has(r.groupId))}
            onToggleSplit={() => { if (r.groupId) toggleSplit(r.groupId); }}
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
  );

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1 max-w-[1180px] mx-auto">
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
          <h3 className="text-[17px] font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>
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
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px] max-w-[1180px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-[22px] flex-wrap">
        <div>
          <div className="text-xs ns-field-label">{periodLabel}</div>
          <h1 className="text-[28px] m-0 font-semibold" style={{ fontFamily: "var(--ns-font-display)", letterSpacing: -0.02 }}>
            記帳
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsv} />
          <LedgerDateControl value={dateScope} onChange={setDateScope} />

          <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
            <PopoverTrigger
              render={
                <Button variant="outline" className="h-9 sm:h-9 whitespace-nowrap">
                  <Funnel size={14} />篩選
                  {activeFilterCount > 0 ? (
                    <span
                      className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-semibold leading-none"
                      style={{ background: "var(--ns-accent)", minWidth: 16, height: 16, padding: "0 4px" }}
                    >
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              }
            />
            <PopoverContent align="end" className="p-3" style={{ width: 260 }}>
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-xs ns-field-label mb-1.5">帳戶</div>
                  <AccountFilter accounts={bookAccounts} value={selectedAccount} onChange={setSelectedAccount} className="text-body" style={{ minWidth: "100%", maxWidth: "none" }} />
                </div>
                <div>
                  <div className="text-xs ns-field-label mb-1.5">分類</div>
                  <CategoryFilter categories={allCategories} value={selectedCategory} onChange={setSelectedCategory} style={{ minWidth: "100%", maxWidth: "none" }} />
                </div>
                <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--ns-border)" }}>
                  <button type="button" className="text-xs muted cursor-pointer" onClick={clearAllFilters} disabled={activeFilterCount === 0}>
                    清除全部
                  </button>
                  <Button size="sm" onClick={() => setFilterPopoverOpen(false)}>完成</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button className="h-9 sm:h-9 whitespace-nowrap" onClick={() => openCreate("expense")}>
            <Plus size={14} weight="bold" />記一筆
          </Button>
        </div>
      </div>

      <div className="flex mb-6 overflow-x-auto" style={{ borderBottom: '1px solid var(--ns-border)' }}>
        {[
          { id: 'overview', label: '交易' },
          { id: 'categories', label: '分類' },
          { id: 'merchants', label: '商家' },
          { id: 'recurring', label: '週期規則' },
        ].map(t => (
          <button key={t.id} className="text-sm whitespace-nowrap cursor-pointer" onClick={() => setActiveTab(t.id as any)} style={{
            padding: '10px 20px', background: 'none', border: 'none',
            fontFamily: 'inherit', fontWeight: activeTab === t.id ? 600 : 400,
            color: activeTab === t.id ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
            borderBottom: activeTab === t.id ? '2px solid var(--ns-accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.12s',
          }}>{t.label}</button>
        ))}
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {filterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1"
              style={{ background: "var(--ns-surface-strong)", border: "1px solid var(--ns-border)", color: "var(--ns-fg)" }}
            >
              {chip.label}
              <button
                type="button"
                aria-label={`移除${chip.label}篩選`}
                onClick={() => clearFilterChip(chip.key)}
                className="inline-flex items-center justify-center cursor-pointer"
                style={{ color: "var(--ns-fg-muted)" }}
              >
                <X size={11} weight="bold" />
              </button>
            </span>
          ))}
          <button type="button" className="text-xs cursor-pointer muted" onClick={clearAllFilters}>
            清除全部
          </button>
          <div className="ml-auto text-xs muted whitespace-nowrap">符合 {displayRows.length} 筆</div>
        </div>
      ) : null}

      {activeTab === "overview" && (
        <>
          {missingFx.length > 0 ? (
            <Card className="text-body px-3.5 py-2.5 mb-3.5" style={{ color: "var(--ns-neg)" }}>
              總額不完整：缺少匯率 {missingFx.join("、")}。請至設定更新匯率；原幣交易仍會保留。
            </Card>
          ) : null}
          {/* Suggest-and-confirm bulk categorization for uncategorized rows (plan 174). */}
          <BulkCategorizeCard ledgerRows={ledgerRows} accounts={accountRows} settings={appSettings} />
          {/* 未結清 (應收/應付) moved into the right column — see NSLgBottomA. */}
          <div className="mb-5">
        {/* Cashflow Chart */}
        <Card id="cashflow-chart" className="p-6">
          <div className="flex items-end gap-4 mb-3.5 flex-wrap">
            <div>
              <div className="text-xs ns-field-label">現金流 · Net</div>
              <div className={"ns-num-lg " + (periodNet >= 0 ? "pos" : "neg")}>
                {periodNet >= 0 ? "+" : "−"}{primaryCurrency} {formatNumber(Math.abs(periodNet))}
              </div>
            </div>
            <div className="flex-1"/>
            {/* Income / Spending / Savings — 儲蓄率 hero + secondary 收入/支出 pair */}
            <div className="flex gap-2 items-stretch">
              {/* Hero: 儲蓄率 */}
              <div className="ns-surface flex flex-col justify-center min-w-[104px]" style={{ padding: "10px 14px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)" }}>
                <div className="text-xs muted font-medium" style={{ fontSize: 10, marginBottom: 2 }}>儲蓄率</div>
                <div
                  className={"num " + (periodIncome > 0 && periodNet >= 0 ? "pos" : "muted")}
                  style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", lineHeight: 1.1 }}
                >
                  {periodIncome > 0 ? `${((periodNet / periodIncome) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
              {/* Secondary: 收入 / 支出 stacked compact */}
              <div className="flex flex-col gap-1.5 justify-center">
                <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="muted text-caption min-w-[28px]">收入</span>
                  <span className="num pos text-caption font-medium">{primaryCurrency} {formatNumber(periodIncome)}</span>
                </div>
                <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="muted text-caption min-w-[28px]">支出</span>
                  <span className="num neg text-caption font-medium">{primaryCurrency} {formatNumber(periodExpense)}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Legend + 日/週/月/年 granularity selector */}
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-3.5">
              {([
                { label: "收入", color: "var(--ns-pos)" },
                { label: "支出", color: "var(--ns-neg)" },
              ]).map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                  <span className="muted text-caption">{l.label}</span>
                </div>
              ))}
              {/* Cumulative-net line legend uses a horizontal stroke */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 shrink-0 rounded-[1px]" style={{ background: "var(--ns-accent)" }} />
                <span className="muted text-caption">累積淨額</span>
              </div>
            </div>
            <SegmentedControl value={chartGranularity} options={CHART_GRANULARITY_OPTIONS} onChange={setChartGranularity} />
          </div>
          <div className="h-[220px]">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs muted font-medium">分類支出 · {periodLabel}</div>
            {selectedCategory !== "all" && (
              <Button variant="ghost" size="xs" onClick={() => setSelectedCategory("all")}>
                <X size={10} weight="bold" />清除篩選
              </Button>
            )}
          </div>

          {/* Category Bar List */}
          {allCategorySpend.length > 0 ? (
            <div className="flex flex-col gap-3">
              {(showAllCategories ? allCategorySpend : allCategorySpend.slice(0, CATEGORY_BAR_LIMIT)).map((r) => {
                const pct = totalCategorySpend > 0 ? (r.amount / totalCategorySpend) * 100 : 0;
                const isActive = selectedCategory === "all" || selectedCategory === r.name;
                const displayPct = pct < 1 ? "<1" : pct.toFixed(1);
                return (
                  <div
                    key={r.name}
                    onClick={() => setSelectedCategory(prev => prev === r.name ? "all" : r.name)}
                    className="cursor-pointer"
                    style={{
                      opacity: isActive ? 1 : 0.45,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    <div className="text-body flex justify-between items-center mb-[5px]">
                      <div className="flex items-center gap-1.5">
                        <Glyph name={r.icon} size={14} />
                        <span className="font-medium">{r.name}</span>
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
              {allCategorySpend.length > CATEGORY_BAR_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories((v) => !v)}
                  className="muted text-xs text-left cursor-pointer py-0.5"
                  style={{ background: "none", border: "none", color: "var(--ns-accent)", fontFamily: "var(--ns-font-mono)" }}
                >
                  {showAllCategories ? "▲ 收合" : `▼ 顯示其餘 ${allCategorySpend.length - CATEGORY_BAR_LIMIT} 類`}
                </button>
              )}
            </div>
          ) : (
            <div className="muted text-body text-center py-[30px]">本月尚無支出</div>
          )}
        </Card>
        <RankingCard title="商家花費排行" rows={topMerchantSpend} emptyText="此期間尚無商家資料" currency={primaryCurrency} />
      </div>

      {preview ? (
        <Card className="mb-4" style={{ padding: "var(--ns-pad-card)" }}>
          <div className="font-semibold mb-1.5">
            匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
          </div>
          {preview.invalid.map((item) => (
            <div key={item.row} className="text-body" style={{ color: "var(--ns-neg)" }}>Row {item.row}: {item.reason}</div>
          ))}
          <div className="mt-3 flex gap-2">
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
        <Card className="p-0">
           <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--ns-border)" }}>
             <div className="flex items-center justify-between gap-3">
               <span className="text-[15px] font-semibold">近期動態</span>
               <span className="muted text-xs">{displayRows.length} 筆</span>
             </div>
             {/* Search on its own row below the title (B9). */}
             <label className="relative block mt-2.5">
               <MagnifyingGlass size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ns-muted)" }} />
               <input className="ns-input text-xs w-full h-[34px]" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋商家、分類或備註" style={{ padding: "0 12px 0 30px" }} />
             </label>
           </div>

           {displayRows.length === 0 ? (
            <div className="text-center" style={{ padding: "56px 20px" }}>
              <div className="w-[52px] h-[52px] inline-flex items-center justify-center mb-3.5" style={{ borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                <Receipt size={24} weight="duotone" />
              </div>
              <div className="font-semibold mb-1.5">還沒有記帳資料</div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => openCreate("expense")}><Plus size={14} weight="bold" />新增交易</Button>
                <Button variant="outline" onClick={() => csvInputRef.current?.click()}><UploadSimple size={14} />匯入 CSV</Button>
              </div>
            </div>
           ) : isLongRangeView ? (
            <>
              {/* Month-collapsed view for long ranges (YTD / 近12個月 / 全部 /
                  a >92-day custom range) — plan 169 variant D. */}
              {monthGroups.map((m) => {
                const expanded = effectiveExpandedMonths.has(m.month);
                return (
                  <div key={m.month}>
                    <button
                      type="button"
                      className="ns-cf-month-header w-full flex items-center justify-between gap-3 text-left cursor-pointer"
                      onClick={() => toggleMonth(m.month)}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        <span className="text-sm font-medium whitespace-nowrap">{formatMonthLabel(m.month)}</span>
                        <span className="muted text-xs whitespace-nowrap">{m.count} 筆</span>
                      </span>
                      <span className="flex items-center gap-3 text-caption mono whitespace-nowrap">
                        <span style={{ color: "var(--ns-pos)" }}>收入 +{primaryCurrency} {formatNumber(m.income)}</span>
                        <span style={{ color: "var(--ns-neg)" }}>支出 −{primaryCurrency} {formatNumber(m.expense)}</span>
                        <span className={m.net >= 0 ? "pos" : "neg"}>淨 {m.net >= 0 ? "+" : "−"}{primaryCurrency} {formatNumber(Math.abs(m.net))}</span>
                      </span>
                    </button>
                    {expanded ? (
                      <div style={{ borderLeft: "2px solid var(--ns-border)", marginLeft: 22 }}>
                        {groupByDay(m.rows, toPrimary).map((g) => renderDayGroup(g, true))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </>
           ) : (
            <>
              {dayGroups.map((g) => renderDayGroup(g))}
              {visibleCount < displayRows.length ? (
                <div className="text-center" style={{ padding: "16px 20px 20px" }}>
                  <Button variant="outline" onClick={() => setVisibleCount((c) => c + 30)}>顯示更早的交易</Button>
                  <div className="muted text-caption mt-1.5">每次多載 30 筆</div>
                </div>
              ) : null}
            </>
           )}
        </Card>

        {/* Right column: 固定收支 (30 天) + 未結清 — sticky on desktop. */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-5 self-start">
          <UpcomingPayments
            recurringRows={recurringRows}
            accountName={accountName}
            timezone={timezone}
            onPost={async (id) => { try { await postRecurring.mutateAsync(id); toast.success("已記入交易"); } catch { toast.error("記入失敗"); } }}
            posting={postRecurring.isPending}
            onManage={() => setActiveTab("recurring")}
            primaryCurrency={primaryCurrency}
            convert={settlementConvert}
          />
          {settlements.items.length > 0 ? (
            <Card style={{ padding: "var(--ns-pad-card)" }}>
              <div className="text-sm font-semibold mb-2.5">未結清</div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {settlements.receivableTotal > 0 ? (
                  <div className="flex items-baseline gap-1.5">
                    <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收 {settlements.receivableCount}</Badge>
                    <span className="num text-[15px]" style={{ color: "var(--ns-pos)" }}>+{primaryCurrency} {formatNumber(settlements.receivableTotal)}</span>
                  </div>
                ) : null}
                {settlements.payableTotal > 0 ? (
                  <div className="flex items-baseline gap-1.5">
                    <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付 {settlements.payableCount}</Badge>
                    <span className="num text-[15px]" style={{ color: "var(--ns-neg)" }}>−{primaryCurrency} {formatNumber(settlements.payableTotal)}</span>
                  </div>
                ) : null}
              </div>
              <div className="muted text-caption mb-2.5">結清後才計入收支</div>
              <div className="flex flex-col gap-2">
                {settlements.items.map((item) => (
                  <div
                    key={item.id}
                    className="text-body flex items-center justify-between gap-2 cursor-pointer"
                    onClick={() => {
                      const row = ledgerRows.find((r) => r.id === item.id);
                      if (row) setDetailRow(row);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{item.name}</div>
                      <div className="muted text-caption">{item.date.slice(0, 10)}</div>
                    </div>
                    <span className="num whitespace-nowrap" style={{ color: item.kind === "receivable" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                      {item.kind === "receivable" ? "+" : "−"}{item.currency} {formatNumber(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
      </>
      )}

      {activeTab === "categories" && (
        <CategoriesTab dateRange={dateRange} ledgerRows={bookLedgerRows} appSettings={appSettings} primaryCurrency={primaryCurrency} toPrimary={toPrimary} onSettingsClick={() => setCategoryDrawerOpen(true)} />
      )}

      {activeTab === "merchants" && (
        <MerchantsTab dateRange={dateRange} ledgerRows={bookLedgerRows} primaryCurrency={primaryCurrency} toPrimary={toPrimary} />
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
        splitLegs={splitLegs}
        setSplitLegs={setSplitLegs}
        onOpenImport={() => csvInputRef.current?.click()}
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
        onSettle={(row) => { setDetailRow(null); setSettlePrompt(row); }}
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
    <ModalShell
      variant="center"
      title={isReceivable ? "收款結清" : "付款結清"}
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="ns-modal-panel"
    >
      {(dismiss) => (<>
        <div className="text-[15px] font-semibold mb-1">{isReceivable ? "收款結清" : "付款結清"}</div>
        <div className="text-xs muted mb-4" style={{ lineHeight: 1.6 }}>
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
            positionerClassName="z-[1001]"
          />
        </DrawerField>
        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <Button variant="outline" onClick={dismiss} disabled={pending}>取消</Button>
          <Button onClick={() => accountId && onConfirm(accountId)} disabled={pending || !accountId}>
            <Check size={14} weight="bold" />結清
          </Button>
        </div>
      </>)}
    </ModalShell>
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
    <ModalShell
      variant="center"
      title="套用變更範圍"
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="ns-modal-panel"
    >
      {(dismiss) => (<>
        <div className="text-[15px] font-semibold mb-1">套用變更範圍</div>
        <div className="text-xs muted mb-4">這是由週期規則產生的紀錄，請選擇要套用的範圍。</div>
        <div className="flex flex-col gap-2">
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
              <div className="text-xs muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={dismiss} disabled={pending}>取消</Button>
        </div>
      </>)}
    </ModalShell>
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
    <ModalShell
      variant="center"
      title="刪除分期紀錄"
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="ns-modal-panel"
    >
      {(dismiss) => (<>
        <div className="text-[15px] font-semibold mb-1">刪除分期紀錄</div>
        <div className="text-xs muted mb-4">
          {label ? `這是第 ${row.installmentIndex}/${row.installmentTotal} 期的分期紀錄，請選擇刪除範圍。` : "請選擇刪除範圍。"}
        </div>
        <div className="flex flex-col gap-2">
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
              <div className="text-xs muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{o.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={dismiss} disabled={pending}>取消</Button>
        </div>
      </>)}
    </ModalShell>
  );
}

/* ─────────────── Ledger row ─────────────── */

function LedgerRow({
  row,
  transferPair,
  splitLegs,
  splitExpanded,
  onToggleSplit,
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
  /** When set, this row is a collapsed 多類別拆分 (all legs, `amount` = total). */
  splitLegs?: LedgerTransaction[];
  splitExpanded?: boolean;
  /** Row click on a split → toggle the inline per-leg expansion. */
  onToggleSplit?: () => void;
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

  // Collapsed 拆分 group: one row (merchant + derived total +「拆分 N 筆」),
  // tap to expand into its per-category legs. Edit/delete act on the group.
  if (splitLegs && splitLegs.length > 0) {
    const positive = row.amount >= 0;
    const color = positive ? "var(--ns-pos)" : "var(--ns-neg)";
    const sign = positive ? "+" : "−";
    const subtitle = [row.merchant || null, row.accountId ? accountName(row.accountId) : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <>
        <div
          className="ns-cf-row flex items-center gap-3 cursor-pointer"
          onClick={onToggleSplit}
          style={{ padding: "9px 20px", borderBottom: "1px solid var(--ns-border)" }}
        >
          <div className="w-[30px] h-[30px] shrink-0 flex items-center justify-center" style={{ borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)" }}>
            <Receipt size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                {row.name || row.merchant || "多類別"}
              </span>
              <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>
                拆分 {splitLegs.length} 筆
              </Badge>
              {splitExpanded ? <CaretDown size={11} style={{ color: "var(--ns-fg-muted)", flexShrink: 0 }} /> : <CaretRight size={11} style={{ color: "var(--ns-fg-muted)", flexShrink: 0 }} />}
            </div>
            <div className="muted text-caption truncate">{subtitle}</div>
          </div>
          <div className="text-right">
            <div className="num text-[14.5px]" style={{ color }}>{sign}{currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
          </div>
          <div className="ns-cf-actions flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" title="編輯拆分" onClick={onOpenEdit}><PencilSimple size={13} /></Button>
            <Button variant="ghost" size="icon-sm" title="複製" onClick={onDuplicate}><CopySimple size={13} /></Button>
            <Button variant="ghost" size="icon-sm" title="刪除（整組刪除）" onClick={onDelete} style={{ color: "var(--ns-neg)" }}><Trash size={13} /></Button>
          </div>
        </div>
        {splitExpanded ? (
          <div className="ns-split-expansion">
            {splitLegs.map((leg) => (
              <div key={leg.id} className="ns-split-leg-line">
                <span className="muted text-caption truncate">
                  {leg.category || "未分類"}{leg.subcategory ? ` / ${leg.subcategory}` : ""}
                </span>
                <span className="muted text-caption" style={{ fontFamily: "var(--ns-font-mono)", whiteSpace: "nowrap" }}>
                  {leg.amount >= 0 ? "+" : "−"}{currencySymbol(leg.currency)}{formatNumber(Math.abs(leg.amount))}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </>
    );
  }

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
        className="ns-cf-row flex items-center gap-3 cursor-pointer"
        onClick={onEdit}
        style={{ padding: "9px 20px", borderBottom: "1px solid var(--ns-border)" }}
      >
        <div className="w-[30px] h-[30px] shrink-0 flex items-center justify-center" style={{ borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)" }}>
          <ArrowsLeftRight size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
              轉帳{crossCcy ? ` · ${source.currency} → ${dest.currency}` : ""}
            </span>
          </div>
          <div className="muted text-caption truncate">{subtitleParts.join(" · ")}</div>
        </div>
        <div className="text-right">
          <div className="num text-[14.5px]" style={{ color: "var(--ns-fg)" }}>{currencySymbol(source.currency)}{formatNumber(Math.abs(source.amount))}</div>
          {crossCcy ? (
            <div className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>→ {currencySymbol(dest.currency)}{formatNumber(Math.abs(dest.amount))}</div>
          ) : null}
        </div>
        <div className="ns-cf-actions flex gap-1" onClick={e => e.stopPropagation()}>
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
      className="ns-cf-row flex items-center gap-3 cursor-pointer"
      onClick={onEdit}
      style={{ padding: "9px 20px", borderBottom: "1px solid var(--ns-border)" }}
    >
      <div className="w-[30px] h-[30px] shrink-0 flex items-center justify-center" style={{ borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)" }}>
        {isTransfer ? <ArrowsLeftRight size={14} /> : categoryIcon ? <Glyph name={categoryIcon} size={15} /> : <Tag size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            {row.name || row.category || (isTransfer ? "轉帳" : "未命名")}
          </span>
          {isReceivable ? <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收</Badge> : null}
          {isPayable ? <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付</Badge> : null}
          {installmentLabel(row) ? <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>{installmentLabel(row)}</Badge> : null}
        </div>
        <div className="muted text-caption truncate">{subtitle}</div>
      </div>
      <div className="text-right">
        {row.originalCurrency && row.originalAmount != null ? (
          <>
            <div className="num text-[14.5px]" style={{ color }}>{sign}{currencySymbol(row.originalCurrency)}{formatNumber(Math.abs(row.originalAmount))}</div>
            <div className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>≈ {currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
          </>
        ) : (
          <div className="num text-[14.5px]" style={{ color }}>{sign}{currencySymbol(row.currency)}{formatNumber(Math.abs(row.amount))}</div>
        )}
      </div>
      <div className="ns-cf-actions flex gap-1" onClick={e => e.stopPropagation()}>
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
      <div className="text-xs mb-2 muted font-medium">{label}</div>
      <div className="num text-stat font-medium" style={{ color }}>{value}</div>
    </Card>
  );
}

function RankingCard({ title, rows, emptyText, currency }: { title: string; rows: Array<{ name: string; amount: number }>; emptyText: string; currency: string }) {
  const max = rows[0]?.amount ?? 1;
  return (
    <Card style={{ padding: "var(--ns-pad-card)" }}>
      <div className="text-sm font-semibold mb-3.5">{title}</div>
      {rows.length === 0 ? (
        <div className="muted text-body">{emptyText}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.name}>
              <div className="text-body flex justify-between mb-[5px]">
                <span className="truncate">{row.name}</span>
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

function UpcomingPayments({
  recurringRows,
  accountName,
  timezone,
  onPost,
  posting,
  onManage,
  primaryCurrency,
  convert,
}: {
  recurringRows: RecurringTransaction[];
  accountName: (id: string) => string;
  timezone: string;
  onPost: (id: string) => void;
  posting: boolean;
  /** Jump to the 週期規則 tab. */
  onManage: () => void;
  primaryCurrency: string;
  /** Same converter as `settlements` — amount in `currency` → primary currency. */
  convert: (amount: number, currency: string) => number;
}) {
  const today = todayInTimezone(timezone);
  const horizon = (() => {
    // Deterministic date-string arithmetic from `today` (UTC-anchored so the
    // result is independent of the host timezone / DST).
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10);
  })();
  const active = recurringRows.filter((row) => row.isActive);
  const upcoming = active
    .filter((row) => row.nextRunDate >= today && row.nextRunDate <= horizon)
    .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate));
  // A few rules beyond the 30-day horizon, for context (dimmed, no 記入 — too
  // far out to post yet).
  const later = active
    .filter((row) => row.nextRunDate > horizon)
    .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
    .slice(0, 5);
  const monthlyTotal = active.reduce((sum, row) => {
    const sign = row.entryType === "income" ? 1 : -1;
    const monthly = Math.abs(row.amount) * FREQUENCY_MONTHLY_FACTOR[row.frequency] * sign;
    return sum + convert(monthly, row.currency);
  }, 0);

  return (
    <Card style={{ padding: "var(--ns-pad-card)" }}>
      <div className="flex items-center gap-2 mb-3.5">
        <CalendarBlank size={15} weight="duotone" style={{ color: "var(--ns-accent)" }} />
        <span className="text-sm font-semibold">固定收支 · 30 天</span>
      </div>
      {upcoming.length === 0 && later.length === 0 ? (
        <div className="muted text-body">近期沒有排定的週期事件。</div>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <div className="flex flex-col gap-2">
              {upcoming.map((row) => (
                <div key={row.id} className="text-body flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{row.merchant || row.category}</div>
                    <div className="muted text-caption">{row.nextRunDate} · {accountName(row.accountId)}</div>
                  </div>
                  <span className="num whitespace-nowrap" style={{ color: row.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                    {row.entryType === "income" ? "+" : "−"}{row.currency} {formatNumber(Math.abs(row.amount))}
                  </span>
                  <Button variant="ghost" size="xs" className="whitespace-nowrap" disabled={posting} onClick={() => onPost(row.id)} title="立即記入這筆交易">記入</Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted text-body">30 天內沒有排定的週期事件。</div>
          )}
          {later.length > 0 ? (
            <div className="mt-3.5 pt-3 flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--ns-border)" }}>
              <div className="muted text-caption font-medium mb-0.5">之後</div>
              {later.map((row) => (
                <div key={row.id} className="text-caption flex items-center justify-between gap-2 muted">
                  <span className="truncate">{row.nextRunDate} · {row.merchant || row.category}</span>
                  <span className="num whitespace-nowrap">
                    {row.entryType === "income" ? "+" : "−"}{row.currency} {formatNumber(Math.abs(row.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      {active.length > 0 ? (
        <div className="mt-3.5 pt-3 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--ns-border)" }}>
          <span className="muted text-caption">
            每月固定{" "}
            <span className="num" style={{ color: monthlyTotal >= 0 ? "var(--ns-pos)" : "var(--ns-neg)" }}>
              {monthlyTotal >= 0 ? "+" : "−"}{primaryCurrency} {formatNumber(Math.abs(monthlyTotal))}
            </span>{" "}
            · {active.length} 條規則
          </span>
          <Button variant="ghost" size="xs" className="whitespace-nowrap" onClick={onManage}>管理 ›</Button>
        </div>
      ) : null}
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
  splitLegs,
  setSplitLegs,
  onOpenImport,
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
  merchantSuggestions: string[];
  categorySuggestions: { merchants: string[]; accountIds: string[] };
  categoryForMerchant: (merchant: string) => { category: string; subcategory: string } | null;
  accountRows: Array<Pick<Account, "id" | "name" | "currency" | "type" | "iconName" | "color" | "bankBrandDomain" | "bookId">>;
  onSubmitLedger: () => void;
  onSubmitTransfer: () => void;
  message: string;
  drawerRecurringFreq: string;
  setDrawerRecurringFreq: (v: string) => void;
  editingRecurringRuleId: string | null;
  recurringRows: import("../domain").RecurringTransaction[];
  installmentPeriods: number;
  setInstallmentPeriods: (v: number) => void;
  /** 多類別拆分 legs — null = plain single-category form (plan 182). */
  splitLegs: SplitLegDraftState[] | null;
  setSplitLegs: (legs: SplitLegDraftState[] | null) => void;
  onOpenImport?: () => void;
}) {
  const [amountFocused, setAmountFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // 帳本 entry default (plan 189 §5): the single-account 支出/收入 picker defaults
  // to the active book's accounts with a 顯示全部 escape. 總帳 shows all. NOTE:
  // transfer source/dest and the AR/AP 代墊 counter-account pickers deliberately
  // stay full-list — cross-book transfers (股東代墊/owner's draw) are an explicit
  // supported flow and must be able to reach the other book's accounts.
  const activeBookId = useUiPreferences((state) => state.activeBookId);
  const isAllBooksEntry = activeBookId === ALL_BOOKS;
  const [showAllEntryAccounts, setShowAllEntryAccounts] = useState(false);
  useEffect(() => { if (open) { setShowAdvanced(false); setShowAllEntryAccounts(false); } }, [open]);
  const entryPickerAccounts = isAllBooksEntry || showAllEntryAccounts
    ? accountRows
    : accountRows.filter((a) => a.bookId === activeBookId);

  // Scrim must dim only the content area, never the native-vibrancy sidebar
  // (otherwise it flattens into a grey block — plan 052). The desktop sidebar
  // grid column is 64px collapsed / 240px expanded and only exists at the `lg`
  // breakpoint (≥1024px); below that the scrim stays full-width (see the
  // media query in the inline <style> below).
  const sidebarCollapsed = useUiPreferences((state) => state.sidebarCollapsed);
  const scrimLeft = sidebarCollapsed ? 64 : 240;

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

  // Two-phase close (mirrors ModalShell's requestClose): let the exit
  // transition on the panel play before telling the parent to unmount us.
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    const panel = panelRef.current;
    // jsdom / legacy engines: computed transition-duration is empty or 0s →
    // close synchronously.
    const dur = panel ? parseFloat(getComputedStyle(panel).transitionDuration || "0") : 0;
    if (!panel || !dur) {
      closingRef.current = true;
      onClose();
      return;
    }
    closingRef.current = true;
    setClosing(true);
  }, [onClose]);

  // Reopening the drawer must clear any stale closing state from a previous close.
  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setClosing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    if (!panel) {
      onClose();
      return;
    }
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      onClose();
    }
    function onTransitionEnd(event: TransitionEvent) {
      if (event.target !== panel) return;
      finish();
    }
    panel.addEventListener("transitionend", onTransitionEnd);
    const timeout = window.setTimeout(finish, 300);
    return () => {
      panel.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(timeout);
    };
  }, [closing, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    const releaseScrollLock = lockViewportScroll();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, requestClose]);

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

  // 多類別拆分 (plan 182): non-null legs put the expense/income form in MOZE-
  // style split mode — per-leg category+amount rows, the main amount field
  // becomes the derived Σ legs (read-only), save goes through create/updateSplit.
  const splitMode = isAcct && splitLegs !== null;
  const splitTotal = splitMode && splitLegs ? derivedSplitTotal(splitLegs) : 0;
  const splitError = splitMode && splitLegs ? splitLegsError(splitLegs) : null;
  // The「＋ 分類」affordance: only once a category is picked, only for plain
  // (non-editing, non-installment) expense/income drafts, and not while the
  // amount is being entered in a foreign currency (splits store one account-
  // currency amount per leg; no originalAmount support on legs).
  const canEnterSplit =
    isAcct && !splitMode && !editing && !activeInstallment && !isForeignEntry && Boolean(ledgerForm.category.trim());

  function enterSplit() {
    // Legs are amounts in the ACCOUNT currency; pin the display currency so a
    // later currency-selector change can't desync the derived total's unit.
    setEntryDisplayCurrency(ledgerForm.currency);
    setSplitLegs(enterSplitMode({
      category: ledgerForm.category,
      subcategory: ledgerForm.subcategory,
      amountExpression,
    }));
  }

  function removeLegAt(index: number) {
    if (!splitLegs) return;
    const next = removeSplitLeg(splitLegs, index);
    if (shouldExitSplitMode(next)) {
      // Down to 1 leg → back to the plain form carrying that leg's values.
      const remaining = next[0] ?? makeEmptySplitLeg();
      setLedgerForm({ ...ledgerForm, category: remaining.category, subcategory: remaining.subcategory });
      setAmountExpression(remaining.amount || "0");
      setSplitLegs(null);
    } else {
      setSplitLegs(next);
    }
  }

  // History-driven suggestions for the chosen category, shown as one-tap chips.
  // Only surfaced while the relevant field is still empty so we never override
  // a value the user already entered. Split mode hides them: `ledgerForm.category`
  // is stale there (legs own the categories).
  const hasCategory = Boolean(ledgerForm.category.trim());
  const merchantChips = !splitMode && hasCategory && !ledgerForm.merchant.trim()
    ? categorySuggestions.merchants.filter((m) => m && m !== ledgerForm.merchant)
    : [];
  const accountChips = !splitMode && hasCategory && !ledgerForm.accountId
    ? categorySuggestions.accountIds
        .map((id) => accountRows.find((a) => a.id === id))
        .filter((a): a is (typeof accountRows)[number] => Boolean(a))
    : [];

  return (
    <div className="fixed inset-0 z-50" onClick={requestClose}>
      {/* Scrim covers only the content area, leaving the native-vibrancy
          sidebar untouched on desktop; full-width below the lg breakpoint. */}
      <style>{`@media (max-width:1023.98px){.ns-entry-scrim{left:0 !important;}}`}</style>
      <div
        className="ns-entry-scrim ns-overlay-scrim absolute top-0 right-0 bottom-0"
        style={{ left: scrimLeft, background: "var(--ns-scrim)" }}
        data-closing={closing || undefined}
      />
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        className="ns-overlay-panel absolute right-0 top-0 bottom-0 flex flex-col"
        data-motion="drawer"
        data-closing={closing || undefined}
        style={{
          width: "min(500px, 100%)",
          background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)",
          boxShadow: "var(--ns-shadow-2)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3" style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--ns-border)" }}>
          <div className="w-8 h-8 flex items-center justify-center" style={{ borderRadius: "var(--ns-r-sm)", background: meta.color, color: "#fff" }}>
            <Plus size={15} weight="bold" />
          </div>
          <h2 className="text-lg m-0 font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>
            {editing ? "編輯交易" : "新增交易"}
          </h2>
          <div className="flex-1" />
          {onOpenImport && !editing && (
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => { onClose(); onOpenImport(); }}>
              <UploadSimple size={14} style={{ marginRight: 6 }} />匯入 CSV
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={requestClose} aria-label="關閉"><X size={16} /></Button>
        </div>

        {/* Type tabs */}
        <div style={{ padding: "16px 24px 0" }}>
          <div className="flex gap-1.5 flex-wrap">
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
                    fontFamily: "inherit", transition: "background 150ms var(--ns-ease), color 150ms var(--ns-ease), border-color 150ms var(--ns-ease)",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto flex flex-col gap-[18px]" style={{ padding: "20px 24px" }}>
          {/* Recurring rule banner */}
          {linkedRule && (
            <div className="text-xs flex items-center gap-2" style={{
              padding: "10px 14px", borderRadius: "var(--ns-r-sm)",
              background: "var(--ns-accent-soft)", border: "1px solid var(--ns-accent)",
            }}>
              <span className="font-semibold" style={{ color: "var(--ns-accent)" }}>週期交易</span>
              <span className="muted">
                此筆由週期規則「{linkedRule.merchant || linkedRule.category}」自動產生（{recurringFrequencyLabels[linkedRule.frequency]}）
              </span>
            </div>
          )}
          {/* Amount — in split mode this is the READ-ONLY derived Σ of the
              leg amounts (MOZE:「多類別 $180」), never directly editable. */}
          <DrawerField
            label={splitMode
              ? `多類別 · 共 ${ledgerForm.currency} ${formatNumber(splitTotal)}`
              : `${meta.eyebrow} · ${type === "transfer" ? transferForm.sourceCurrency : entryDisplayCurrency}`}
            required
          >
            <div style={{
              display: "flex", alignItems: "center",
              background: "var(--ns-bg-elev)",
              border: amountFocused ? "1px solid var(--ns-accent)" : "1px solid var(--ns-border)",
              boxShadow: amountFocused ? "0 0 0 3px var(--ns-accent-soft)" : "none",
              borderRadius: "var(--ns-r-sm)", height: 52, overflow: "hidden",
              transition: "border-color 0.12s, box-shadow 0.12s",
            }}>
              {isAcct && entryCurrencies.length > 1 && !splitMode ? (
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
                  {type === "transfer" ? transferForm.sourceCurrency : splitMode ? ledgerForm.currency : entryDisplayCurrency}
                </span>
              )}
              {splitMode ? (
                <div
                  className="text-stat"
                  aria-label="多類別總金額（各明細加總）"
                  style={{
                    flex: 1, padding: "0 14px", fontFamily: "var(--ns-font-mono)",
                    color: meta.color, textAlign: "right", height: "100%",
                    minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end",
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                >
                  {formatNumber(splitTotal)}
                </div>
              ) : type === "transfer" ? (
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
            {splitMode && (
              <div className="muted text-caption" style={{ marginTop: 5 }}>
                總金額為下方各分類明細金額的加總。
              </div>
            )}
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
            <div className="grid grid-cols-2 gap-3.5">
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
              <div className="muted text-caption mt-1">
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
              <div className="muted text-caption mt-1">跨行/跨國轉帳手續費，將從轉出帳戶另計一筆「手續費」支出。</div>
            </DrawerField>
          )}

          {/* Expense / income — progressive flow: 分類 → 帳戶 → 名稱/商家 → 更多選項 */}
          {isAcct && (
            <>
              {/* 1 · Category drives the merchant & account suggestions below.
                  Split mode replaces the single picker with one leg row per
                  category, each carrying its own amount (MOZE-style). */}
              {splitMode && splitLegs ? (
                <DrawerField label="多類別明細" required>
                  <div className="flex flex-col gap-2.5">
                    {splitLegs.map((legState, index) => (
                      <div key={index} className="ns-split-leg">
                        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                          <span className="muted text-caption" style={{ fontFamily: "var(--ns-font-mono)" }}>#{index + 1}</span>
                          <span className="text-xs font-medium flex-1 truncate">
                            {legState.category
                              ? `${legState.category}${legState.subcategory ? ` / ${legState.subcategory}` : ""}`
                              : "未選擇分類"}
                          </span>
                          <input
                            className="ns-input text-right"
                            style={{ width: 110, height: 32, fontFamily: "var(--ns-font-mono)" }}
                            value={legState.amount}
                            onChange={(e) => setSplitLegs(updateSplitLeg(splitLegs, index, { amount: e.target.value }))}
                            placeholder="0"
                            inputMode="decimal"
                            aria-label={`第 ${index + 1} 筆明細金額`}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`移除第 ${index + 1} 筆明細`}
                            title="移除此明細"
                            onClick={() => removeLegAt(index)}
                          >
                            <X size={13} />
                          </Button>
                        </div>
                        <CategoryChipPicker
                          categories={categories}
                          category={legState.category}
                          subcategory={legState.subcategory}
                          onPick={(name) => setSplitLegs(updateSplitLeg(splitLegs, index, { category: name, subcategory: "" }))}
                          onPickSub={(s) => setSplitLegs(updateSplitLeg(splitLegs, index, { subcategory: s }))}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        className="text-xs"
                        onClick={() => setSplitLegs(addSplitLeg(splitLegs))}
                        style={{
                          padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                          background: "transparent", color: "var(--ns-accent)",
                          border: "1px dashed var(--ns-accent)", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <Plus size={12} weight="bold" />新增分類
                      </button>
                      {splitError ? (
                        <span className="text-caption" style={{ color: "var(--ns-neg)" }}>{splitError}</span>
                      ) : null}
                    </div>
                  </div>
                </DrawerField>
              ) : (
                <DrawerField label="分類" required>
                  <CategoryChipPicker
                    categories={categories}
                    category={ledgerForm.category}
                    subcategory={ledgerForm.subcategory}
                    onPick={(name) => setLedgerForm({ ...ledgerForm, category: name, subcategory: "" })}
                    onPickSub={(s) => setLedgerForm({ ...ledgerForm, subcategory: s })}
                    trailing={canEnterSplit ? (
                      <button
                        type="button"
                        className="text-xs"
                        onClick={enterSplit}
                        title="拆分為多個分類，各自填金額"
                        style={{
                          padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                          background: "transparent", color: "var(--ns-accent)",
                          border: "1px dashed var(--ns-accent)", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <Plus size={12} weight="bold" />分類
                      </button>
                    ) : undefined}
                  />
                </DrawerField>
              )}

              {/* 2 · Account + date, with a suggested account from history */}
              <div>
                <div className="grid grid-cols-2 gap-3.5">
                  <DrawerField label={type === "expense" ? "支出帳戶" : "收入帳戶"} required>
                    <AccountFilter
                      accounts={entryPickerAccounts}
                      value={ledgerForm.accountId}
                      onChange={(id) => {
                        const account = accountRows.find((a) => a.id === id);
                        setLedgerForm({ ...ledgerForm, accountId: id, currency: account?.currency ?? ledgerForm.currency });
                      }}
                      allowAll={false}
                      placeholder="選擇帳戶"
                      style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                    />
                    {!isAllBooksEntry && !showAllEntryAccounts ? (
                      <button
                        type="button"
                        className="muted text-xs"
                        style={{ marginTop: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        onClick={() => setShowAllEntryAccounts(true)}
                      >
                        顯示全部帳戶
                      </button>
                    ) : null}
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
                <div className="grid grid-cols-2 gap-3.5">
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
                  so picking a credit card immediately reveals the option.
                  Hidden in split mode (a split can't also be an installment). */}
              {canInstallment && !splitMode && (
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
                  <div className="muted text-caption mt-1">
                    {activeInstallment
                      ? `總額將平均拆成 ${installmentPeriods} 筆，逐月入帳到對應的帳單週期。`
                      : "輸入 2–60（期數）啟用分期；留空或填 0 表示不分期。"}
                  </div>
                </DrawerField>
              )}

              {type === "expense" && isCreditAccount && (
                <DrawerField label="入帳時間（信用卡）">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="ns-input"
                      style={{ flex: 1, cursor: "pointer", fontWeight: ledgerForm.postDate ? 400 : 600, color: ledgerForm.postDate ? "var(--ns-fg-muted)" : "var(--ns-fg)" }}
                      onClick={() => setLedgerForm({ ...ledgerForm, postDate: null })}
                    >
                      當下入帳
                    </button>
                    <button
                      type="button"
                      className="ns-input"
                      style={{ flex: 1, cursor: "pointer", fontWeight: ledgerForm.postDate ? 600 : 400, color: ledgerForm.postDate ? "var(--ns-fg)" : "var(--ns-fg-muted)" }}
                      onClick={() => setLedgerForm({ ...ledgerForm, postDate: ledgerForm.postDate ?? (ledgerForm.date ? ledgerForm.date.slice(0, 10) : "") })}
                    >
                      延後到…
                    </button>
                  </div>
                  {ledgerForm.postDate != null && (
                    <input
                      className="ns-input"
                      type="date"
                      value={ledgerForm.postDate.slice(0, 10)}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, postDate: e.target.value })}
                      style={{ fontFamily: "var(--ns-font-mono)", marginTop: 8 }}
                    />
                  )}
                  <div className="muted text-caption mt-1">
                    {ledgerForm.postDate
                      ? "這筆消費仍立即計為負債，但會歸到入帳日所屬的帳單週期。"
                      : "預設依消費日歸入帳單週期。"}
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
                  {(type === "expense" || type === "income") && !editing && !activeInstallment && !splitMode && (
                    <DrawerField label={`外加手續費（選填） · ${ledgerForm.currency}`}>
                      <input
                        className="ns-input"
                        placeholder="0"
                        style={{ fontFamily: "var(--ns-font-mono)" }}
                        {...expenseFeeField}
                      />
                      <div className="muted text-caption mt-1">
                        {type === "income"
                          ? "薪轉/跨行/海外匯入手續費，將另計一筆「手續費」支出。收入以總額（gross）計入，帳戶實際入帳為總額扣除手續費。"
                          : "海外刷卡/跨國交易手續費，將另計一筆「手續費」支出。"}
                      </div>
                    </DrawerField>
                  )}
                  {!activeInstallment && !splitMode && (
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
                <div className="flex flex-wrap gap-1.5">
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
        <div className="flex gap-2" style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)" }}>
          <Button variant="outline" className="shrink-0 grow-0 basis-20 justify-center" onClick={requestClose}>取消</Button>
          <Button
            className="flex-1 justify-center"
            style={{ background: meta.color, borderColor: meta.color, color: "#fff" }}
            onClick={type === "transfer" ? onSubmitTransfer : onSubmitLedger}
            disabled={splitMode && Boolean(splitError)}
          >
            <Check size={14} weight="bold" />
            {editing ? "儲存變更" : type === "ar" ? "記錄應收" : type === "ap" ? "記錄應付" : type === "transfer" ? "建立轉帳" : "儲存交易"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Parent-category chips + child-subcategory chips, shared by the plain 分類
 * field and by every 多類別拆分 leg row (plan 182) so the two pickers can
 * never drift visually. `trailing` renders after the parent chips (the plain
 * form's「＋ 分類」split affordance).
 */
function CategoryChipPicker({
  categories,
  category,
  subcategory,
  onPick,
  onPickSub,
  trailing,
}: {
  categories: Array<{ name: string; children: string[]; color?: string; iconName?: string }>;
  category: string;
  subcategory: string;
  /** Parent chip tap — callers reset the subcategory themselves. */
  onPick: (category: string) => void;
  onPickSub: (subcategory: string) => void;
  trailing?: ReactNode;
}) {
  const subcategories = categories.find((c) => c.name === category)?.children ?? [];
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: subcategories.length ? 10 : 0 }}>
        {categories.map((c) => {
          const active = category === c.name;
          const color = c.color || "var(--ns-accent)";
          return (
            <button
              key={c.name}
              className="text-xs"
              onClick={() => onPick(c.name)}
              style={{
                padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                background: active ? color : "var(--ns-bg-card)",
                // Contrast-aware text so light category colors don't swallow
                // the label; faint border gives light chips edge definition (B14).
                color: active ? readableTextColor(color) : "var(--ns-fg)",
                border: active ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--ns-border)",
                fontFamily: "inherit", transition: "background 120ms var(--ns-ease), color 120ms var(--ns-ease), border-color 120ms var(--ns-ease)",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              {c.iconName && <Glyph name={c.iconName} size={14} />}
              {c.name}
            </button>
          );
        })}
        {categories.length === 0 ? <span className="muted text-xs">尚未建立分類，可於設定新增。</span> : null}
        {trailing}
      </div>
      {subcategories.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: 10, borderLeft: "2px solid var(--ns-border)" }}>
          {subcategories.map((s) => {
            const active = subcategory === s;
            return (
              <button
                key={s}
                className="text-xs"
                onClick={() => onPickSub(s)}
                style={{
                  padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  background: active ? "var(--ns-accent)" : "var(--ns-bg-hover)",
                  color: active ? "var(--ns-accent-fg)" : "var(--ns-fg-muted)",
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
    </>
  );
}

function DrawerField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="text-caption block muted mb-1.5 uppercase" style={{ letterSpacing: 0.04 }}>
        {label}
        {required ? <span style={{ color: "var(--ns-neg)", marginLeft: 3 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

/* ─────────────── helpers ─────────────── */

/** A transfer's two legs (same groupId) collapse into one display row so the
 * activity list shows "來源 → 目標" once instead of a 轉出/轉入 pair. A 多類別
 * 拆分's legs (same groupId, `legKind: "category"`) collapse the same way into
 * one row carrying the group total plus `splitLegs` for the inline expansion.
 * Money aggregations must keep summing RAW rows — a display row's `amount` is
 * the whole group's total, so summing display rows would be fine for nets but
 * loses per-leg category detail (and transfers are dropped to one leg). */
type DisplayRow = LedgerTransaction & {
  transferPair?: { source: LedgerTransaction; dest: LedgerTransaction };
  splitLegs?: LedgerTransaction[];
};

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
    } else if (row.groupId && row.legKind === "category") {
      if (seen.has(row.groupId)) continue;
      seen.add(row.groupId);
      // Same lookup-from-full-ledger rule as transfers: a category/search
      // filter that matched only one leg still shows the complete split.
      const legs = allRows.filter((r) => r.groupId === row.groupId && r.legKind === "category" && r.deletedAt === null);
      const first = legs[0] ?? row;
      // Signed sum: all legs share the entryType's sign, so the total keeps it.
      const total = legs.reduce((sum, leg) => sum + leg.amount, 0);
      out.push({ ...first, amount: total, splitLegs: legs });
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

function SuggestionRow({
  chips,
  onPick,
}: {
  chips: Array<{ key: string; label: string }>;
  onPick: (key: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="muted text-caption inline-flex items-center gap-1">
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
    <div className="relative">
      <input
        className="ns-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {showPanel ? (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden" style={{ borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", background: "var(--ns-bg-card)", boxShadow: "var(--ns-shadow-2)" }}>
          {suggestions.slice(0, 8).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(suggestion);
                setOpen(false);
              }}
              className="text-body block w-full text-left cursor-pointer"
              style={{ padding: "8px 12px", background: "transparent", border: "none", color: "var(--ns-fg)" }}
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
  // 金額輸入框編輯狀態，非最終展示 — 不經 currency helpers
  // eslint-disable-next-line no-restricted-syntax
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
