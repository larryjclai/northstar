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
  Users,
  HandCoins,
} from "@phosphor-icons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStickyChrome } from "../hooks/useStickyChrome";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";
import { SuggestInput } from "../components/SuggestInput";
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
import { ModalCloseButton } from "../components/ModalCloseButton";
import { NumberField } from "../components/NumberField";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { Glyph } from "../lib/icons";
import { escapeTargetInsideDialog } from "../lib/escapeOwnership";
import { readableTextColor } from "../lib/color";
import { lockViewportScroll } from "../lib/scrollLock";
import { SegmentedControl } from "../components/SegmentedControl";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFinanceData, useRepository, useRepositoryMutation } from "../data/hooks";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { ClientAutocomplete } from "../components/ClientAutocomplete";
import { ClientManager } from "../components/ClientManager";
import { useToast } from "../components/Toast";
import { activeFilterChips } from "./activeFilterChips";
import type { ClientDraft, InvoiceDraft, LedgerDraft, TransferDraft } from "../data/repositories";
import {
  buildLedgerLabelStats,
  buildLedgerSuggestions,
  buildMerchantCategoryMap,
  buildOutstandingSettlements,
  classifyLedgerGroup,
  evaluateAmountExpression,
  filterCategoriesByType,
  formatNumber,
  installmentLabel,
  isNeutralLedgerRow,
  isWithinDateScope,
  makeDefaultDateScope,
  nextRecurringDate,
  nowAsDatetimeLocal,
  recurringFrequencyLabels,
  resolveDateScope,
  todayInTimezone,
  toDatetimeLocalValue,
} from "../domain";
import type { SplitLegInput, SplitShareInput, SplitSharedFields } from "../domain/splitLegs";
import { buildInvoiceDrafts, defaultInvoiceDueDate } from "../domain/invoiceEntry";
import { computeSalesTax } from "../domain/salesTax";
import {
  agingBuckets,
  bimonthlyVatSummary,
  currentPeriodVat,
  daysSalesOutstanding,
} from "../domain/invoiceReporting";
import {
  nextInvoiceNumber,
  validateInvoiceNumber,
  type InvoiceNumberPreset,
} from "../domain/invoiceNumbering";
import {
  addShareDraft,
  addSplitLeg,
  combinedSplitError,
  derivedShareTotal,
  derivedSplitTotal,
  enterSplitMode,
  makeEmptySplitLeg,
  removeShareDraft,
  removeSplitLeg,
  shareDraftsError,
  shouldExitSplitMode,
  toShareInputs,
  toSplitLegInputs,
  updateShareDraft,
  updateSplitLeg,
  type SplitLegDraftState,
  type SplitShareDraftState,
} from "./splitEntryState";
import { convertCurrency, buildDailyRateIndex, formatCompactNumber } from "../domain/currency";
import type {
  Account,
  Client,
  DateScopeValue,
  LedgerTransaction,
  RecurringFrequency,
  RecurringTransaction,
  ResolvedDateScope,
} from "../domain";
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

const TYPE_META: Record<CashType, { label: string; color: string; sign: string; eyebrow: string }> =
  {
    expense: { label: "支出", color: "var(--ns-neg)", sign: "−", eyebrow: "支出金額" },
    income: { label: "收入", color: "var(--ns-pos)", sign: "+", eyebrow: "收入金額" },
    transfer: { label: "轉帳", color: "var(--ns-accent)", sign: "", eyebrow: "轉帳金額" },
    ar: { label: "應收帳款", color: "var(--ns-chart-3)", sign: "+", eyebrow: "應收金額" },
    ap: { label: "應付帳款", color: "var(--ns-chart-5)", sign: "−", eyebrow: "應付金額" },
  };

const TYPE_ORDER: CashType[] = ["expense", "income", "ar", "ap", "transfer"];

// 帳齡 card labels (plan 193) — all five buckets are populated and shown;
// notDue (未到期) is deliberately distinct from d1_30 (逾期 1–30 天) so the
// most-watched overdue line is never hidden behind a "not overdue" label.
const AGING_BUCKET_LABELS: Record<string, string> = {
  notDue: "未到期",
  d1_30: "逾期 1–30 天",
  d31_60: "逾期 31–60 天",
  d61_90: "逾期 61–90 天",
  over90: "逾期 90 天以上",
};
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

/**
 * Thrown by the 開發票 mutation when the receivable ledger row was created
 * successfully but the linked invoice metadata failed — see
 * `createInvoiceEntry`'s orphan note (plan 191 step 3).
 */
class InvoiceMetadataError extends Error {}

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
    taxAmount: null,
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
  if (dateScope.preset === "ytd" || dateScope.preset === "last12m" || dateScope.preset === "all")
    return true;
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
  const {
    accounts,
    ledger,
    recurring,
    settings,
    dailyFxRates,
    books,
    isInitialLoading,
    isError,
    error,
    refetchAll,
  } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const activeBookId = useUiPreferences((state) => state.activeBookId);
  const emptyLedger = useMemo(() => makeEmptyLedger(timezone), [timezone]);
  const emptyTransfer = useMemo(() => makeEmptyTransfer(timezone), [timezone]);

  // 開發票 / 客戶主檔 (plan 191): kept local to this route (not added to
  // useFinanceData/hooks.ts, which is out of this plan's file scope) — plain
  // useQuery calls against the shared repository instance, same data as
  // listInvoices()/listClients() would return via the shared hook.
  const repository = useRepository();
  const queryClient = useQueryClient();
  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => repository.data!.listInvoices(),
    enabled: Boolean(repository.data),
  });
  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: () => repository.data!.listClients(),
    enabled: Boolean(repository.data),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<CashType>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurringRuleId, setEditingRecurringRuleId] = useState<string | null>(null);
  // When editing a recurring-rule occurrence, the pending edit waits here while
  // the user picks the scope (this / future / all).
  const [recurringEditPrompt, setRecurringEditPrompt] = useState<
    (LedgerDraft & { id: string }) | null
  >(null);
  // A receivable/payable awaiting its settle-account choice.
  const [settlePrompt, setSettlePrompt] = useState<LedgerTransaction | null>(null);
  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState("none");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [installmentPeriods, setInstallmentPeriods] = useState(0);
  // Installment delete prompt: the row whose delete button was pressed, used to
  // show the three-option chooser (this period / this and later / whole group).
  const [installmentDeletePrompt, setInstallmentDeletePrompt] = useState<LedgerTransaction | null>(
    null,
  );

  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  // 多類別拆分 (plan 182): non-null = the drawer is in MOZE-style split mode,
  // one row per category leg. `editingSplitGroupId` is set while editing an
  // existing split group (save goes through updateSplit with this groupId).
  const [splitLegs, setSplitLegs] = useState<SplitLegDraftState[] | null>(null);
  const [editingSplitGroupId, setEditingSplitGroupId] = useState<string | null>(null);
  // 分帳 (plan 222): per-participant share drafts alongside splitLegs. Always
  // an array (never null) — emptiness IS "no shares", split mode itself is
  // still governed by splitLegs being non-null.
  const [shareDrafts, setShareDrafts] = useState<SplitShareDraftState[]>([]);
  // 編輯轉帳 (plan 227): non-null while editing an existing transfer group (save
  // goes through updateTransfer with this groupId instead of createTransfer).
  // groupId is the stable handle — the display/detail row may be either leg.
  const [editingTransferGroupId, setEditingTransferGroupId] = useState<string | null>(null);
  // Expanded 拆分 groups in the activity list (collapsed by default).
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());
  const [amountExpression, setAmountExpression] = useState(String(Math.abs(emptyLedger.amount)));
  const [entryDisplayCurrency, setEntryDisplayCurrency] = useState(emptyLedger.currency);
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [counterparty, setCounterparty] = useState("");
  const [dueDate, setDueDate] = useState("");
  // 開發票 (plan 191): an 應收帳款 entry can optionally be an invoice. Toggled on
  // either via the dedicated 開發票 toolbar button or an in-drawer toggle;
  // `ar` stays the underlying CashType so the settle rails are untouched.
  const [isInvoiceEntry, setIsInvoiceEntry] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceNumberPreset, setInvoiceNumberPreset] = useState<InvoiceNumberPreset>("TW_UNIFORM");
  // Null when the counterparty typed a free-text name instead of picking an
  // existing 客戶 record — createInvoice tolerates a null clientId.
  const [invoiceClientId, setInvoiceClientId] = useState<string | null>(null);
  const [clientManagerOpen, setClientManagerOpen] = useState(false);

  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const toast = useToast();
  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "month"));
  // `?account=<id>` deep-link from the Accounts page pre-selects that account.
  const {
    account: accountParam,
    tx: txParam,
    from: fromParam,
  } = useSearch({ strict: false }) as { account?: string; tx?: string; from?: string };
  const [selectedAccount, setSelectedAccount] = useState(accountParam ?? "all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "categories" | "merchants" | "recurring">(
    "overview",
  );
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
  const invoiceRows = invoicesQuery.data ?? [];
  const clientRows = clientsQuery.data ?? [];

  // 開發票 (plan 191): gated to a specific 公司帳 (not 總帳, not a personal book)
  // — docs/ledger-books-plan.md §3 scopes invoices to the company book only.
  const activeBookRecord = useMemo(
    () => bookRows.find((b) => b.id === activeBookId) ?? null,
    [bookRows, activeBookId],
  );
  const isActiveCompanyBook = activeBookRecord?.kind === "company";
  const bookClients = useMemo(
    () => clientRows.filter((c) => c.bookId === activeBookId),
    [clientRows, activeBookId],
  );
  const bookInvoices = useMemo(
    () => invoiceRows.filter((i) => i.bookId === activeBookId),
    [invoiceRows, activeBookId],
  );
  // Suggests the next number off the most recently issued invoice in this book.
  const lastInvoiceNumber = useMemo(() => {
    if (bookInvoices.length === 0) return null;
    const sorted = [...bookInvoices].sort(
      (a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt.localeCompare(a.createdAt),
    );
    return sorted[0].invoiceNumber;
  }, [bookInvoices]);

  // 帳本 (Books) switcher scope (plan 189, docs/ledger-books-plan.md §1 #3/#4/#5/#12):
  // cash-flow is a general view → scoped by the active book / 總帳. Accounts
  // belong to exactly one book, so the existing per-account filter composes on
  // top of this. In 總帳 (activeBookId "all") every id is included → identical
  // to pre-books. The transfer-sibling lookup + suggestion pools keep reading
  // the full ledger so cross-book transfers still render.
  const switcherAccountIds = useMemo(
    () => bookAccountIdSet(accountRows, activeBookId),
    [accountRows, activeBookId],
  );
  const bookAccounts = useMemo(
    () => accountRows.filter((a) => switcherAccountIds.has(a.id)),
    [accountRows, switcherAccountIds],
  );
  const bookLedgerRows = useMemo(
    () => scopeRows(ledgerRows, switcherAccountIds),
    [ledgerRows, switcherAccountIds],
  );
  const fxHistory = dailyFxRates.data ?? [];
  const fxIndex = useMemo(() => buildDailyRateIndex(fxHistory), [fxHistory]);
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const toPrimary = useCallback(
    (row: LedgerTransaction, amount = row.amount) =>
      convertCurrency(amount, row.currency, primaryCurrency, appSettings, {
        dailyRateIndex: fxIndex,
        asOfDate: row.date,
      }),
    [appSettings, fxIndex, primaryCurrency],
  );

  // Deep-link from the Reconcile screen: open the transaction's detail panel once
  // the ledger has loaded (matching what a tap on a CashFlow row does).
  useEffect(() => {
    if (!txParam) return;
    const row = ledgerRows.find((r) => r.id === txParam);
    if (row) setDetailRow(row);
  }, [txParam, ledgerRows]);

  // 對帳 round-trip (plan 225): arriving via 編輯交易 from the reconcile page
  // returns there when the user finishes with the transaction.
  const returnIfFromReconcile = useCallback(() => {
    if (fromParam !== "reconcile" || !accountParam) return false;
    navigate({ to: "/cash-flow/reconcile/$accountId", params: { accountId: accountParam } });
    return true;
  }, [fromParam, accountParam, navigate]);

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
  // 名稱 autocomplete 的來源：純粹來自帳目歷史（沒有對應的 settings 陣列 —— 計畫 282 決定 A）。
  const namePool = useMemo(
    () => buildLedgerLabelStats(ledgerRows, "name").map((s) => s.value),
    [ledgerRows],
  );
  // Each merchant's most-used (category, subcategory) from expense history, so
  // picking a merchant can auto-fill its usual category.
  const merchantCategoryMap = useMemo(() => buildMerchantCategoryMap(ledgerRows), [ledgerRows]);
  const categoryForMerchant = (merchant: string) =>
    merchantCategoryMap.get(merchant.trim()) ?? null;

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
    (repository, input: LedgerDraft & { id: string }) =>
      repository.updateLedgerTransaction(input.id, input),
    ["ledger", "accounts"],
  );
  const applyRecurringEdit = useRepositoryMutation(
    (
      repository,
      input: {
        id: string;
        scope: import("../data/repositories").RecurringEditScope;
        draft: LedgerDraft;
      },
    ) => repository.applyRecurringScopeEdit(input.id, input.scope, input.draft),
    ["ledger", "accounts", "recurring"],
  );
  const deleteLedger = useRepositoryMutation(
    (repository, id: string) => repository.deleteLedgerTransaction(id),
    ["ledger", "accounts"],
  );
  const updateSettingsMutation = useRepositoryMutation(
    (repository, input: import("../domain/types").AppSettings) =>
      repository.updateAppSettings(input),
    ["settings"],
  );
  const createRecurring = useRepositoryMutation(
    (repository, input: import("../data/repositories").RecurringDraft) =>
      repository.createRecurringTransaction(input),
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
  const updateTransferMutation = useRepositoryMutation(
    (repository, input: { groupId: string; input: TransferDraft }) =>
      repository.updateTransfer(input.groupId, input.input),
    ["ledger", "accounts"],
  );
  const importLedger = useRepositoryMutation(
    (repository, input: LedgerDraft[]) => repository.importLedgerTransactions(input),
    ["ledger", "accounts"],
  );
  const createSplitMutation = useRepositoryMutation(
    (
      repository,
      input: { shared: SplitSharedFields; legs: SplitLegInput[]; shares: SplitShareInput[] },
    ) => repository.createSplit(input.shared, input.legs, input.shares),
    ["ledger", "accounts"],
  );
  const updateSplitMutation = useRepositoryMutation(
    (
      repository,
      input: {
        groupId: string;
        shared: SplitSharedFields;
        legs: SplitLegInput[];
        shares: SplitShareInput[];
      },
    ) => repository.updateSplit(input.groupId, input.shared, input.legs, input.shares),
    ["ledger", "accounts"],
  );
  const createInstallmentPlan = useRepositoryMutation(
    (repository, input: { draft: LedgerDraft; periods: number }) =>
      repository.createInstallmentPlan(input.draft, input.periods),
    ["ledger", "accounts"],
  );
  const deleteInstallmentPlan = useRepositoryMutation(
    (repository, input: { groupId: string; fromIndex?: number }) =>
      repository.deleteInstallmentPlan(
        input.groupId,
        input.fromIndex !== undefined ? { fromIndex: input.fromIndex } : undefined,
      ),
    ["ledger", "accounts"],
  );

  // 開發票 (plan 191 step 3): create the receivable ledger row FIRST, then the
  // invoice metadata pointing at it. `createLedgerTransaction` doesn't return
  // the new row's id, so the created row is found by diffing the ledger list
  // before/after (ids are always unique — no repository API change needed).
  // Orphan note: if `createInvoice` fails after the ledger row already landed,
  // that row is still a valid plain receivable (recoverable) — this throws a
  // distinguishable `InvoiceMetadataError` so the caller can tell the operator
  // and close the drawer instead of inviting a duplicate resubmit.
  const createInvoiceEntry = useRepositoryMutation(
    async (
      repository,
      input: { ledger: LedgerDraft; invoice: Omit<InvoiceDraft, "linkedLedgerTransactionId"> },
    ) => {
      const before = new Set((await repository.listLedgerTransactions()).map((row) => row.id));
      await repository.createLedgerTransaction(input.ledger);
      const after = await repository.listLedgerTransactions();
      const created = after.find((row) => !before.has(row.id));
      if (!created) {
        throw new Error("應收帳款已建立，但找不到新交易以建立發票，請至交易列表手動確認。");
      }
      try {
        await repository.createInvoice({ ...input.invoice, linkedLedgerTransactionId: created.id });
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new InvoiceMetadataError(
          `應收帳款已建立，但發票資料建立失敗（${reason}）。請至客戶管理重新確認後手動補登。`,
        );
      }
    },
    // "invoices" isn't a key `useRepositoryMutation` knows about (it's a local
    // useQuery here, not part of useFinanceData/hooks.ts) — invalidated
    // manually via `queryClient` right after this mutation settles.
    ["ledger", "accounts"],
  );
  const createClientMutation = useRepositoryMutation(
    (repository, input: ClientDraft) => repository.createClient(input),
    [],
  );
  const updateClientMutation = useRepositoryMutation(
    (repository, input: { id: string; draft: ClientDraft }) =>
      repository.updateClient(input.id, input.draft),
    [],
  );
  // 開發票 (plan 191 step 4): stamps/clears the linked invoice's settledAt —
  // a no-op when no invoice links to the ledger row (190's contract), so a
  // plain 應收/應付 settle calling this is harmless.
  const stampInvoiceSettledMutation = useRepositoryMutation(
    (repository, input: { linkedLedgerTransactionId: string; settledAt: string | null }) =>
      repository.stampInvoiceSettled(input.linkedLedgerTransactionId, input.settledAt),
    [],
  );

  const rememberMerchants = useRepositoryMutation(
    async (repository, input: string[]) => {
      const nextNames = uniqueClean(input);
      if (nextNames.length === 0) return;
      const current = await repository.getAppSettings();
      const existing = new Set(
        current.merchants.map((merchant) => merchant.trim()).filter(Boolean),
      );
      const additions = nextNames.filter((merchant) => !existing.has(merchant));
      if (additions.length === 0) return;
      await repository.updateAppSettings({
        ...current,
        merchants: [...current.merchants, ...additions],
      });
    },
    ["settings"],
  );

  const rememberCategories = useRepositoryMutation(
    async (repository, input: Array<{ category: string; subcategory: string }>) => {
      const nextItems = input
        .map((item) => ({ category: item.category.trim(), subcategory: item.subcategory.trim() }))
        .filter((item) => item.category);
      if (nextItems.length === 0) return;
      const current = await repository.getAppSettings();
      const nextCategories = current.categories.map((category) => ({
        ...category,
        children: [...category.children],
      }));
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
   * part of a 多類別拆分. Requires EVERY leg to carry `legKind: "category"` or
   * `"share"` (plan 222: 分帳 legs join the same group) — a fee-leg pair
   * (legKind null) also classifies as "split" (same account, shared groupId)
   * but must keep today's single-row edit behavior, never open the split
   * editor. Never widen this to legKind null: plan 226's fee-edit lookup
   * depends on fee legs staying excluded from the split editor.
   */
  function splitGroupRowsFor(row: LedgerTransaction): LedgerTransaction[] | null {
    if (!row.groupId) return null;
    const rows = ledgerRows.filter((r) => r.groupId === row.groupId && r.deletedAt === null);
    if (rows.length < 2) return null;
    if (classifyLedgerGroup(rows) !== "split") return null;
    if (!rows.every((r) => r.legKind === "category" || r.legKind === "share")) return null;
    return rows;
  }

  /**
   * The amount of `row`'s linked 手續費 leg (plan 226), or 0 when it has none.
   * Same lookup contract as the repo: same groupId + category === "手續費" +
   * legKind == null (system leg, not a user split/share leg) + active.
   */
  function linkedFeeAmountFor(row: LedgerTransaction): number {
    if (!row.groupId) return 0;
    const leg = ledgerRows.find(
      (r) =>
        r.groupId === row.groupId &&
        r.category === "手續費" &&
        r.legKind == null &&
        r.deletedAt === null,
    );
    return leg ? Math.abs(leg.amount) : 0;
  }

  function openCreate(type: CashType) {
    setDrawerType(type);
    setDrawerOpen(true);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setSplitLegs(null);
    setShareDrafts([]);
    setEditingSplitGroupId(null);
    setEditingTransferGroupId(null);
    // Always default a fresh entry to a one-off transaction. The control is
    // component-level state, so without this reset it would "stick" to whatever
    // recurrence the previous entry used.
    setDrawerRecurringFreq("none");
    setInstallmentPeriods(0);
    setMessage("");
    setCounterparty("");
    setDueDate("");
    setIsInvoiceEntry(false);
    setInvoiceNumber("");
    setInvoiceNumberPreset("TW_UNIFORM");
    setInvoiceClientId(null);
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

  /** 開發票 toolbar shortcut: opens straight into an ar entry with the invoice
   *  toggle already on (company-book gated by the caller). */
  function openInvoiceCreate() {
    openCreate("ar");
    setIsInvoiceEntry(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setSplitLegs(null);
    setShareDrafts([]);
    setEditingSplitGroupId(null);
    setEditingTransferGroupId(null);
    setInstallmentPeriods(0);
    setMessage("");
  }

  function changeType(next: CashType) {
    // Editing an existing 拆分 group must stay expense/income — switching to
    // transfer/ar/ap would drop the legs and then save a single row over one
    // leg of the group. Ignore those taps while a split edit is open.
    if (editingSplitGroupId && next !== "expense" && next !== "income") return;
    // 編輯轉帳 (plan 227): type is immutable while editing, in both directions.
    // Leaving "transfer" while editingTransferGroupId would save a single row
    // over one leg of the pair; entering "transfer" while editing a non-transfer
    // row would create a NEW transfer and strand the row being edited (the
    // reverse duplicate bug this plan fixes).
    if (editingTransferGroupId && next !== "transfer") return;
    if (editingId && !editingTransferGroupId && next === "transfer") return;
    setDrawerType(next);
    // 開發票 fields only make sense for ar; leaving it drops the invoice toggle.
    if (next !== "ar") {
      setIsInvoiceEntry(false);
      setInvoiceNumber("");
      setInvoiceClientId(null);
    }
    // Split mode only exists for expense/income; leaving them drops the legs.
    if (next !== "expense" && next !== "income") {
      setSplitLegs(null);
      setEditingSplitGroupId(null);
      setShareDrafts([]);
    }
    // 分帳 (plan 222/221) only supports expense — switching a split to 收入
    // must drop any shares so a save can never reach the builder's
    // 分帳僅支援支出 throw.
    if (next === "income" && shareDrafts.length > 0) {
      setShareDrafts([]);
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
        counterAccountId: toRp ? (current.counterAccountId ?? null) : null,
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
   * fields come from the first CATEGORY leg (a 分帳 group's share legs carry
   * the counterparty's name and an empty category in `name`/`category` — see
   * domain/splitLegs `buildSplitLegs` — so they're never representative of
   * the shared fields), one editable leg row per category leg, one editable
   * share row per share leg (plan 222). `duplicate` opens the same form in
   * create mode (a fresh group on save). Note: leg row ids change on every
   * updateSplit (tombstone + recreate), so nothing here caches leg ids — only
   * the stable groupId.
   */
  function startSplitEdit(groupRows: LedgerTransaction[], duplicate = false) {
    const categoryRows = groupRows.filter((r) => r.legKind === "category");
    const shareRows = groupRows.filter((r) => r.legKind === "share");
    const first = categoryRows[0] ?? groupRows[0];
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
    setSplitLegs(
      categoryRows.map((r) => ({
        amount: String(Math.abs(r.amount)),
        category: r.category,
        subcategory: r.subcategory,
      })),
    );
    setShareDrafts(
      shareRows.map((r) => ({
        amount: String(Math.abs(r.amount)),
        counterparty: r.name,
        counterAccountId: r.counterAccountId ?? "",
      })),
    );
    setDrawerRecurringFreq("none");
    setInstallmentPeriods(0);
    setMessage("");
    setDrawerOpen(true);
  }

  /**
   * 編輯轉帳 (plan 227): hydrates `transferForm` from the group's legs looked
   * up by `groupId` — NOT from `transferPair`, which the caller may not have
   * (the reconcile deep-link and settlements list set `detailRow` straight
   * from raw `ledgerRows`). Mirrors the `mergeTransferRows`/`startDuplicate`
   * leg-role contract: source = negative transfer leg, dest = the other
   * transfer leg, fee = category 手續費 on the same groupId.
   */
  function startTransferEdit(row: LedgerTransaction) {
    if (!row.groupId) {
      toast.error("此筆轉帳資料不完整，無法編輯");
      return;
    }
    const legs = ledgerRows.filter(
      (r) => r.groupId === row.groupId && r.entryType === "transfer" && r.deletedAt === null,
    );
    const source = legs.find((l) => l.amount < 0);
    const dest = legs.find((l) => l.id !== source?.id);
    if (!source || !dest) {
      toast.error("此筆轉帳資料不完整，無法編輯");
      return;
    }
    const feeLeg = ledgerRows.find(
      (r) => r.groupId === row.groupId && r.category === "手續費" && r.deletedAt === null,
    );
    setDrawerType("transfer");
    setSplitLegs(null);
    setShareDrafts([]);
    setEditingSplitGroupId(null);
    setEditingTransferGroupId(row.groupId);
    setEditingId(row.id);
    setCounterparty("");
    setDueDate("");
    setIsInvoiceEntry(false);
    setInvoiceNumber("");
    setInvoiceClientId(null);
    setTransferForm({
      date: source.date,
      sourceAccountId: source.accountId,
      destinationAccountId: dest.accountId,
      sourceCurrency: source.currency,
      destinationCurrency: dest.currency,
      sourceAmount: Math.abs(source.amount),
      destinationAmount: Math.abs(dest.amount),
      note: source.note,
      feeAmount: feeLeg ? Math.abs(feeLeg.amount) : 0,
    });
    setDrawerRecurringFreq("none");
    setInstallmentPeriods(0);
    setEditingRecurringRuleId(null);
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
    if (type === "transfer") {
      startTransferEdit(row);
      return;
    }
    setDrawerType(type);
    setSplitLegs(null);
    setShareDrafts([]);
    setEditingSplitGroupId(null);
    setEditingTransferGroupId(null);
    setEditingId(row.id);
    setCounterparty(row.settlementStatus === "settled" ? "" : row.merchant);
    setDueDate("");
    // Editing never re-opens the invoice fields (plan 191 scope: no editing an
    // existing invoice's number after creation) — the ar row itself is still
    // editable exactly as before; its linked invoice metadata, if any, is
    // untouched by this edit.
    setIsInvoiceEntry(false);
    setInvoiceNumber("");
    setInvoiceClientId(null);
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
      // 手續費 editable on edit (plan 226): hydrate from the linked fee leg so
      // 進階 shows the current fee (0 if none) instead of always starting blank.
      feeAmount: linkedFeeAmountFor(row),
      postDate: row.postDate ?? null,
      taxAmount: row.taxAmount ?? null,
    });
    setEntryDisplayCurrency(row.originalCurrency ?? row.currency);
    setAmountExpression(String(Math.abs(row.originalAmount ?? row.amount)));
    setDrawerRecurringFreq("none");
    setInstallmentPeriods(0);
    setEditingRecurringRuleId(row.recurringRuleId ?? null);
    setMessage("");
    setDrawerOpen(true);
  }

  function startDuplicate(
    row: LedgerTransaction,
    transferPair?: { source: LedgerTransaction; dest: LedgerTransaction },
  ) {
    const splitRows = splitGroupRowsFor(row);
    if (splitRows) {
      startSplitEdit(splitRows, true);
      return;
    }
    const type = cashTypeFromRow(row);
    setDrawerType(type);
    setSplitLegs(null);
    setShareDrafts([]);
    setEditingSplitGroupId(null);
    setEditingTransferGroupId(null);
    setEditingId(null);
    setEditingRecurringRuleId(null);
    setDrawerRecurringFreq("none");
    setCounterparty(row.settlementStatus === "settled" ? "" : row.merchant);
    setDueDate("");
    setIsInvoiceEntry(false);
    setInvoiceNumber("");
    setInvoiceClientId(null);
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
        // 複製新增開新表單：不沿用原稅額，使用者需重新確認/填寫。
        taxAmount: null,
      });
      setEntryDisplayCurrency(row.originalCurrency ?? row.currency);
      setAmountExpression(String(Math.abs(row.originalAmount ?? row.amount)));
    }
    setDrawerOpen(true);
  }

  /**
   * 分帳一鍵還款 (plan 235): a 分帳 share leg parks the friend's portion on an
   * 應收帳戶 (代墊, plan 221) — repayment is just a transfer 應收帳戶 →
   * 收款帳戶. Reuses `openCreate`'s reset (split state, editing ids, recurring
   * freq…) then overwrites the transfer form with the prefilled pair. No new
   * "repaid" flag: 代墊 tracking stays account-balance-based.
   */
  function startShareRepayment(leg: LedgerTransaction) {
    openCreate("transfer");
    const sourceAccount = accountRows.find((a) => a.id === leg.counterAccountId);
    const destAccount = accountRows.find((a) => a.id === leg.accountId);
    const amount = Math.abs(leg.amount);
    setTransferForm({
      ...emptyTransfer,
      date: nowAsDatetimeLocal(timezone),
      sourceAccountId: leg.counterAccountId ?? "",
      destinationAccountId: leg.accountId,
      sourceCurrency: sourceAccount?.currency ?? "TWD",
      destinationCurrency: destAccount?.currency ?? "TWD",
      sourceAmount: amount,
      destinationAmount: amount,
      note: `${leg.name} 分帳還款`,
    });
  }

  async function submitLedger() {
    setMessage("");
    try {
      // 多類別拆分: split mode saves through createSplit/updateSplit and never
      // touches the single-row path below (which stays byte-identical).
      if (splitLegs && (drawerType === "expense" || drawerType === "income")) {
        // Combined check (plan 222): splitLegsError alone can't see shares,
        // so it wrongly rejects a valid 1-leg + 1-share 分帳 — combinedSplitError
        // mirrors the builder's combined-≥2 rule (see splitEntryState.ts).
        const combinedError = combinedSplitError(splitLegs, shareDrafts);
        if (combinedError) throw new Error(combinedError);
        if (!ledgerForm.accountId) throw new Error("請選擇帳戶。");
        const splitEntryType = entryTypeFor(drawerType) as "expense" | "income";
        const isCreditSplit =
          splitEntryType === "expense" &&
          accountRows.find((a) => a.id === ledgerForm.accountId)?.type === "credit";
        const shared: SplitSharedFields = {
          accountId: ledgerForm.accountId,
          date: ledgerForm.date,
          name: ledgerForm.name.trim(),
          merchant: ledgerForm.merchant.trim(),
          currency: ledgerForm.currency,
          entryType: splitEntryType,
          settlementStatus: "settled",
          note: ledgerForm.note,
          postDate: isCreditSplit ? ledgerForm.postDate || null : null,
        };
        const legs = toSplitLegInputs(splitLegs);
        const shares = toShareInputs(shareDrafts);
        if (editingId && editingSplitGroupId) {
          await updateSplitMutation.mutateAsync({
            groupId: editingSplitGroupId,
            shared,
            legs,
            shares,
          });
          toast.success("已更新拆分交易");
        } else {
          await createSplitMutation.mutateAsync({ shared, legs, shares });
          toast.success(
            shares.length > 0
              ? `已新增拆分交易（${legs.length} 筆分類、${shares.length} 筆分帳）`
              : `已新增拆分交易（${legs.length} 筆分類）`,
          );
        }
        await rememberCategories.mutateAsync(
          legs.map((leg) => ({ category: leg.category, subcategory: leg.subcategory })),
        );
        rememberMerchantNames([shared.merchant]);
        closeDrawer();
        // 對帳 round-trip (plan 225): only an edit (never a fresh split) bounces
        // back — editingId is still the pre-close value here (closeDrawer's
        // setEditingId(null) hasn't flushed within this synchronous scope).
        if (editingId) returnIfFromReconcile();
        return;
      }
      // 開發票 (plan 191 step 3): create-only — editing an existing invoice's
      // number/split isn't supported (out of scope), so this branch only runs
      // for a fresh ar entry with the toggle on. Falls through to the plain ar
      // path below for every other case, which stays byte-identical.
      if (drawerType === "ar" && isInvoiceEntry && !editingId) {
        if (!isActiveCompanyBook) throw new Error("開發票僅限公司帳；請先切換至公司帳本。");
        if (!counterparty.trim()) throw new Error("請填寫客戶。");
        const invoiceTotal = Math.abs(evaluateAmountExpression(amountExpression));
        const { ledger: invoiceLedgerDraft, invoice: invoiceMetaDraft } = buildInvoiceDrafts({
          bookId: activeBookId,
          clientId: invoiceClientId,
          clientName: counterparty,
          invoiceNumber,
          invoiceNumberPreset,
          issueDate: ledgerForm.date,
          dueDate: dueDate || null,
          taxInclusiveTotal: invoiceTotal,
          currency: ledgerForm.currency,
          category: ledgerForm.category.trim(),
          subcategory: ledgerForm.subcategory.trim(),
          note: ledgerForm.note,
          counterAccountId: ledgerForm.counterAccountId ?? null,
        });
        try {
          await createInvoiceEntry.mutateAsync({
            ledger: invoiceLedgerDraft,
            invoice: invoiceMetaDraft,
          });
          await queryClient.invalidateQueries({ queryKey: ["invoices"] });
        } catch (mutationError) {
          // The ledger row (if it landed) is already invalidated via
          // createInvoiceEntry's own ["ledger","accounts"] list — but an
          // InvoiceMetadataError means the invoice row itself may or may not
          // exist, so refresh the local invoices query either way.
          await queryClient.invalidateQueries({ queryKey: ["invoices"] });
          if (mutationError instanceof InvoiceMetadataError) {
            // The receivable already landed — closing avoids a duplicate
            // resubmit; the toast tells the operator what still needs fixing.
            toast.error(mutationError.message);
            closeDrawer();
            return;
          }
          throw mutationError;
        }
        toast.success(`已建立發票並記錄應收帳款（${invoiceMetaDraft.invoiceNumber}）`);
        await rememberCategories.mutateAsync([
          { category: invoiceLedgerDraft.category, subcategory: invoiceLedgerDraft.subcategory },
        ]);
        rememberMerchantNames([invoiceLedgerDraft.merchant]);
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
        const converted = convertCurrency(
          rawAmount,
          entryDisplayCurrency,
          ledgerForm.currency,
          appSettings,
        );
        if (converted === null)
          throw new Error(
            `找不到 ${entryDisplayCurrency} → ${ledgerForm.currency} 的匯率，請先在「設定 → 匯率」中新增。`,
          );
        signedAmount = entryType === "expense" ? -converted : converted;
        originalAmount = entryType === "expense" ? -rawAmount : rawAmount;
        originalCurrency = entryDisplayCurrency;
      } else {
        signedAmount = entryType === "expense" ? -rawAmount : rawAmount;
      }

      const isReceivablePayable = drawerType === "ar" || drawerType === "ap";
      const note = dueDate
        ? `${ledgerForm.note ? `${ledgerForm.note} · ` : ""}到期 ${dueDate}`.trim()
        : ledgerForm.note;
      // 延後入帳 only applies to a credit-card expense; clear it otherwise so a
      // posting date never lingers on income/transfer or non-credit accounts.
      const isCreditExpense =
        entryType === "expense" &&
        accountRows.find((a) => a.id === ledgerForm.accountId)?.type === "credit";
      const postDate = isCreditExpense ? ledgerForm.postDate || null : null;
      const payload: LedgerDraft = {
        ...ledgerForm,
        entryType,
        settlementStatus: settlementFor(drawerType),
        postDate,
        // 代墊 counter account only applies to 應收/應付.
        counterAccountId: isReceivablePayable ? ledgerForm.counterAccountId || null : null,
        amount: signedAmount,
        originalAmount,
        originalCurrency,
        name: ledgerForm.name.trim() || (isReceivablePayable ? counterparty.trim() : ""),
        category: ledgerForm.category.trim(),
        subcategory: ledgerForm.subcategory.trim(),
        merchant: (isReceivablePayable ? counterparty : ledgerForm.merchant).trim(),
        note,
        // Fees attach to income/expense rows only — the repo emits/reconciles
        // a linked 手續費 expense leg on both create AND edit (plan 226).
        // Transfers keep their separate transferForm.feeAmount path.
        feeAmount:
          entryType === "expense" || entryType === "income" ? ledgerForm.feeAmount || 0 : 0,
        // 營業稅額 (plan 286): ALWAYS carried through, never gated on
        // isActiveCompanyBook — the field is hidden when the active book/view
        // doesn't show it (e.g. editing a 公司帳 row from 總帳), but the form
        // state still holds a previously-filled value, and dropping it here
        // would silently wipe an existing tax amount on save (D3).
        taxAmount:
          entryType === "expense" || entryType === "income" ? (ledgerForm.taxAmount ?? null) : null,
      };
      // Expense/income/transfer need an account up front; receivable/payable
      // defer the settle account to 結清 time (only the optional 代墊 account
      // may be set now).
      if (!isReceivablePayable && !payload.accountId) throw new Error("請選擇帳戶。");
      if (isReceivablePayable && !payload.merchant) throw new Error("請填寫對象。");
      if (payload.taxAmount != null && payload.taxAmount > Math.abs(signedAmount))
        throw new Error("稅額不可大於總額。");
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
      await rememberCategories.mutateAsync([
        { category: payload.category, subcategory: payload.subcategory },
      ]);
      rememberMerchantNames([payload.merchant]);
      closeDrawer();
      // 對帳 round-trip (plan 225): editingId gates out plain creates/installment
      // plans — only a genuine edit bounces back.
      if (editingId) returnIfFromReconcile();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "收支儲存失敗。");
    }
  }

  async function applyRecurringScope(scope: import("../data/repositories").RecurringEditScope) {
    if (!recurringEditPrompt) return;
    const { id, ...draft } = recurringEditPrompt;
    try {
      await applyRecurringEdit.mutateAsync({ id, scope, draft });
      toast.success(
        scope === "this" ? "已更新此筆" : scope === "future" ? "已更新此筆與未來" : "已更新全部",
      );
      await rememberCategories.mutateAsync([
        { category: draft.category, subcategory: draft.subcategory },
      ]);
      rememberMerchantNames([draft.merchant]);
      setRecurringEditPrompt(null);
      closeDrawer();
      // 對帳 round-trip (plan 225): the this/future/all scope prompt is itself
      // the tail of an edit that started from the panel — the return waits for
      // this resolution instead of firing when submitLedger opened the prompt.
      returnIfFromReconcile();
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
      if (editingTransferGroupId) {
        // 編輯轉帳 (plan 227): in-place leg update — NOT create, which would
        // mint a duplicate pair while the original stays (the bug this fixes).
        await updateTransferMutation.mutateAsync({
          groupId: editingTransferGroupId,
          input: transferForm,
        });
        toast.success("已更新轉帳");
      } else {
        await createTransfer.mutateAsync(transferForm);
        toast.success("已建立轉帳");
      }
      closeDrawer();
      // 對帳 round-trip (plan 225): editingId gates out plain creates.
      if (editingId) returnIfFromReconcile();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轉帳儲存失敗。");
    }
  }

  async function handleDelete(id: string, successMessage = "已刪除交易") {
    try {
      await deleteLedger.mutateAsync(id);
      toast.success(successMessage);
      // 對帳 round-trip (plan 225): deleting also returns to reconcile — it's
      // where the operator was working.
      returnIfFromReconcile();
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
        await deleteInstallmentPlan.mutateAsync({
          groupId: row.installmentGroupId!,
          fromIndex: row.installmentIndex ?? undefined,
        });
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
      // 開發票 (plan 191 step 4): stamp the linked invoice's settledAt, if any.
      // Runs after the settle itself succeeds and never blocks the settle's
      // own success toast on a stamping failure — the ledger row is already
      // settled either way.
      try {
        await stampInvoiceSettledMutation.mutateAsync({
          linkedLedgerTransactionId: row.id,
          settledAt: new Date().toISOString(),
        });
        await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      } catch (stampError) {
        console.error("Failed to stamp invoice settledAt", stampError);
      }
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

  const scopedRows = useMemo(
    () =>
      bookLedgerRows.filter((row) => {
        if (!isWithinDateScope(row.date, dateRange)) return false;
        if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
        if (selectedCategory !== "all" && row.category !== selectedCategory) return false;
        return true;
      }),
    [bookLedgerRows, dateRange, selectedAccount, selectedCategory],
  );
  const activityRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return scopedRows;
    return scopedRows.filter((row) =>
      [
        row.name,
        row.merchant,
        row.category,
        row.subcategory,
        row.note,
        accountName(row.accountId),
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [scopedRows, searchQuery, accountRows]);
  // Period aggregates: a full filter+reduce pass over `scopedRows` each. Keyed
  // on the scoped rows and converter only — NOT `searchQuery` — so typing in
  // the search box (which only affects `activityRows`) doesn't re-run them.
  const { periodIncome, periodExpense, periodNet, periodTransferCount, missingFx } = useMemo(() => {
    const income = scopedRows
      .filter(
        (row) =>
          row.entryType === "income" &&
          row.settlementStatus === "settled" &&
          !isNeutralLedgerRow(row),
      )
      .reduce((sum, row) => sum + Math.max(0, toPrimary(row) ?? 0), 0);
    const expense = scopedRows
      .filter(
        (row) =>
          row.entryType === "expense" &&
          row.settlementStatus === "settled" &&
          !isNeutralLedgerRow(row),
      )
      // Signed: expense amounts are negative, so −amount is positive spend; a
      // refund (positive-amount expense) nets back out instead of adding.
      .reduce((sum, row) => sum - (toPrimary(row) ?? 0), 0);
    const transferCount = new Set(
      scopedRows.filter((row) => row.entryType === "transfer").map((row) => row.groupId ?? row.id),
    ).size;
    const missing = [
      ...new Set(
        scopedRows
          .filter(
            (row) =>
              !isNeutralLedgerRow(row) &&
              row.settlementStatus === "settled" &&
              toPrimary(row) === null,
          )
          .map((row) => `${row.currency} → ${primaryCurrency}`),
      ),
    ];
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
      if (
        row.entryType !== "expense" ||
        row.settlementStatus !== "settled" ||
        isNeutralLedgerRow(row)
      )
        continue;
      const key = row.category || "未分類";
      // Signed (−amount): refunds net against the category they refund.
      map.set(key, (map.get(key) ?? 0) - (toPrimary(row) ?? 0));
    }
    const defaultColors = [
      "var(--ns-chart-1)",
      "var(--ns-chart-2)",
      "var(--ns-chart-3)",
      "var(--ns-chart-4)",
      "var(--ns-chart-5)",
      "var(--ns-chart-6)",
      "var(--ns-chart-7)",
      "#a78bfa",
      "#f472b6",
      "#facc15",
    ];
    return (
      [...map.entries()]
        // A category can net negative if refunds exceed spend in the period;
        // hide it from the spend donut rather than drawing a negative slice.
        .filter(([, amount]) => amount > 0)
        .map(([name, amount], idx) => {
          const catSetting = appSettings?.categories.find((c) => c.name === name);
          return {
            name,
            amount,
            color: catSetting?.color || defaultColors[idx % defaultColors.length],
            icon: catSetting?.iconName || "Tag",
          };
        })
        .sort((a, b) => b.amount - a.amount)
    );
  }, [bookLedgerRows, dateRange, selectedAccount, appSettings, toPrimary]);

  const totalCategorySpend = allCategorySpend.reduce((s, c) => s + c.amount, 0);

  const topCategorySpend = useMemo(() => allCategorySpend.slice(0, 5), [allCategorySpend]);

  // Cap the 分類支出 bar list to the top N, folding the rest behind an expandable toggle (plan 018).
  const CATEGORY_BAR_LIMIT = 8;

  const topMerchantSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of scopedRows) {
      if (
        row.entryType !== "expense" ||
        row.settlementStatus !== "settled" ||
        !row.merchant ||
        isNeutralLedgerRow(row)
      )
        continue;
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
      ...b,
      income: 0,
      expense: 0,
      net: 0,
      cumulativeNet: 0,
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

  const displayRows = useMemo(
    () => mergeTransferRows(activityRows, ledgerRows),
    [activityRows, ledgerRows],
  );

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

  const visibleRows = useMemo(
    () => displayRows.slice(0, visibleCount),
    [displayRows, visibleCount],
  );
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

  const {
    sentinelRef: chromeSentinelRef,
    chromeRef,
    stuck: chromeStuck,
    height: chromeHeight,
  } = useStickyChrome();

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
    (amount: number, currency: string) =>
      convertCurrency(amount, currency, primaryCurrency, appSettings, {
        dailyRateIndex: fxIndex,
      }) ?? amount,
    [appSettings, fxIndex, primaryCurrency],
  );
  const settlements = useMemo(
    () =>
      buildOutstandingSettlements(
        selectedAccount === "all"
          ? bookLedgerRows
          : bookLedgerRows.filter((r) => r.accountId === selectedAccount),
        settlementConvert,
      ),
    [bookLedgerRows, selectedAccount, settlementConvert],
  );

  // 帳齡/DSO + 本期應繳營業稅 + 401 雙月彙總 (plan 193) — company-book-only invoice
  // reporting, all derived from the already-fetched `bookInvoices`. Kept as
  // plain memos (not a shared hook) mirroring the invoicesQuery/clientsQuery
  // pattern above: local to this route, not in scope for this plan.
  const todayIso = useMemo(() => todayInTimezone(timezone), [timezone]);
  const invoiceAging = useMemo(
    () => agingBuckets(bookInvoices, todayIso),
    [bookInvoices, todayIso],
  );
  const invoiceDso = useMemo(
    () => daysSalesOutstanding(bookInvoices, { todayIso }),
    [bookInvoices, todayIso],
  );
  const currentFilingYear = useMemo(() => Number(todayIso.slice(0, 4)), [todayIso]);
  // 進項稅額 aware 401 彙總 + 本期應納(退)稅額 (plan 286) — supersede the
  // invoices-only outstandingSalesTax/bimonthly401Summary now that ledger
  // rows can also carry a taxAmount (支出 = 進項, 未連結發票的收入 = 銷項).
  const vatSummary = useMemo(
    () => bimonthlyVatSummary(bookInvoices, bookLedgerRows, currentFilingYear),
    [bookInvoices, bookLedgerRows, currentFilingYear],
  );
  const periodVat = useMemo(
    () => currentPeriodVat(bookInvoices, bookLedgerRows, todayIso),
    [bookInvoices, bookLedgerRows, todayIso],
  );
  const bookHasVat = useMemo(
    () =>
      bookLedgerRows.some((r) => r.taxAmount != null && r.taxAmount > 0 && r.deletedAt === null),
    [bookLedgerRows],
  );

  // Render one day-group (header + its rows) — shared by the flat short-range
  // list and by each expanded month in the long-range (variant D) view.
  const renderDayGroup = (
    g: { date: string; rows: DisplayRow[]; net: number },
    indented = false,
  ) => (
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
          Net{" "}
          <span className={g.net >= 0 ? "pos" : "neg"}>
            {g.net >= 0 ? "+" : "−"}
            {primaryCurrency} {formatNumber(Math.abs(g.net))}
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
            onToggleSplit={() => {
              if (r.groupId) toggleSplit(r.groupId);
            }}
            accountName={accountName}
            categoryIcon={catGroup?.iconName || undefined}
            onEdit={() => setDetailRow(r)}
            onOpenEdit={() => startEdit(r)}
            onDuplicate={() => startDuplicate(r, r.transferPair)}
            onDelete={() => requestDelete(r)}
            onSettle={() => markSettled(r)}
            onShareRepay={startShareRepayment}
          />
        );
      })}
    </div>
  );

  if (isInitialLoading) {
    return (
      <div className="ns-page grid gap-5 py-1">
        <Skeleton className="h-[200px]" />
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
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
          <h3
            className="text-[17px] font-semibold"
            style={{ fontFamily: "var(--ns-font-display)" }}
          >
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">
            {error instanceof Error ? error.message : "請稍後再試。"}
          </p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ns-page pt-6 pb-28 sm:pb-[120px]"
      style={{ ["--ns-page-chrome-h" as string]: `${chromeHeight}px` }}
    >
      {/* Static header — scrolls away. While the toolbar below is pinned,
          page identity comes from the sidebar / mobile dock's active state. */}
      <div className="mb-[22px]">
        <div className="text-xs ns-field-label">{periodLabel}</div>
        <h1
          className="text-[28px] m-0 font-semibold"
          style={{ fontFamily: "var(--ns-font-display)", letterSpacing: -0.02 }}
        >
          記帳
        </h1>
      </div>
      <div ref={chromeSentinelRef} aria-hidden="true" className="ns-page-chrome-sentinel" />
      {/* Pinned toolbar — the same single row (tabs left, actions right) at
          rest and while stuck; nothing morphs on scroll. */}
      <div ref={chromeRef} className="ns-page-chrome ns-scroll-edge mb-6" data-stuck={chromeStuck}>
        <div className="ns-page-toolbar">
          <div className="ns-page-toolbar-tabs ns-page-tabs flex">
            {[
              { id: "overview", label: "交易" },
              { id: "categories", label: "分類" },
              { id: "merchants", label: "商家" },
              { id: "recurring", label: "週期規則" },
            ].map((t) => (
              <button
                key={t.id}
                className="text-sm whitespace-nowrap cursor-pointer"
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  padding: "10px 20px",
                  background: "none",
                  border: "none",
                  fontFamily: "inherit",
                  fontWeight: activeTab === t.id ? 600 : 400,
                  color: activeTab === t.id ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                  borderBottom:
                    activeTab === t.id ? "2px solid var(--ns-accent)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "color 0.12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ns-page-toolbar-actions">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsv}
            />
            <LedgerDateControl value={dateScope} onChange={setDateScope} />

            <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="lg" className="whitespace-nowrap">
                    <Funnel size={14} />
                    篩選
                    {activeFilterCount > 0 ? (
                      <span
                        className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-semibold leading-none"
                        style={{
                          background: "var(--ns-accent)",
                          minWidth: 16,
                          height: 16,
                          padding: "0 4px",
                        }}
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
                    <AccountFilter
                      accounts={bookAccounts}
                      value={selectedAccount}
                      onChange={setSelectedAccount}
                      className="text-body"
                      style={{ minWidth: "100%", maxWidth: "none" }}
                    />
                  </div>
                  <div>
                    <div className="text-xs ns-field-label mb-1.5">分類</div>
                    <CategoryFilter
                      categories={allCategories}
                      value={selectedCategory}
                      onChange={setSelectedCategory}
                      style={{ minWidth: "100%", maxWidth: "none" }}
                    />
                  </div>
                  <div
                    className="flex items-center justify-between pt-2"
                    style={{ borderTop: "1px solid var(--ns-border)" }}
                  >
                    <button
                      type="button"
                      className="text-xs muted cursor-pointer"
                      onClick={clearAllFilters}
                      disabled={activeFilterCount === 0}
                    >
                      清除全部
                    </button>
                    <Button size="sm" onClick={() => setFilterPopoverOpen(false)}>
                      完成
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* 開發票 / 客戶管理 (plan 191): only surfaced while viewing a 公司帳
              (docs/ledger-books-plan.md §3) — hidden in 總帳 and personal books. */}
            {isActiveCompanyBook && (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="whitespace-nowrap"
                  onClick={() => setClientManagerOpen(true)}
                >
                  <Users size={14} weight="bold" />
                  客戶
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="whitespace-nowrap"
                  onClick={openInvoiceCreate}
                >
                  <Receipt size={14} weight="bold" />
                  開發票
                </Button>
              </>
            )}

            <Button size="lg" className="whitespace-nowrap" onClick={() => openCreate("expense")}>
              <Plus size={14} weight="bold" />
              記一筆
            </Button>
          </div>
        </div>
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {filterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1"
              style={{
                background: "var(--ns-surface-strong)",
                border: "1px solid var(--ns-border)",
                color: "var(--ns-fg)",
              }}
            >
              {chip.label}
              <button
                type="button"
                aria-label={`移除${chip.label}篩選`}
                onClick={() => clearFilterChip(chip.key)}
                className="inline-flex items-center justify-center cursor-pointer"
                style={{ color: "var(--ns-fg-muted)" }}
              >
                <X size={14} weight="bold" />
              </button>
            </span>
          ))}
          <button type="button" className="text-xs cursor-pointer muted" onClick={clearAllFilters}>
            清除全部
          </button>
          <div className="ml-auto text-xs muted whitespace-nowrap">
            符合 {displayRows.length} 筆
          </div>
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
          <BulkCategorizeCard
            ledgerRows={ledgerRows}
            accounts={accountRows}
            settings={appSettings}
          />
          {/* 未結清 (應收/應付) moved into the right column — see NSLgBottomA. */}
          <div className="mb-5">
            {/* Cashflow Chart */}
            <Card id="cashflow-chart" className="p-6">
              <div className="flex items-end gap-4 mb-3.5 flex-wrap">
                <div>
                  <div className="text-xs ns-field-label">現金流 · Net</div>
                  <div className={"ns-num-lg " + (periodNet >= 0 ? "pos" : "neg")}>
                    {periodNet >= 0 ? "+" : "−"}
                    {primaryCurrency} {formatNumber(Math.abs(periodNet))}
                  </div>
                </div>
                <div className="flex-1" />
                {/* Income / Spending / Savings — 儲蓄率 hero + secondary 收入/支出 pair */}
                <div className="flex gap-2 items-stretch">
                  {/* Hero: 儲蓄率 */}
                  <div
                    className="ns-surface flex flex-col justify-center min-w-[104px]"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--ns-r-sm)",
                      background: "var(--ns-accent-soft)",
                    }}
                  >
                    <div
                      className="text-xs muted font-medium"
                      style={{ fontSize: 10, marginBottom: 2 }}
                    >
                      儲蓄率
                    </div>
                    <div
                      className={"num " + (periodIncome > 0 && periodNet >= 0 ? "pos" : "muted")}
                      style={{
                        fontSize: 22,
                        fontWeight: 600,
                        fontFamily: "var(--ns-font-num)",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        lineHeight: 1.1,
                      }}
                    >
                      {periodIncome > 0 ? `${((periodNet / periodIncome) * 100).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                  {/* Secondary: 收入 / 支出 stacked compact */}
                  <div className="flex flex-col gap-1.5 justify-center">
                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="muted text-caption min-w-[28px]">收入</span>
                      <span className="num pos text-caption font-medium">
                        {primaryCurrency} {formatNumber(periodIncome)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="muted text-caption min-w-[28px]">支出</span>
                      <span className="num neg text-caption font-medium">
                        {primaryCurrency} {formatNumber(periodExpense)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Legend + 日/週/月/年 granularity selector */}
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-3.5">
                  {[
                    { label: "收入", color: "var(--ns-pos)" },
                    { label: "支出", color: "var(--ns-neg)" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: l.color,
                          flexShrink: 0,
                        }}
                      />
                      <span className="muted text-caption">{l.label}</span>
                    </div>
                  ))}
                  {/* Cumulative-net line legend uses a horizontal stroke */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-0.5 shrink-0 rounded-[1px]"
                      style={{ background: "var(--ns-accent)" }}
                    />
                    <span className="muted text-caption">累積淨額</span>
                  </div>
                </div>
                <SegmentedControl
                  value={chartGranularity}
                  options={CHART_GRANULARITY_OPTIONS}
                  onChange={setChartGranularity}
                />
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Grouped income/expense bars (left axis) + a cumulative-net line
                  on a secondary right axis so the running total doesn't get
                  squashed by the per-bucket bar scale. */}
                  <ComposedChart
                    data={cashflowBars}
                    margin={{ top: 6, right: 6, bottom: 0, left: 4 }}
                    barCategoryGap={chartGranularity === "day" ? "12%" : "24%"}
                    barGap={2}
                  >
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
                    <ReferenceLine
                      yAxisId="cum"
                      y={0}
                      stroke={resolveColor("var(--ns-border-strong)")}
                    />
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
                      contentStyle={{
                        background: "var(--ns-surface)",
                        border: "1px solid var(--ns-border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v: any, name: any) => {
                        const labelMap: Record<string, string> = {
                          income: "收入",
                          expense: "支出",
                          cumulativeNet: "累積淨額",
                        };
                        const val = v as number;
                        // Cumulative net shows explicit sign; bars show their magnitude.
                        const display =
                          name === "cumulativeNet"
                            ? `${val >= 0 ? "+" : "−"}${primaryCurrency} ${formatNumber(Math.abs(val))}`
                            : `${primaryCurrency} ${formatNumber(Math.abs(val))}`;
                        return [display, labelMap[name] ?? name];
                      }}
                      labelFormatter={(v) => String(v)}
                    />
                    {/* Side-by-side bars (no stackId → grouped), both grow upward */}
                    <Bar
                      yAxisId="bars"
                      dataKey="income"
                      fill="var(--ns-pos)"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={18}
                    />
                    <Bar
                      yAxisId="bars"
                      dataKey="expense"
                      fill="var(--ns-neg)"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={18}
                    />
                    {/* Cumulative net trajectory across the period */}
                    <Line
                      yAxisId="cum"
                      dataKey="cumulativeNet"
                      stroke="var(--ns-accent)"
                      strokeWidth={1.75}
                      dot={false}
                      type="monotone"
                    />
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
                    <X weight="bold" />
                    清除篩選
                  </Button>
                )}
              </div>

              {/* Category Bar List */}
              {allCategorySpend.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {(showAllCategories
                    ? allCategorySpend
                    : allCategorySpend.slice(0, CATEGORY_BAR_LIMIT)
                  ).map((r) => {
                    const pct = totalCategorySpend > 0 ? (r.amount / totalCategorySpend) * 100 : 0;
                    const isActive = selectedCategory === "all" || selectedCategory === r.name;
                    const displayPct = pct < 1 ? "<1" : pct.toFixed(1);
                    return (
                      <div
                        key={r.name}
                        onClick={() =>
                          setSelectedCategory((prev) => (prev === r.name ? "all" : r.name))
                        }
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
                        <div
                          style={{
                            height: 6,
                            borderRadius: 99,
                            background: "var(--ns-bg-hover)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(2, pct)}%`,
                              height: "100%",
                              background: r.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {allCategorySpend.length > CATEGORY_BAR_LIMIT && (
                    <button
                      type="button"
                      onClick={() => setShowAllCategories((v) => !v)}
                      className="muted text-xs text-left cursor-pointer py-0.5"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ns-accent)",
                        fontFamily: "var(--ns-font-mono)",
                      }}
                    >
                      {showAllCategories
                        ? "▲ 收合"
                        : `▼ 顯示其餘 ${allCategorySpend.length - CATEGORY_BAR_LIMIT} 類`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="muted text-body text-center py-[30px]">本月尚無支出</div>
              )}
            </Card>
            <RankingCard
              title="商家花費排行"
              rows={topMerchantSpend}
              emptyText="此期間尚無商家資料"
              currency={primaryCurrency}
            />
          </div>

          {preview ? (
            <Card className="mb-4" style={{ padding: "var(--ns-pad-card)" }}>
              <div className="font-semibold mb-1.5">
                匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
              </div>
              {preview.invalid.map((item) => (
                <div key={item.row} className="text-body" style={{ color: "var(--ns-neg)" }}>
                  Row {item.row}: {item.reason}
                </div>
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
                <Button variant="outline" onClick={() => setPreview(null)}>
                  取消
                </Button>
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
                  <MagnifyingGlass
                    size={14}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--ns-muted)",
                    }}
                  />
                  <input
                    className="ns-input text-xs w-full h-[34px]"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜尋商家、分類或備註"
                    style={{ padding: "0 12px 0 30px" }}
                  />
                </label>
              </div>

              {displayRows.length === 0 ? (
                <div className="text-center" style={{ padding: "56px 20px" }}>
                  <div
                    className="w-[52px] h-[52px] inline-flex items-center justify-center mb-3.5"
                    style={{
                      borderRadius: "var(--ns-r-md)",
                      background: "var(--ns-accent-soft)",
                      color: "var(--ns-accent)",
                    }}
                  >
                    <Receipt size={24} weight="duotone" />
                  </div>
                  <div className="font-semibold mb-1.5">還沒有記帳資料</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => openCreate("expense")}>
                      <Plus size={14} weight="bold" />
                      新增交易
                    </Button>
                    <Button variant="outline" onClick={() => csvInputRef.current?.click()}>
                      <UploadSimple size={14} />
                      匯入 CSV
                    </Button>
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
                            {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                            <span className="text-sm font-medium whitespace-nowrap">
                              {formatMonthLabel(m.month)}
                            </span>
                            <span className="muted text-xs whitespace-nowrap">{m.count} 筆</span>
                          </span>
                          <span className="ns-cf-month-amounts flex items-center gap-3 text-caption mono">
                            <span className="whitespace-nowrap" style={{ color: "var(--ns-pos)" }}>
                              收入 +{primaryCurrency} {formatNumber(m.income)}
                            </span>
                            <span className="whitespace-nowrap" style={{ color: "var(--ns-neg)" }}>
                              支出 −{primaryCurrency} {formatNumber(m.expense)}
                            </span>
                            <span className={"whitespace-nowrap " + (m.net >= 0 ? "pos" : "neg")}>
                              淨 {m.net >= 0 ? "+" : "−"}
                              {primaryCurrency} {formatNumber(Math.abs(m.net))}
                            </span>
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
                      <Button variant="outline" onClick={() => setVisibleCount((c) => c + 30)}>
                        顯示更早的交易
                      </Button>
                      <div className="muted text-caption mt-1.5">每次多載 30 筆</div>
                    </div>
                  ) : null}
                </>
              )}
            </Card>

            {/* Right column: 固定收支 (30 天) + 未結清 — sticky on desktop. */}
            <div
              className="flex flex-col gap-5 lg:sticky self-start"
              style={{
                top: `calc(var(--ns-sticky-top) + var(--ns-demo-banner-h) + ${chromeHeight}px + 20px)`,
              }}
            >
              <UpcomingPayments
                recurringRows={recurringRows}
                accountName={accountName}
                timezone={timezone}
                onPost={async (id) => {
                  try {
                    await postRecurring.mutateAsync(id);
                    toast.success("已記入交易");
                  } catch {
                    toast.error("記入失敗");
                  }
                }}
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
                        <Badge
                          variant="outline"
                          className="rounded-full"
                          style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}
                        >
                          應收 {settlements.receivableCount}
                        </Badge>
                        <span className="num text-[15px]" style={{ color: "var(--ns-pos)" }}>
                          +{primaryCurrency} {formatNumber(settlements.receivableTotal)}
                        </span>
                      </div>
                    ) : null}
                    {settlements.payableTotal > 0 ? (
                      <div className="flex items-baseline gap-1.5">
                        <Badge
                          variant="outline"
                          className="rounded-full"
                          style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}
                        >
                          應付 {settlements.payableCount}
                        </Badge>
                        <span className="num text-[15px]" style={{ color: "var(--ns-neg)" }}>
                          −{primaryCurrency} {formatNumber(settlements.payableTotal)}
                        </span>
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
                        <span
                          className="num whitespace-nowrap"
                          style={{
                            color: item.kind === "receivable" ? "var(--ns-pos)" : "var(--ns-neg)",
                          }}
                        >
                          {item.kind === "receivable" ? "+" : "−"}
                          {item.currency} {formatNumber(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              {/* 發票報表 (plan 193/286): 帳齡/DSO、本期應納(退)稅額、401 雙月彙總 —
              company book only (docs/ledger-books-plan.md §3), shown once there's
              at least one invoice OR a ledger row with a filled tax amount to
              report on (a 公司帳 that only tracks 進項稅額 on expenses, with no
              invoices yet, should still see its 401 numbers). */}
              {isActiveCompanyBook && (bookInvoices.length > 0 || bookHasVat) && (
                <Card style={{ padding: "var(--ns-pad-card)" }}>
                  <div className="text-sm font-semibold mb-2.5">本期應繳營業稅</div>
                  <div
                    className="num text-lg"
                    style={{ color: periodVat.netTax < 0 ? "var(--ns-pos)" : "var(--ns-neg)" }}
                  >
                    {primaryCurrency} {formatNumber(periodVat.netTax)}
                  </div>
                  <div className="muted text-caption num mt-1.5">
                    銷項稅額 {formatNumber(periodVat.outputTax)} · 進項稅額{" "}
                    {formatNumber(periodVat.inputTax)}
                  </div>
                  <div className="muted text-caption mt-1">
                    依開立日/交易日計算，含尚未收款的發票 — 應納(退)稅額 = 銷項 −
                    進項稅額，負值為留抵。
                  </div>
                </Card>
              )}

              {isActiveCompanyBook && bookInvoices.length > 0 && (
                <Card style={{ padding: "var(--ns-pad-card)" }}>
                  <div className="text-sm font-semibold mb-2.5">帳齡 · 收款週期</div>
                  <div className="flex flex-col gap-1.5 mb-2.5">
                    {invoiceAging.map((b) => (
                      <div
                        key={b.bucket}
                        className="text-body flex items-center justify-between gap-2"
                      >
                        <span className="muted">{AGING_BUCKET_LABELS[b.bucket]}</span>
                        <span className="num whitespace-nowrap">
                          {b.count} 筆 · {primaryCurrency} {formatNumber(b.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="muted text-caption">
                    平均收款週期 (DSO)：{invoiceDso === null ? "—" : `${invoiceDso.toFixed(1)} 天`}
                  </div>
                </Card>
              )}

              {isActiveCompanyBook && (bookInvoices.length > 0 || bookHasVat) && (
                <Card style={{ padding: "var(--ns-pad-card)" }}>
                  <div className="text-sm font-semibold mb-2.5">
                    {currentFilingYear} 年度 401 雙月彙總
                  </div>
                  <div className="ns-detail-table-wrap">
                    <table className="ns-detail-table">
                      <thead>
                        <tr>
                          <th>期間</th>
                          <th className="text-right">未稅銷售額</th>
                          <th className="text-right">銷項稅額</th>
                          <th className="text-right">進項稅額</th>
                          <th className="text-right">應納(退)稅額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vatSummary.map((row) => (
                          <tr key={row.period}>
                            <td>{row.period}</td>
                            <td className="num text-right">{formatNumber(row.taxableSales)}</td>
                            <td className="num text-right">{formatNumber(row.outputTax)}</td>
                            <td className="num text-right">{formatNumber(row.inputTax)}</td>
                            <td className="num text-right">{formatNumber(row.netTax)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>合計</td>
                          <td className="num text-right">
                            {formatNumber(vatSummary.reduce((sum, r) => sum + r.taxableSales, 0))}
                          </td>
                          <td className="num text-right">
                            {formatNumber(vatSummary.reduce((sum, r) => sum + r.outputTax, 0))}
                          </td>
                          <td className="num text-right">
                            {formatNumber(vatSummary.reduce((sum, r) => sum + r.inputTax, 0))}
                          </td>
                          <td className="num text-right">
                            {formatNumber(vatSummary.reduce((sum, r) => sum + r.netTax, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="muted text-caption mt-1.5">
                    供 401 申報參考；進項稅額以已填稅額的支出為準。
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "categories" && (
        <CategoriesTab
          dateRange={dateRange}
          ledgerRows={bookLedgerRows}
          appSettings={appSettings}
          primaryCurrency={primaryCurrency}
          toPrimary={toPrimary}
          onSettingsClick={() => setCategoryDrawerOpen(true)}
        />
      )}

      {activeTab === "merchants" && (
        <MerchantsTab
          dateRange={dateRange}
          ledgerRows={bookLedgerRows}
          primaryCurrency={primaryCurrency}
          toPrimary={toPrimary}
        />
      )}

      {activeTab === "recurring" && <RecurringRulesTab />}

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
        merchantPool={merchantPool}
        namePool={namePool}
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
        shareDrafts={shareDrafts}
        setShareDrafts={setShareDrafts}
        onOpenImport={() => csvInputRef.current?.click()}
        isActiveCompanyBook={isActiveCompanyBook}
        isInvoiceEntry={isInvoiceEntry}
        setIsInvoiceEntry={setIsInvoiceEntry}
        invoiceNumber={invoiceNumber}
        setInvoiceNumber={setInvoiceNumber}
        invoiceNumberPreset={invoiceNumberPreset}
        setInvoiceNumberPreset={setInvoiceNumberPreset}
        invoiceClientId={invoiceClientId}
        setInvoiceClientId={setInvoiceClientId}
        bookClients={bookClients}
        lastInvoiceNumber={lastInvoiceNumber}
        onOpenClientManager={() => setClientManagerOpen(true)}
      />
      {clientManagerOpen && (
        <ClientManager
          bookId={activeBookId}
          clients={bookClients}
          onCreate={async (draft) => {
            await createClientMutation.mutateAsync(draft);
            await queryClient.invalidateQueries({ queryKey: ["clients"] });
          }}
          onUpdate={async (id, draft) => {
            await updateClientMutation.mutateAsync({ id, draft });
            await queryClient.invalidateQueries({ queryKey: ["clients"] });
          }}
          saving={createClientMutation.isPending || updateClientMutation.isPending}
          onClose={() => setClientManagerOpen(false)}
        />
      )}
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
        onClose={() => {
          setDetailRow(null);
          returnIfFromReconcile();
        }}
        onEdit={(row) => {
          setDetailRow(null);
          startEdit(row);
        }}
        onDuplicate={(row) => {
          setDetailRow(null);
          startDuplicate(
            row,
            (
              row as LedgerTransaction & {
                transferPair?: { source: LedgerTransaction; dest: LedgerTransaction };
              }
            ).transferPair,
          );
        }}
        onDelete={(row) => {
          setDetailRow(null);
          requestDelete(row);
        }}
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
        onSettle={(row) => {
          setDetailRow(null);
          setSettlePrompt(row);
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
    <ModalShell
      variant="center"
      title={isReceivable ? "收款結清" : "付款結清"}
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="ns-modal-panel"
    >
      {(dismiss) => (
        <>
          <div className="text-[15px] font-semibold mb-1">
            {isReceivable ? "收款結清" : "付款結清"}
          </div>
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
            <Button variant="outline" onClick={dismiss} disabled={pending}>
              取消
            </Button>
            <Button
              onClick={() => accountId && onConfirm(accountId)}
              disabled={pending || !accountId}
            >
              <Check size={14} weight="bold" />
              結清
            </Button>
          </div>
        </>
      )}
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
  const options: {
    scope: import("../data/repositories").RecurringEditScope;
    label: string;
    desc: string;
  }[] = [
    { scope: "this", label: "只改此次紀錄", desc: "僅更新這一筆，不影響規則與其他紀錄。" },
    {
      scope: "future",
      label: "此次與未來紀錄",
      desc: "更新這一筆，並修改週期規則（影響日後產生的紀錄）。",
    },
    {
      scope: "all",
      label: "全部紀錄（過去＋現在＋未來）",
      desc: "更新規則與所有已產生的紀錄（保留各自日期）。",
    },
  ];
  return (
    <ModalShell
      variant="center"
      title="套用變更範圍"
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="ns-modal-panel"
    >
      {(dismiss) => (
        <>
          <div className="text-[15px] font-semibold mb-1">套用變更範圍</div>
          <div className="text-xs muted mb-4">這是由週期規則產生的紀錄，請選擇要套用的範圍。</div>
          <div className="flex flex-col gap-2">
            {options.map((o) => (
              <button
                key={o.scope}
                disabled={pending}
                onClick={() => onChoose(o.scope)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: "var(--ns-r-md)",
                  border: "1px solid var(--ns-border)",
                  background: "var(--ns-bg-card)",
                  cursor: pending ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <div className="text-body" style={{ fontWeight: 500, color: "var(--ns-fg)" }}>
                  {o.label}
                </div>
                <div className="text-xs muted" style={{ marginTop: 3, lineHeight: 1.5 }}>
                  {o.desc}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={dismiss} disabled={pending}>
              取消
            </Button>
          </div>
        </>
      )}
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
    {
      mode: "later",
      label: "此期與之後",
      desc: `刪除第 ${row.installmentIndex ?? "?"} 期及之後所有未到期的分期紀錄。`,
    },
    {
      mode: "all",
      label: "整組分期",
      desc: "刪除這筆購物的全部分期紀錄（共 " + (row.installmentTotal ?? "?") + " 期）。",
    },
  ];
  return (
    <ModalShell
      variant="center"
      title="刪除分期紀錄"
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="ns-modal-panel"
    >
      {(dismiss) => (
        <>
          <div className="text-[15px] font-semibold mb-1">刪除分期紀錄</div>
          <div className="text-xs muted mb-4">
            {label
              ? `這是第 ${row.installmentIndex}/${row.installmentTotal} 期的分期紀錄，請選擇刪除範圍。`
              : "請選擇刪除範圍。"}
          </div>
          <div className="flex flex-col gap-2">
            {options.map((o) => (
              <button
                key={o.mode}
                disabled={pending}
                onClick={() => onChoose(o.mode)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: "var(--ns-r-md)",
                  border: "1px solid var(--ns-border)",
                  background: "var(--ns-bg-card)",
                  cursor: pending ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <div
                  className="text-body"
                  style={{
                    fontWeight: 500,
                    color: o.mode === "all" ? "var(--ns-neg)" : "var(--ns-fg)",
                  }}
                >
                  {o.label}
                </div>
                <div className="text-xs muted" style={{ marginTop: 3, lineHeight: 1.5 }}>
                  {o.desc}
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={dismiss} disabled={pending}>
              取消
            </Button>
          </div>
        </>
      )}
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
  onShareRepay,
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
  /** 分帳一鍵還款 (plan 235): tap 還款 on a share leg → prefilled transfer. */
  onShareRepay: (leg: LedgerTransaction) => void;
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
          <div
            className="w-[30px] h-[30px] shrink-0 flex items-center justify-center"
            style={{
              borderRadius: "var(--ns-r-sm)",
              background: "var(--ns-bg-hover)",
              color: "var(--ns-fg-muted)",
            }}
          >
            <Receipt size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                {row.name || row.merchant || "多類別"}
              </span>
              <Badge
                variant="outline"
                className="rounded-full"
                style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}
              >
                拆分 {splitLegs.length} 筆
              </Badge>
              {splitExpanded ? (
                <CaretDown size={14} style={{ color: "var(--ns-fg-muted)", flexShrink: 0 }} />
              ) : (
                <CaretRight size={14} style={{ color: "var(--ns-fg-muted)", flexShrink: 0 }} />
              )}
            </div>
            <div className="muted text-caption truncate">{subtitle}</div>
          </div>
          <div className="text-right">
            <div className="num text-[14.5px]" style={{ color }}>
              {sign}
              {currencySymbol(row.currency)}
              {formatNumber(Math.abs(row.amount))}
            </div>
          </div>
          <div className="ns-cf-actions flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" title="編輯拆分" onClick={onOpenEdit}>
              <PencilSimple size={13} />
            </Button>
            <Button variant="ghost" size="icon-sm" title="複製" onClick={onDuplicate}>
              <CopySimple size={13} />
            </Button>
            <Button
              variant="destructive-outline"
              size="icon-sm"
              title="刪除（整組刪除）"
              onClick={onDelete}
            >
              <Trash size={13} />
            </Button>
          </div>
        </div>
        {splitExpanded ? (
          <div className="ns-split-expansion">
            {splitLegs.map((leg) => (
              <div key={leg.id} className="ns-split-leg-line">
                <span className="muted text-caption truncate">
                  {leg.legKind === "share"
                    ? `分帳 · ${leg.name}`
                    : `${leg.category || "未分類"}${leg.subcategory ? ` / ${leg.subcategory}` : ""}`}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="muted text-caption"
                    style={{ fontFamily: "var(--ns-font-mono)", whiteSpace: "nowrap" }}
                  >
                    {leg.amount >= 0 ? "+" : "−"}
                    {currencySymbol(leg.currency)}
                    {formatNumber(Math.abs(leg.amount))}
                  </span>
                  {leg.legKind === "share" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="還款"
                      aria-label="還款"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareRepay(leg);
                      }}
                    >
                      <HandCoins size={13} />
                    </Button>
                  )}
                </div>
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
    const rate =
      crossCcy && dest.amount !== 0 ? Math.abs(source.amount) / Math.abs(dest.amount) : null;
    const subtitleParts = [
      `${accountName(source.accountId)} → ${accountName(dest.accountId)}`,
      rate
        ? `@${rate
            .toFixed(rate >= 100 ? 2 : 4)
            .replace(/0+$/, "")
            .replace(/\.$/, "")}`
        : null,
      source.note || null,
    ].filter(Boolean);
    return (
      <div
        className="ns-cf-row flex items-center gap-3 cursor-pointer"
        onClick={onEdit}
        style={{ padding: "9px 20px", borderBottom: "1px solid var(--ns-border)" }}
      >
        <div
          className="w-[30px] h-[30px] shrink-0 flex items-center justify-center"
          style={{
            borderRadius: "var(--ns-r-sm)",
            background: "var(--ns-bg-hover)",
            color: "var(--ns-fg-muted)",
          }}
        >
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
          <div className="num text-[14.5px]" style={{ color: "var(--ns-fg)" }}>
            {currencySymbol(source.currency)}
            {formatNumber(Math.abs(source.amount))}
          </div>
          {crossCcy ? (
            <div className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>
              → {currencySymbol(dest.currency)}
              {formatNumber(Math.abs(dest.amount))}
            </div>
          ) : null}
        </div>
        <div className="ns-cf-actions flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" title="複製" onClick={onDuplicate}>
            <CopySimple size={13} />
          </Button>
          <Button variant="destructive-outline" size="icon-sm" title="刪除" onClick={onDelete}>
            <Trash size={13} />
          </Button>
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
      <div
        className="w-[30px] h-[30px] shrink-0 flex items-center justify-center"
        style={{
          borderRadius: "var(--ns-r-sm)",
          background: "var(--ns-bg-hover)",
          color: "var(--ns-fg-muted)",
        }}
      >
        {isTransfer ? (
          <ArrowsLeftRight size={14} />
        ) : categoryIcon ? (
          <Glyph name={categoryIcon} size={15} />
        ) : (
          <Tag size={14} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
            {row.name || row.category || (isTransfer ? "轉帳" : "未命名")}
          </span>
          {isReceivable ? (
            <Badge
              variant="outline"
              className="rounded-full"
              style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}
            >
              應收
            </Badge>
          ) : null}
          {isPayable ? (
            <Badge
              variant="outline"
              className="rounded-full"
              style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}
            >
              應付
            </Badge>
          ) : null}
          {installmentLabel(row) ? (
            <Badge
              variant="outline"
              className="rounded-full"
              style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}
            >
              {installmentLabel(row)}
            </Badge>
          ) : null}
        </div>
        <div className="muted text-caption truncate">{subtitle}</div>
      </div>
      <div className="text-right">
        {row.originalCurrency && row.originalAmount != null ? (
          <>
            <div className="num text-[14.5px]" style={{ color }}>
              {sign}
              {currencySymbol(row.originalCurrency)}
              {formatNumber(Math.abs(row.originalAmount))}
            </div>
            <div className="muted text-micro" style={{ fontFamily: "var(--ns-font-mono)" }}>
              ≈ {currencySymbol(row.currency)}
              {formatNumber(Math.abs(row.amount))}
            </div>
          </>
        ) : (
          <div className="num text-[14.5px]" style={{ color }}>
            {sign}
            {currencySymbol(row.currency)}
            {formatNumber(Math.abs(row.amount))}
          </div>
        )}
      </div>
      <div className="ns-cf-actions flex gap-1" onClick={(e) => e.stopPropagation()}>
        {isReceivable || isPayable ? (
          <Button variant="ghost" size="icon-sm" title="結清" onClick={onSettle}>
            <Check size={14} />
          </Button>
        ) : null}
        {!isTransfer ? (
          <Button variant="ghost" size="icon-sm" title="編輯" onClick={onOpenEdit}>
            <PencilSimple size={13} />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" title="複製" onClick={onDuplicate}>
          <CopySimple size={13} />
        </Button>
        <Button variant="destructive-outline" size="icon-sm" title="刪除" onClick={onDelete}>
          <Trash size={13} />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────── Stat + ranking cards ─────────────── */

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "muted";
}) {
  const color =
    tone === "pos" ? "var(--ns-pos)" : tone === "neg" ? "var(--ns-neg)" : "var(--ns-fg)";
  return (
    <Card style={{ padding: 18 }}>
      <div className="text-xs mb-2 muted font-medium">{label}</div>
      <div className="num text-stat font-medium" style={{ color }}>
        {value}
      </div>
    </Card>
  );
}

function RankingCard({
  title,
  rows,
  emptyText,
  currency,
}: {
  title: string;
  rows: Array<{ name: string; amount: number }>;
  emptyText: string;
  currency: string;
}) {
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
                <span className="num muted">
                  {currency} {formatNumber(row.amount)}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 99,
                  background: "var(--ns-bg-hover)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(6, (row.amount / max) * 100)}%`,
                    height: "100%",
                    background: "var(--ns-accent)",
                  }}
                />
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
                    <div className="muted text-caption">
                      {row.nextRunDate} · {accountName(row.accountId)}
                    </div>
                  </div>
                  <span
                    className="num whitespace-nowrap"
                    style={{
                      color: row.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)",
                    }}
                  >
                    {row.entryType === "income" ? "+" : "−"}
                    {row.currency} {formatNumber(Math.abs(row.amount))}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="whitespace-nowrap"
                    disabled={posting}
                    onClick={() => onPost(row.id)}
                    title="立即記入這筆交易"
                  >
                    記入
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted text-body">30 天內沒有排定的週期事件。</div>
          )}
          {later.length > 0 ? (
            <div
              className="mt-3.5 pt-3 flex flex-col gap-1.5"
              style={{ borderTop: "1px solid var(--ns-border)" }}
            >
              <div className="muted text-caption font-medium mb-0.5">之後</div>
              {later.map((row) => (
                <div
                  key={row.id}
                  className="text-caption flex items-center justify-between gap-2 muted"
                >
                  <span className="truncate">
                    {row.nextRunDate} · {row.merchant || row.category}
                  </span>
                  <span className="num whitespace-nowrap">
                    {row.entryType === "income" ? "+" : "−"}
                    {row.currency} {formatNumber(Math.abs(row.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      {active.length > 0 ? (
        <div
          className="mt-3.5 pt-3 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid var(--ns-border)" }}
        >
          <span className="muted text-caption">
            每月固定{" "}
            <span
              className="num"
              style={{ color: monthlyTotal >= 0 ? "var(--ns-pos)" : "var(--ns-neg)" }}
            >
              {monthlyTotal >= 0 ? "+" : "−"}
              {primaryCurrency} {formatNumber(Math.abs(monthlyTotal))}
            </span>{" "}
            · {active.length} 條規則
          </span>
          <Button variant="ghost" size="xs" className="whitespace-nowrap" onClick={onManage}>
            管理 ›
          </Button>
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
  merchantPool,
  namePool,
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
  shareDrafts,
  setShareDrafts,
  onOpenImport,
  isActiveCompanyBook,
  isInvoiceEntry,
  setIsInvoiceEntry,
  invoiceNumber,
  setInvoiceNumber,
  invoiceNumberPreset,
  setInvoiceNumberPreset,
  invoiceClientId,
  setInvoiceClientId,
  bookClients,
  lastInvoiceNumber,
  onOpenClientManager,
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
  merchantPool: string[];
  namePool: string[];
  categorySuggestions: { merchants: string[]; accountIds: string[] };
  categoryForMerchant: (merchant: string) => { category: string; subcategory: string } | null;
  accountRows: Array<
    Pick<
      Account,
      "id" | "name" | "currency" | "type" | "iconName" | "color" | "bankBrandDomain" | "bookId"
    >
  >;
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
  /** 分帳 participant shares (plan 222) — always an array; emptiness is "no shares". */
  shareDrafts: SplitShareDraftState[];
  setShareDrafts: (shares: SplitShareDraftState[]) => void;
  onOpenImport?: () => void;
  /** 開發票 (plan 191) — the ar drawer's invoice toggle + fields only render
   *  when the active book is a 公司帳. */
  isActiveCompanyBook: boolean;
  isInvoiceEntry: boolean;
  setIsInvoiceEntry: (value: boolean) => void;
  invoiceNumber: string;
  setInvoiceNumber: (value: string) => void;
  invoiceNumberPreset: InvoiceNumberPreset;
  setInvoiceNumberPreset: (value: InvoiceNumberPreset) => void;
  invoiceClientId: string | null;
  setInvoiceClientId: (value: string | null) => void;
  bookClients: Client[];
  lastInvoiceNumber: string | null;
  onOpenClientManager: () => void;
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
  useEffect(() => {
    if (open) {
      setShowAdvanced(false);
      setShowAllEntryAccounts(false);
    }
  }, [open]);
  const entryPickerAccounts =
    isAllBooksEntry || showAllEntryAccounts
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

  const destAmountField = useNumericField(transferForm.destinationAmount ?? 0, (v) =>
    setTransferForm({ ...transferForm, destinationAmount: v }),
  );
  const transferFeeField = useNumericField(transferForm.feeAmount ?? 0, (v) =>
    setTransferForm({ ...transferForm, feeAmount: v }),
  );
  const expenseFeeField = useNumericField(ledgerForm.feeAmount ?? 0, (v) =>
    setLedgerForm({ ...ledgerForm, feeAmount: v }),
  );
  // 營業稅額 (plan 286) — undefined/null = 未填 (no checkbox ticked); a filled
  // value (including 0) means the user has explicitly recorded a tax amount.
  const hasTaxAmount = ledgerForm.taxAmount != null;
  const taxAmountField = useNumericField(ledgerForm.taxAmount ?? 0, (v) =>
    setLedgerForm({ ...ledgerForm, taxAmount: v }),
  );

  // Two-phase close (mirrors ModalShell's requestClose): let the exit
  // transition on the panel play before telling the parent to unmount us.
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  // Latest onClose behind a ref (same as ModalShell's closeRef): `onClose` is
  // CashFlowRoute's `closeDrawer`, recreated every parent render. Putting the
  // raw prop in the close effect's deps re-ran it after the parent unmounted the panel
  // (open=false, closing still true, panelRef null) → onClose() → parent
  // setState → new onClose identity → effect again… a nested-update loop that
  // production React throws as error #185 on every animated dismiss.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    const panel = panelRef.current;
    // jsdom / legacy engines: computed transition-duration is empty or 0s →
    // close synchronously.
    const dur = panel ? parseFloat(getComputedStyle(panel).transitionDuration || "0") : 0;
    if (!panel || !dur) {
      closingRef.current = true;
      closeRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
  }, []);

  // Unlike ModalShell (unmounted while closed), this drawer stays mounted with
  // `open` false — so the closing flag must be cleared on BOTH edges: on
  // reopen (stale flag would skip the next close) and on close (a lingering
  // `closing=true` while unmounted is the state the #185 loop lived in).
  useEffect(() => {
    closingRef.current = false;
    setClosing(false);
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    if (!panel) {
      closeRef.current();
      return;
    }
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      closeRef.current();
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
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      // A ModalShell (e.g. RecurringScopeModal) can be stacked on top of
      // this hand-rolled drawer — its focus trap keeps focus inside the
      // dialog, so an Escape meant for it still targets that dialog. Since
      // ModalShell no longer stops propagation synchronously (plan 305),
      // this window listener would otherwise also see — and act on — that
      // same Escape, closing the drawer underneath and losing the in-
      // progress edit. Ignore it; the stacked dialog owns it.
      if (event.key === "Escape" && !escapeTargetInsideDialog(event)) requestClose();
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
    ? (recurringRows.find((r) => r.id === editingRecurringRuleId) ?? null)
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
  // 分帳 (plan 222): the drawer's total is legs + shares combined; shares are
  // expense-only (the builder throws 分帳僅支援支出 on income) so income splits
  // never render the 分帳 section and shareDrafts is kept cleared for them.
  const splitTotal =
    splitMode && splitLegs
      ? derivedSplitTotal(splitLegs) + (type === "expense" ? derivedShareTotal(shareDrafts) : 0)
      : 0;
  // Combined check (plan 222): splitLegsError alone only knows about legs, so
  // it wrongly demands >=2 legs even when a share makes the combined total
  // valid (1 category leg + 1 share). combinedSplitError is the single
  // source of truth gating the Save button below; shareDrafts is always []
  // for income (changeType's guard), so this is a no-op there.
  const splitError = splitMode && splitLegs ? combinedSplitError(splitLegs, shareDrafts) : null;
  const shareError = splitMode && type === "expense" ? shareDraftsError(shareDrafts) : null;
  // The「＋ 分類」affordance: only once a category is picked, only for plain
  // (non-editing, non-installment) expense/income drafts, and not while the
  // amount is being entered in a foreign currency (splits store one account-
  // currency amount per leg; no originalAmount support on legs).
  const canEnterSplit =
    isAcct &&
    !splitMode &&
    !editing &&
    !activeInstallment &&
    !isForeignEntry &&
    Boolean(ledgerForm.category.trim());

  function enterSplit() {
    // Legs are amounts in the ACCOUNT currency; pin the display currency so a
    // later currency-selector change can't desync the derived total's unit.
    setEntryDisplayCurrency(ledgerForm.currency);
    setSplitLegs(
      enterSplitMode({
        category: ledgerForm.category,
        subcategory: ledgerForm.subcategory,
        amountExpression,
      }),
    );
  }

  function removeLegAt(index: number) {
    if (!splitLegs) return;
    const next = removeSplitLeg(splitLegs, index);
    if (shouldExitSplitMode(next, shareDrafts)) {
      // Down to 1 (or 0) legs with no shares present → back to the plain form
      // carrying that leg's values.
      const remaining = next[0] ?? makeEmptySplitLeg();
      setLedgerForm({
        ...ledgerForm,
        category: remaining.category,
        subcategory: remaining.subcategory,
      });
      setAmountExpression(remaining.amount || "0");
      setSplitLegs(null);
      setShareDrafts([]);
    } else {
      setSplitLegs(next);
    }
  }

  // History-driven suggestions for the chosen category, shown as one-tap chips.
  // Only surfaced while the relevant field is still empty so we never override
  // a value the user already entered. Split mode hides them: `ledgerForm.category`
  // is stale there (legs own the categories).
  const hasCategory = Boolean(ledgerForm.category.trim());
  const merchantChips =
    !splitMode && hasCategory && !ledgerForm.merchant.trim()
      ? categorySuggestions.merchants.filter((m) => m && m !== ledgerForm.merchant)
      : [];
  const accountChips =
    !splitMode && hasCategory && !ledgerForm.accountId
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
          background: "var(--ns-bg-elev)",
          borderLeft: "1px solid var(--ns-border)",
          boxShadow: "var(--ns-shadow-2)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3"
          style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--ns-border)" }}
        >
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{ borderRadius: "var(--ns-r-sm)", background: meta.color, color: "#fff" }}
          >
            <Plus size={15} weight="bold" />
          </div>
          <h2
            className="text-lg m-0 font-semibold"
            style={{ fontFamily: "var(--ns-font-display)" }}
          >
            {editing ? "編輯交易" : "新增交易"}
          </h2>
          <div className="flex-1" />
          {onOpenImport && !editing && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => {
                onClose();
                onOpenImport();
              }}
            >
              <UploadSimple size={14} style={{ marginRight: 6 }} />
              匯入 CSV
            </Button>
          )}
          <ModalCloseButton onClick={requestClose} />
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
                    padding: "6px 14px",
                    borderRadius: 999,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: active ? "none" : "1px solid var(--ns-border)",
                    background: active ? m.color : "var(--ns-bg-card)",
                    color: active ? "#fff" : "var(--ns-fg-dim)",
                    fontFamily: "inherit",
                    transition:
                      "background 150ms var(--ns-ease), color 150ms var(--ns-ease), border-color 150ms var(--ns-ease)",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-auto flex flex-col gap-[18px]"
          style={{ padding: "20px 24px" }}
        >
          {/* Recurring rule banner */}
          {linkedRule && (
            <div
              className="text-xs flex items-center gap-2"
              style={{
                padding: "10px 14px",
                borderRadius: "var(--ns-r-sm)",
                background: "var(--ns-accent-soft)",
                border: "1px solid var(--ns-accent)",
              }}
            >
              <span className="font-semibold" style={{ color: "var(--ns-accent)" }}>
                週期交易
              </span>
              <span className="muted">
                此筆由週期規則「{linkedRule.merchant || linkedRule.category}」自動產生（
                {recurringFrequencyLabels[linkedRule.frequency]}）
              </span>
            </div>
          )}
          {/* Amount — in split mode this is the READ-ONLY derived Σ of the
              leg amounts (MOZE:「多類別 $180」), never directly editable. */}
          <DrawerField
            label={
              splitMode
                ? `多類別 · 共 ${ledgerForm.currency} ${formatNumber(splitTotal)}`
                : `${meta.eyebrow} · ${type === "transfer" ? transferForm.sourceCurrency : entryDisplayCurrency}`
            }
            required
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--ns-bg-elev)",
                border: amountFocused ? "1px solid var(--ns-accent)" : "1px solid var(--ns-border)",
                boxShadow: amountFocused ? "0 0 0 3px var(--ns-accent-soft)" : "none",
                borderRadius: "var(--ns-r-sm)",
                height: 52,
                overflow: "hidden",
                transition: "border-color 0.12s, box-shadow 0.12s",
              }}
            >
              {isAcct && entryCurrencies.length > 1 && !splitMode ? (
                <AppSelect
                  value={entryDisplayCurrency}
                  onChange={setEntryDisplayCurrency}
                  options={entryCurrencies.map((currency) => ({
                    value: currency,
                    label: currency,
                  }))}
                  searchPlaceholder="搜尋幣別…"
                  style={{
                    padding: "0 10px 0 14px",
                    fontSize: 16,
                    color: meta.color,
                    fontFamily: "var(--ns-font-mono)",
                    fontWeight: 500,
                    flexShrink: 0,
                    borderRight: "1px solid var(--ns-border)",
                    height: "100%",
                    background: "transparent",
                    border: "none",
                    width: 92,
                    minWidth: 92,
                  }}
                />
              ) : (
                <span
                  className="text-xl"
                  style={{
                    padding: "0 14px",
                    color: meta.color,
                    fontFamily: "var(--ns-font-mono)",
                    fontWeight: 500,
                    flexShrink: 0,
                    borderRight: "1px solid var(--ns-border)",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    userSelect: "none",
                  }}
                >
                  {type === "transfer"
                    ? transferForm.sourceCurrency
                    : splitMode
                      ? ledgerForm.currency
                      : entryDisplayCurrency}
                </span>
              )}
              {splitMode ? (
                <div
                  className="text-stat"
                  aria-label="多類別總金額（各明細加總）"
                  style={{
                    flex: 1,
                    padding: "0 14px",
                    fontFamily: "var(--ns-font-mono)",
                    color: meta.color,
                    textAlign: "right",
                    height: "100%",
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                >
                  {formatNumber(splitTotal)}
                </div>
              ) : type === "transfer" ? (
                <NumberField
                  className="text-stat"
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    padding: "0 14px",
                    fontFamily: "var(--ns-font-mono)",
                    color: meta.color,
                    textAlign: "right",
                    height: "100%",
                    minWidth: 0,
                    width: "100%",
                    fontVariantNumeric: "tabular-nums lining-nums",
                  }}
                  decimals={2}
                  value={transferForm.sourceAmount}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  onChange={(v) => {
                    const sameCcy =
                      transferForm.sourceCurrency === transferForm.destinationCurrency;
                    setTransferForm({
                      ...transferForm,
                      sourceAmount: v,
                      destinationAmount: sameCcy ? v : transferForm.destinationAmount,
                    });
                  }}
                  placeholder="0"
                />
              ) : (
                <input
                  className="text-stat"
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    padding: "0 14px",
                    fontFamily: "var(--ns-font-mono)",
                    color: meta.color,
                    textAlign: "right",
                    height: "100%",
                    minWidth: 0,
                    width: "100%",
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
                總金額為分類與分帳明細金額的加總。
              </div>
            )}
            {convertedHint && (
              <div className="muted text-caption" style={{ marginTop: 5 }}>
                ≈ {ledgerForm.currency} {formatNumber(convertedHint.converted)}（1{" "}
                {entryDisplayCurrency} ≈ {convertedHint.rate} {ledgerForm.currency}）
              </div>
            )}
            {activeInstallment && installmentPreviewAmount !== null && (
              <div className="muted text-caption" style={{ marginTop: 5 }}>
                每期約 {entryDisplayCurrency} {formatNumber(installmentPreviewAmount)}，共{" "}
                {installmentPeriods} 期
              </div>
            )}
          </DrawerField>

          {/* Date (+ currency for transfer). Expense/income render date + account
              inside the progressive block. Receivable/payable do NOT pick a
              settle account here — it's chosen at 結清 time (the counterparty
              may not have said which account they'll use yet). */}
          {!isAcct && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: type === "transfer" ? "1fr 1fr" : "1fr",
                gap: 14,
              }}
            >
              <DrawerField label="日期">
                <input
                  className="ns-input"
                  type="datetime-local"
                  value={toDatetimeLocalValue(
                    type === "transfer" ? transferForm.date : ledgerForm.date,
                  )}
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
                    setTransferForm({
                      ...transferForm,
                      sourceAccountId: id,
                      sourceCurrency: account?.currency ?? transferForm.sourceCurrency,
                    });
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
                    setTransferForm({
                      ...transferForm,
                      destinationAccountId: id,
                      destinationCurrency: destCurrency,
                      destinationAmount: sameCcy
                        ? transferForm.sourceAmount
                        : transferForm.destinationAmount,
                    });
                  }}
                  allowAll={false}
                  placeholder="選擇帳戶"
                  style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                />
              </DrawerField>
            </div>
          )}

          {/* Cross-currency: editable destination amount */}
          {type === "transfer" &&
            transferForm.sourceCurrency !== transferForm.destinationCurrency && (
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
              <div className="muted text-caption mt-1">
                跨行/跨國轉帳手續費，將從轉出帳戶另計一筆「手續費」支出。
              </div>
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
                          <span
                            className="muted text-caption"
                            style={{ fontFamily: "var(--ns-font-mono)" }}
                          >
                            #{index + 1}
                          </span>
                          <span className="text-xs font-medium flex-1 truncate">
                            {legState.category
                              ? `${legState.category}${legState.subcategory ? ` / ${legState.subcategory}` : ""}`
                              : "未選擇分類"}
                          </span>
                          <input
                            className="ns-input text-right"
                            style={{ width: 110, height: 32, fontFamily: "var(--ns-font-mono)" }}
                            value={legState.amount}
                            onChange={(e) =>
                              setSplitLegs(
                                updateSplitLeg(splitLegs, index, { amount: e.target.value }),
                              )
                            }
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
                          onPick={(name) =>
                            setSplitLegs(
                              updateSplitLeg(splitLegs, index, { category: name, subcategory: "" }),
                            )
                          }
                          onPickSub={(s) =>
                            setSplitLegs(updateSplitLeg(splitLegs, index, { subcategory: s }))
                          }
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        className="text-xs"
                        onClick={() => setSplitLegs(addSplitLeg(splitLegs))}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 999,
                          cursor: "pointer",
                          background: "transparent",
                          color: "var(--ns-accent)",
                          border: "1px dashed var(--ns-accent)",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Plus size={14} weight="bold" />
                        新增分類
                      </button>
                      {splitError ? (
                        <span className="text-caption" style={{ color: "var(--ns-neg)" }}>
                          {splitError}
                        </span>
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
                    onPick={(name) =>
                      setLedgerForm({ ...ledgerForm, category: name, subcategory: "" })
                    }
                    onPickSub={(s) => setLedgerForm({ ...ledgerForm, subcategory: s })}
                    trailing={
                      canEnterSplit ? (
                        <button
                          type="button"
                          className="text-xs"
                          onClick={enterSplit}
                          title="拆分為多個分類，各自填金額"
                          style={{
                            padding: "5px 11px",
                            borderRadius: 999,
                            cursor: "pointer",
                            background: "transparent",
                            color: "var(--ns-accent)",
                            border: "1px dashed var(--ns-accent)",
                            fontFamily: "inherit",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Plus size={14} weight="bold" />
                          分類
                        </button>
                      ) : undefined
                    }
                  />
                </DrawerField>
              )}

              {/* 分帳 (plan 222): someone else's portion of this purchase,
                  posted as a 代墊 pass-through via the share's own 應收帳戶 —
                  never counted in the payer's own spend. Expense-only (the
                  foundation throws 分帳僅支援支出 on income); shareDrafts is
                  kept cleared for income splits so this never renders there. */}
              {splitMode && type === "expense" && (
                <DrawerField label="分帳（選填）">
                  <div className="flex flex-col gap-2.5">
                    {shareDrafts.map((shareState, index) => (
                      <div key={index} className="ns-split-leg">
                        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                          <span
                            className="muted text-caption"
                            style={{ fontFamily: "var(--ns-font-mono)" }}
                          >
                            #{index + 1}
                          </span>
                          <input
                            className="ns-input flex-1"
                            style={{ height: 32 }}
                            value={shareState.counterparty}
                            onChange={(e) =>
                              setShareDrafts(
                                updateShareDraft(shareDrafts, index, {
                                  counterparty: e.target.value,
                                }),
                              )
                            }
                            placeholder="小明"
                            aria-label={`第 ${index + 1} 筆分帳對象`}
                          />
                          <input
                            className="ns-input text-right"
                            style={{ width: 110, height: 32, fontFamily: "var(--ns-font-mono)" }}
                            value={shareState.amount}
                            onChange={(e) =>
                              setShareDrafts(
                                updateShareDraft(shareDrafts, index, { amount: e.target.value }),
                              )
                            }
                            placeholder="0"
                            inputMode="decimal"
                            aria-label={`第 ${index + 1} 筆分帳金額`}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`移除第 ${index + 1} 筆分帳`}
                            title="移除此分帳"
                            onClick={() => setShareDrafts(removeShareDraft(shareDrafts, index))}
                          >
                            <X size={13} />
                          </Button>
                        </div>
                        <AppSelect
                          value={shareState.counterAccountId}
                          onChange={(id) =>
                            setShareDrafts(
                              updateShareDraft(shareDrafts, index, { counterAccountId: id }),
                            )
                          }
                          options={accountRows.map((a) => ({ value: a.id, label: a.name }))}
                          placeholder="選擇應收帳戶"
                          style={{ width: "100%", height: 32 }}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        className="text-xs"
                        onClick={() => setShareDrafts(addShareDraft(shareDrafts))}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 999,
                          cursor: "pointer",
                          background: "transparent",
                          color: "var(--ns-accent)",
                          border: "1px dashed var(--ns-accent)",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Plus size={14} weight="bold" />
                        分帳
                      </button>
                      {shareError ? (
                        <span className="text-caption" style={{ color: "var(--ns-neg)" }}>
                          {shareError}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="muted text-caption" style={{ marginTop: 5 }}>
                    分帳金額由「應收帳戶」暫記（代墊），對方還款時從該帳戶轉帳回來即可。不計入你的支出。
                  </div>
                </DrawerField>
              )}

              {/* 2 · Account + date, with a suggested account from history */}
              <div>
                <div className="ns-form-row-2">
                  <DrawerField label={type === "expense" ? "支出帳戶" : "收入帳戶"} required>
                    <AccountFilter
                      accounts={entryPickerAccounts}
                      value={ledgerForm.accountId}
                      onChange={(id) => {
                        const account = accountRows.find((a) => a.id === id);
                        setLedgerForm({
                          ...ledgerForm,
                          accountId: id,
                          currency: account?.currency ?? ledgerForm.currency,
                        });
                      }}
                      allowAll={false}
                      placeholder="選擇帳戶"
                      style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                    />
                    {!isAllBooksEntry && !showAllEntryAccounts ? (
                      <button
                        type="button"
                        className="muted text-xs"
                        style={{
                          marginTop: 4,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => setShowAllEntryAccounts(true)}
                      >
                        顯示全部帳戶
                      </button>
                    ) : null}
                  </DrawerField>
                  <DrawerField label="日期">
                    <input
                      className="ns-input"
                      type="datetime-local"
                      value={ledgerForm.date}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, date: e.target.value })}
                    />
                  </DrawerField>
                </div>
                {accountChips.length > 0 && (
                  <SuggestionRow
                    chips={accountChips.map((a) => ({ key: a.id, label: a.name }))}
                    onPick={(id) => {
                      const account = accountRows.find((a) => a.id === id);
                      setLedgerForm({
                        ...ledgerForm,
                        accountId: id,
                        currency: account?.currency ?? ledgerForm.currency,
                      });
                    }}
                  />
                )}
              </div>

              {/* 3 · Name + merchant, with suggested merchants for this category */}
              <div>
                <div className="grid grid-cols-2 gap-3.5">
                  <DrawerField label="名稱">
                    <SuggestInput
                      value={ledgerForm.name}
                      options={namePool}
                      onChange={(next) => setLedgerForm({ ...ledgerForm, name: next })}
                      placeholder={type === "expense" ? "計程車" : "月薪"}
                      ariaLabel="名稱建議"
                    />
                  </DrawerField>
                  <DrawerField label="商家 / 來源">
                    <SuggestInput
                      value={ledgerForm.merchant}
                      options={merchantPool}
                      onChange={(next) => {
                        const patch = { ...ledgerForm, merchant: next };
                        // Reverse path: typing a merchant auto-fills its usual category,
                        // but only when no category has been chosen yet.
                        if (!ledgerForm.category.trim()) {
                          const suggestion = categoryForMerchant(next);
                          if (suggestion?.category) {
                            patch.category = suggestion.category;
                            patch.subcategory = suggestion.subcategory;
                          }
                        }
                        setLedgerForm(patch);
                      }}
                      placeholder={type === "expense" ? "UBER" : "公司"}
                      ariaLabel="商家建議"
                    />
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
                      style={{
                        flex: 1,
                        cursor: "pointer",
                        fontWeight: ledgerForm.postDate ? 400 : 600,
                        color: ledgerForm.postDate ? "var(--ns-fg-muted)" : "var(--ns-fg)",
                      }}
                      onClick={() => setLedgerForm({ ...ledgerForm, postDate: null })}
                    >
                      當下入帳
                    </button>
                    <button
                      type="button"
                      className="ns-input"
                      style={{
                        flex: 1,
                        cursor: "pointer",
                        fontWeight: ledgerForm.postDate ? 600 : 400,
                        color: ledgerForm.postDate ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                      }}
                      onClick={() =>
                        setLedgerForm({
                          ...ledgerForm,
                          postDate:
                            ledgerForm.postDate ??
                            (ledgerForm.date ? ledgerForm.date.slice(0, 10) : ""),
                        })
                      }
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
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ns-fg-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 0",
                    fontFamily: "inherit",
                  }}
                >
                  {showAdvanced ? <CaretDown size={13} /> : <CaretRight size={13} />}
                  更多選項（手續費、週期、備註）
                </button>
              </div>
              {showAdvanced && (
                <>
                  {(type === "expense" || type === "income") &&
                    !activeInstallment &&
                    !splitMode && (
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
                  {/* 營業稅額 (plan 286) — 公司帳交易可填內含的營業稅，供 401 報表算出
                      進項/銷項稅額。開發票模式已用 computeSalesTax 拆稅，這裡不重複顯示。 */}
                  {(type === "expense" || type === "income") &&
                    !activeInstallment &&
                    !splitMode &&
                    isActiveCompanyBook &&
                    !isInvoiceEntry && (
                      <DrawerField label={`內含營業稅（選填） · ${ledgerForm.currency}`}>
                        <label
                          className="flex items-center gap-2 text-body"
                          style={{ cursor: "pointer", marginBottom: hasTaxAmount ? 8 : 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={hasTaxAmount}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const amountAbs = Math.abs(Number(amountExpression) || 0);
                                setLedgerForm({
                                  ...ledgerForm,
                                  taxAmount: computeSalesTax(amountAbs).tax,
                                });
                              } else {
                                setLedgerForm({ ...ledgerForm, taxAmount: null });
                              }
                            }}
                          />
                          此筆內含 5% 營業稅
                        </label>
                        {hasTaxAmount && (
                          <input
                            className="ns-input"
                            placeholder="0"
                            style={{ fontFamily: "var(--ns-font-mono)" }}
                            {...taxAmountField}
                          />
                        )}
                        <div className="muted text-caption mt-1">
                          統一發票 5% 內含稅，稅額可手動修正。未稅額 = 總額 − 稅額。
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
                    <input
                      className="ns-input"
                      value={ledgerForm.note}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, note: e.target.value })}
                      placeholder="選填"
                    />
                  </DrawerField>
                </>
              )}
            </>
          )}

          {/* AR / AP */}
          {isRp && (
            <>
              <div
                className="text-xs"
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--ns-r-md)",
                  background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
                  color: "var(--ns-fg-muted)",
                  lineHeight: 1.6,
                }}
              >
                {type === "ar"
                  ? "應收帳款：對方欠你的錢（代墊、借錢給別人都算）。選下方「付款帳戶」＝你先出錢的帳戶，建立時立即扣款；對方還款時點 ✓ 結清會入「收款帳戶」，整筆不計收支。留空則結清後才計入收入。"
                  : "應付帳款：你欠對方的錢（代墊、跟別人借錢都算）。選下方「收款帳戶」＝錢先進來的帳戶，例如借現金就選現金，建立時立即入帳；還款時點 ✓ 結清會由「付款帳戶」扣款，整筆不計收支。留空則結清後才計入支出。"}
              </div>

              {/* 開發票 toggle (plan 191 step 2) — only offered for ar in a 公司帳. */}
              {type === "ar" && isActiveCompanyBook && (
                <label className="flex items-center gap-2 text-body" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isInvoiceEntry}
                    onChange={(e) => setIsInvoiceEntry(e.target.checked)}
                  />
                  <span>設為發票（自動計算 5% 銷項營業稅）</span>
                </label>
              )}

              <DrawerField
                label={
                  type === "ar" ? (isInvoiceEntry ? "客戶" : "對象（欠款方）") : "對象（收款方）"
                }
                required
              >
                {type === "ar" && isInvoiceEntry ? (
                  <>
                    <ClientAutocomplete
                      value={counterparty}
                      clients={bookClients}
                      onChange={(name, client) => {
                        setCounterparty(name);
                        setInvoiceClientId(client?.id ?? null);
                        if (client && !dueDate) {
                          const suggested = defaultInvoiceDueDate(
                            ledgerForm.date,
                            client.defaultPaymentTerms,
                          );
                          if (suggested) setDueDate(suggested);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="text-micro muted"
                      style={{
                        marginTop: 5,
                        cursor: "pointer",
                        background: "none",
                        border: "none",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                      onClick={onOpenClientManager}
                    >
                      管理客戶
                    </button>
                  </>
                ) : (
                  <input
                    className="ns-input"
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    placeholder={
                      type === "ar" ? "例：小明、ABC 公司" : "例：借我錢的朋友、房東、供應商"
                    }
                  />
                )}
              </DrawerField>

              {/* 發票號碼 + 稅額預覽 (plan 191 step 2) */}
              {type === "ar" && isInvoiceEntry && (
                <>
                  <DrawerField label="發票號碼" required>
                    <div className="flex gap-2">
                      <AppSelect
                        value={invoiceNumberPreset}
                        onChange={(v) => setInvoiceNumberPreset(v as InvoiceNumberPreset)}
                        options={[
                          { value: "TW_UNIFORM", label: "統一發票" },
                          { value: "FREE_TEXT", label: "自由格式" },
                        ]}
                        style={{ width: 120, flexShrink: 0, height: 40 }}
                      />
                      <input
                        className="ns-input"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                        placeholder={
                          invoiceNumberPreset === "TW_UNIFORM" ? "AB12345678" : "自訂發票號碼"
                        }
                        style={{ fontFamily: "var(--ns-font-mono)", flex: 1 }}
                      />
                    </div>
                    {lastInvoiceNumber && (
                      <button
                        type="button"
                        className="text-micro muted"
                        style={{
                          marginTop: 5,
                          cursor: "pointer",
                          background: "none",
                          border: "none",
                          padding: 0,
                          textDecoration: "underline",
                        }}
                        onClick={() => {
                          const result = nextInvoiceNumber(lastInvoiceNumber, invoiceNumberPreset);
                          if (result.ok) setInvoiceNumber(result.value);
                        }}
                      >
                        建議號碼：延續上一張（{lastInvoiceNumber}）
                      </button>
                    )}
                    {invoiceNumber.trim() &&
                      !validateInvoiceNumber(invoiceNumber.trim(), invoiceNumberPreset) && (
                        <div
                          className="text-micro"
                          style={{ marginTop: 5, color: "var(--ns-neg)" }}
                        >
                          {invoiceNumberPreset === "TW_UNIFORM"
                            ? "格式需為 2 碼英文字軌 + 8 碼數字（例：AB12345678）。"
                            : "請輸入發票號碼。"}
                        </div>
                      )}
                  </DrawerField>
                  <DrawerField label="稅額試算（5% 內含）">
                    {(() => {
                      const total = Math.abs(evaluateAmountExpression(amountExpression)) || 0;
                      const { taxExclusive, tax } = computeSalesTax(total);
                      return (
                        <div className="text-body muted">
                          未稅 {formatNumber(taxExclusive)} ＋ 稅額 {formatNumber(tax)} ＝ 含稅{" "}
                          {formatNumber(total)}
                        </div>
                      );
                    })()}
                  </DrawerField>
                </>
              )}

              <DrawerField
                label={
                  type === "ar"
                    ? isInvoiceEntry
                      ? "到期日（選填）"
                      : "預計收款日（選填）"
                    : "付款截止日（選填）"
                }
              >
                <input
                  className="ns-input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ fontFamily: "var(--ns-font-mono)" }}
                />
              </DrawerField>
              <DrawerField
                label={
                  type === "ar"
                    ? "付款帳戶（我先墊付，建立時扣款，選填）"
                    : "收款帳戶（借入／先收到的錢，建立時入帳，選填）"
                }
              >
                <AccountFilter
                  accounts={accountRows}
                  value={ledgerForm.counterAccountId ?? "all"}
                  onChange={(id) =>
                    setLedgerForm({ ...ledgerForm, counterAccountId: id === "all" ? null : id })
                  }
                  allowAll
                  allLabel={type === "ar" ? "不指定（結清後才計收入）" : "不指定（結清後才計支出）"}
                  placeholder="選擇帳戶"
                  style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                />
              </DrawerField>
              <DrawerField label="分類">
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => {
                    const active = ledgerForm.category === c.name;
                    return (
                      <button
                        key={c.name}
                        className="text-xs"
                        onClick={() =>
                          setLedgerForm({ ...ledgerForm, category: c.name, subcategory: "" })
                        }
                        style={{
                          padding: "5px 11px",
                          borderRadius: 999,
                          cursor: "pointer",
                          background: active ? c.color || "var(--ns-accent)" : "var(--ns-bg-card)",
                          color: active
                            ? readableTextColor(c.color || "var(--ns-accent)")
                            : "var(--ns-fg)",
                          border: active
                            ? "1px solid rgba(0,0,0,0.12)"
                            : "1px solid var(--ns-border)",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
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

          {message ? (
            <div className="text-body" style={{ color: "var(--ns-neg)" }}>
              {message}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          className="flex gap-2"
          style={{
            padding: "14px 24px calc(14px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid var(--ns-border)",
          }}
        >
          <Button
            variant="outline"
            className="shrink-0 grow-0 basis-20 justify-center"
            onClick={requestClose}
          >
            取消
          </Button>
          <Button
            className="flex-1 justify-center"
            style={{ background: meta.color, borderColor: meta.color, color: "#fff" }}
            onClick={type === "transfer" ? onSubmitTransfer : onSubmitLedger}
            disabled={
              (splitMode && Boolean(splitError)) ||
              (type === "ar" &&
                isInvoiceEntry &&
                !editing &&
                (!counterparty.trim() ||
                  !invoiceNumber.trim() ||
                  !validateInvoiceNumber(invoiceNumber.trim(), invoiceNumberPreset)))
            }
          >
            <Check size={14} weight="bold" />
            {editing
              ? "儲存變更"
              : type === "ar" && isInvoiceEntry
                ? "開立發票"
                : type === "ar"
                  ? "記錄應收"
                  : type === "ap"
                    ? "記錄應付"
                    : type === "transfer"
                      ? "建立轉帳"
                      : "儲存交易"}
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: subcategories.length ? 10 : 0,
        }}
      >
        {categories.map((c) => {
          const active = category === c.name;
          const color = c.color || "var(--ns-accent)";
          return (
            <button
              key={c.name}
              className="text-xs"
              onClick={() => onPick(c.name)}
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                cursor: "pointer",
                background: active ? color : "var(--ns-bg-card)",
                // Contrast-aware text so light category colors don't swallow
                // the label; faint border gives light chips edge definition (B14).
                color: active ? readableTextColor(color) : "var(--ns-fg)",
                border: active ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--ns-border)",
                fontFamily: "inherit",
                transition:
                  "background 120ms var(--ns-ease), color 120ms var(--ns-ease), border-color 120ms var(--ns-ease)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {c.iconName && <Glyph name={c.iconName} size={14} />}
              {c.name}
            </button>
          );
        })}
        {categories.length === 0 ? (
          <span className="muted text-xs">尚未建立分類，可於設定新增。</span>
        ) : null}
        {trailing}
      </div>
      {subcategories.length ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            paddingLeft: 10,
            borderLeft: "2px solid var(--ns-border)",
          }}
        >
          {subcategories.map((s) => {
            const active = subcategory === s;
            return (
              <button
                key={s}
                className="text-xs"
                onClick={() => onPickSub(s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  cursor: "pointer",
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

function DrawerField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
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
      const legs = allRows.filter(
        (r) => r.groupId === row.groupId && r.entryType === "transfer" && r.deletedAt === null,
      );
      const source = legs.find((l) => l.amount < 0) ?? row;
      const dest = legs.find((l) => l.id !== source.id) ?? row;
      out.push({ ...source, transferPair: { source, dest } });
    } else if (row.groupId && (row.legKind === "category" || row.legKind === "share")) {
      if (seen.has(row.groupId)) continue;
      seen.add(row.groupId);
      // Same lookup-from-full-ledger rule as transfers: a category/search
      // filter that matched only one leg still shows the complete split.
      // Includes 分帳 share legs (plan 222) — the collapsed total then equals
      // the FULL bank posting (matches what actually left the account); RAW
      // rows (not this display row) still feed spend aggregations, unaffected.
      const legs = allRows.filter(
        (r) =>
          r.groupId === row.groupId &&
          (r.legKind === "category" || r.legKind === "share") &&
          r.deletedAt === null,
      );
      // A share leg's `name`/`category` carry the counterparty/blank-category
      // (see domain/splitLegs buildSplitLegs), never representative of the
      // group — prefer the first category leg for the display row's identity.
      const first = legs.find((r) => r.legKind === "category") ?? legs[0] ?? row;
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
function buildCashflowBuckets(
  granularity: ChartGranularity,
  range: { start: string | null; end: string | null },
): Array<{ key: string; label: string }> {
  const start = range.start ?? isoLocal(new Date());
  const end = range.end ?? start;
  if (granularity === "day") {
    return enumerateDays(start, end).map((day) => ({ key: day, label: day.slice(5) }));
  }
  if (granularity === "month") {
    return enumerateMonths(start, end).map((month) => ({
      key: month,
      label: `${Number(month.slice(5, 7))}月`,
    }));
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
        <Sparkle size={14} weight="fill" style={{ color: "var(--ns-accent)" }} />
        依過往紀錄建議
      </span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="text-xs"
          onClick={() => onPick(chip.key)}
          style={{
            padding: "4px 11px",
            borderRadius: 999,
            cursor: "pointer",
            background: "var(--ns-accent-soft)",
            color: "var(--ns-accent)",
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

const CURRENCY_SYMBOLS: Record<string, string> = {
  TWD: "NT$",
  USD: "$",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  HKD: "HK$",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
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
  /* eslint-disable no-restricted-syntax */
  return Number.isInteger(n)
    ? n.toLocaleString("zh-TW")
    : n.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
  /* eslint-enable no-restricted-syntax */
}

function uniqueClean(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  const name = color.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color;
}
