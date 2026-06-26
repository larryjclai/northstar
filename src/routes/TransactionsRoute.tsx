import { ArrowsDownUp, Bank, CopySimple, FunnelSimple, MagnifyingGlass, PencilSimple, PlusCircle, Trash, UploadSimple, ListPlus } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card as CossCard } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { DateScopeControl } from "../components/DateScopeControl";
import { AssetLogo } from "../components/AssetLogo";
import { Badge } from "../components/coss/badge";
import { ReactNode, useMemo, useState, useEffect } from "react";
import { ActionButton } from "../components/ActionButton";
import { EmptyState } from "../components/EmptyState";
import { StatusText } from "../components/StatusText";
import { FilterPill } from "../components/FilterPill";
import { SegmentedControl } from "../components/SegmentedControl";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { downloadCsv, exportInvestmentCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { InvestmentActivityImportDraft } from "../data/repositories";
import { InvestmentImportWizard, type InvestmentActivityImportPlan } from "./InvestmentImportWizard";
import { createFxConverter, formatMoney, formatNumber, formatPrice, formatQuantity, isWithinDateScope, makeDefaultDateScope, resolveDateScope } from "../domain";
import type { InvestmentAction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { InvestmentEntryDrawer, type TransactionPreset } from "./InvestmentsAddSheet";
import { isImportOpeningLot, txTypeLabel } from "./transactionsTxLabel";

const actionLabels: Record<InvestmentAction, string> = {
  buy: "買進",
  sell: "賣出",
  cashDividend: "現金股利",
  stockDividend: "股票股利",
  capitalReduction: "減資",
  stockSplit: "股票分割",
};

// "deposit" is not an InvestmentAction — it represents a cash transfer into a
// brokerage account (存錢進券商), surfaced here alongside trades so the page
// shows the full money trail. Its label lives outside actionLabels.
const DEPOSIT = "deposit";
const WITHDRAW = "withdraw";
const depositLabel = "入金";
const withdrawLabel = "出金";
const allActionLabels: Record<string, string> = { ...actionLabels, [DEPOSIT]: depositLabel, [WITHDRAW]: withdrawLabel };

type TxKind = "investment" | "cash";

// Paginate the flat transaction list first (pageSize rows/page), then group the
// current page's rows by month for the sub-headers — mirroring the ledger
// (CashFlowRoute), which paginates flat rows then groups within the page. This
// keeps the page size a count of transactions, not of month-groups.
function paginateAndGroupByMonth<T extends { date: string }>(
  rows: T[],
  page: number,
  pageSize: number,
): { groups: Array<{ date: string; rows: T[] }>; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const groups: Array<{ date: string; rows: T[] }> = [];
  let currentMonth = "";
  for (const row of pageRows) {
    const monthKey = row.date.slice(0, 7);
    if (monthKey !== currentMonth) {
      groups.push({ date: monthKey, rows: [row] });
      currentMonth = monthKey;
    } else {
      groups[groups.length - 1].rows.push(row);
    }
  }
  return { groups, totalPages };
}

interface UnifiedTx {
  id: string;
  kind: TxKind;
  date: string;
  createdAt: string;
  actionKey: string; // InvestmentAction | "deposit" | "withdraw"
  ticker: string;
  name: string;
  assetType: string | null;
  recordId: string | null; // investment record id for edit/delete; null for deposits
  quantity: number;
  price: number;
  fee: number;
  signed: number; // signed cash flow: + inflow, − outflow (for tone + amount)
  currency: string;
  brokerId: string | null;
  brokerName: string;
  note: string;
  // A manually-imported holding's opening lot is a cashless import baseline,
  // not a real buy. Surface it as 「匯入」 with a neutral total (no cash leg).
  isOpeningLot: boolean;
}

export function TransactionsRoute() {
  const { accounts, assets, investments, ledger, settings, dailyFxRates, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const { primaryCurrency, toPrimary } = createFxConverter(settings.data, dailyFxRates.data ?? []);
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [duplicatingRecordId, setDuplicatingRecordId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [brokerFilter, setBrokerFilter] = useState<Set<string>>(new Set());
  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "all"));
  const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);

  const deleteRecord = useRepositoryMutation((repository, id: string) => repository.deleteInvestmentRecord(id), ["investments", "assets", "accounts", "ledger"]);
  const importRecords = useRepositoryMutation((repository, input: InvestmentActivityImportDraft) => repository.importInvestmentActivity(input), ["investments", "assets", "accounts", "ledger"]);

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const assetFor = (id: string) => assetRows.find((asset) => asset.id === id);
  const investmentAccounts = useMemo(() => accountRows.filter((a) => a.type === "investment"), [accountRows]);
  const investmentAccountIds = useMemo(() => new Set(investmentAccounts.map((a) => a.id)), [investmentAccounts]);

  // Unified rows: each investment record, plus cash transfers into/out of a
  // brokerage account. Transfers that belong to a
  // trade carry linkedInvestmentRecordId and are already represented by the
  // record itself, so they're excluded to avoid double counting.
  const allTx = useMemo<UnifiedTx[]>(() => {
    const investmentTx: UnifiedTx[] = recordRows.map((record) => {
      const asset = assetFor(record.assetId);
      const account = record.linkedAccountId ? accountMap.get(record.linkedAccountId) : null;
      const openingLot = isImportOpeningLot(record);
      const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
      // The opening lot has no cash leg, so its total is neutral (shown as 「—」).
      const signed = openingLot ? 0 : record.action === "buy" ? -gross : gross;
      return {
        id: record.id,
        kind: "investment",
        date: record.date,
        createdAt: record.createdAt,
        actionKey: record.action,
        ticker: asset?.ticker ?? record.assetId,
        name: asset?.name || "未命名資產",
        assetType: asset?.assetType ?? null,
        recordId: record.id,
        quantity: record.quantity,
        price: record.price,
        fee: record.fee,
        signed,
        currency: asset?.currency ?? account?.currency ?? "TWD",
        brokerId: record.linkedAccountId,
        brokerName: account?.name ?? "未指定",
        note: record.note,
        isOpeningLot: openingLot,
      };
    });

    const cashTx: UnifiedTx[] = ledgerRows
      .filter((row) => row.entryType === "transfer" && row.amount !== 0 && investmentAccountIds.has(row.accountId) && !row.linkedInvestmentRecordId)
      .map((row) => {
        const account = accountMap.get(row.accountId);
        const isDeposit = row.amount >= 0;
        return {
          id: row.id,
          kind: "cash",
          date: row.date,
          createdAt: row.createdAt,
          actionKey: isDeposit ? DEPOSIT : WITHDRAW,
          ticker: "—",
          name: row.name || row.note || (isDeposit ? "資金轉入" : "資金轉出"),
          assetType: "cash",
          recordId: null,
          quantity: 0,
          price: 0,
          fee: 0,
          signed: row.amount,
          currency: row.currency,
          brokerId: row.accountId,
          brokerName: account?.name ?? "未指定",
          note: row.note,
          isOpeningLot: false,
        };
      });

    return [...investmentTx, ...cashTx];
  }, [accountMap, assetRows, recordRows, ledgerRows, investmentAccountIds]);

  const filteredTx = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return allTx
      .filter((tx) => {
        if (typeFilter.size > 0 && !typeFilter.has(tx.actionKey)) return false;
        if (!isWithinDateScope(tx.date, dateRange)) return false;
        if (assetTypeFilter !== "all" && tx.assetType !== assetTypeFilter) return false;
        if (brokerFilter.size > 0 && !brokerFilter.has(tx.brokerId ?? "none")) return false;
        if (!query) return true;
        return [tx.ticker, tx.name, tx.brokerName, tx.note, allActionLabels[tx.actionKey]]
          .some((value) => value?.toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`));
  }, [allTx, searchQuery, dateRange, assetTypeFilter, typeFilter, brokerFilter]);

  const periodRecordRows = useMemo(() => recordRows.filter((record) => isWithinDateScope(record.date, dateRange)), [recordRows, dateRange]);

  const editingPreset = useMemo<TransactionPreset | undefined>(() => {
    const recordId = editingRecordId ?? duplicatingRecordId;
    if (!recordId) return undefined;
    const record = recordRows.find((row) => row.id === recordId);
    if (!record) return undefined;
    const asset = assetFor(record.assetId);
    return {
      id: editingRecordId ? record.id : undefined,
      draft: {
        ticker: asset?.ticker ?? "",
        name: asset?.name ?? "",
        currency: asset?.currency ?? "TWD",
        linkedAccountId: record.linkedAccountId,
        date: record.date,
        action: record.action,
        price: record.price,
        quantity: record.quantity,
        fee: record.fee,
        note: record.note,
        assetType: asset?.assetType ?? null,
        sector: asset?.sector ?? null,
        industry: asset?.industry ?? null,
      },
    };
  }, [assetRows, duplicatingRecordId, editingRecordId, recordRows]);

  // Summary cards aggregate across currencies, so each record is converted to
  // the primary currency at its trade date before summing (USD buys no longer
  // get added to TWD buys at face value).
  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    let dividends = 0;
    for (const record of periodRecordRows) {
      const currency = assetFor(record.assetId)?.currency ?? "TWD";
      if (record.action === "buy") {
        bought += toPrimary(record.price * record.quantity, currency, record.date);
      } else if (record.action === "sell") {
        sold += toPrimary(record.price * record.quantity, currency, record.date);
      } else if (record.action === "cashDividend") {
        dividends += toPrimary(record.price, currency, record.date);
      }
    }
    return { bought, sold, dividends };
  }, [periodRecordRows, assetRows, toPrimary]);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [searchQuery, dateRange, assetTypeFilter, typeFilter, brokerFilter]);

  const { groups: paginatedGroups, totalPages } = useMemo(
    () => paginateAndGroupByMonth(filteredTx, page, pageSize),
    [filteredTx, page],
  );
  const hasActiveFilters = typeFilter.size > 0 || brokerFilter.size > 0 || assetTypeFilter !== "all" || Boolean(searchQuery) || dateScope.preset !== "all";

  // Filter dropdown options. Broker list includes an "unspecified" bucket when
  // any row lacks a broker so those rows remain reachable.
  const brokerOptions = useMemo(() => {
    const opts = investmentAccounts.map((a) => ({ value: a.id, label: a.name }));
    if (allTx.some((tx) => !tx.brokerId)) opts.push({ value: "none", label: "未指定" });
    return opts;
  }, [investmentAccounts, allTx]);

  function openCreate() {
    setEditingRecordId(null);
    setDuplicatingRecordId(null);
    setMessage("");
    setDrawerOpen(true);
  }

  function openEdit(recordId: string) {
    setEditingRecordId(recordId);
    setDuplicatingRecordId(null);
    setMessage("");
    setDrawerOpen(true);
  }

  function openDuplicate(recordId: string) {
    setEditingRecordId(null);
    setDuplicatingRecordId(recordId);
    setMessage("");
    setDrawerOpen(true);
  }

  function clearFilters() {
    setTypeFilter(new Set());
    setBrokerFilter(new Set());
    setAssetTypeFilter("all");
    setSearchQuery("");
    setDateScope(makeDefaultDateScope(timezone, "all"));
  }

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
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
    <div className="mt-4 ns-investment-transactions">
      <div className="ns-invest-summary">
        <SummaryCard label="交易筆數" value={`${periodRecordRows.length} 筆`} sublabel={dateRange.label} />
        <SummaryCard label="總買入" value={formatMoney(totals.bought, primaryCurrency)} sublabel="期間買入金額" />
        <SummaryCard label="總賣出" value={formatMoney(totals.sold, primaryCurrency)} sublabel="期間賣出金額" />
        <SummaryCard label="總股利" value={formatMoney(totals.dividends, primaryCurrency)} sublabel="現金股利" />
      </div>

      {message ? <div className="mb-4"><StatusText>{message}</StatusText></div> : null}

      <CossCard className="ns-invest-panel">
        <div className="flex flex-wrap items-center gap-2 p-3 bg-[var(--ns-surface)] border-b border-[var(--ns-border)] rounded-t-[var(--ns-r-md)]">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--ns-bg-hover)] border border-[var(--ns-border)] focus-within:border-[var(--ns-accent)] focus-within:ring-1 focus-within:ring-[var(--ns-accent)] transition-all">
            <MagnifyingGlass size={14} className="text-[var(--ns-fg-muted)]" />
            <input 
              className="bg-transparent border-none outline-none text-sm w-48 placeholder:text-[var(--ns-fg-muted)] text-[var(--ns-fg)]" 
              value={searchQuery} 
              onChange={(event) => setSearchQuery(event.target.value)} 
              placeholder="Search ..." 
            />
          </label>
          
          <FilterPill
            label="資產類別"
            selected={assetTypeFilter === "all" ? new Set() : new Set([assetTypeFilter])}
            onChange={(next) => setAssetTypeFilter(next.size === 0 ? "all" : [...next][0])}
            options={[
              { value: "equity", label: "股票" },
              { value: "etf", label: "ETF" },
              { value: "crypto", label: "加密貨幣" },
              { value: "cash", label: "現金" },
            ]}
          />
          
          <FilterPill
            label="交易類型"
            selected={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "buy", label: "買進" },
              { value: "sell", label: "賣出" },
              { value: "cashDividend", label: "股利" },
              { value: "stockSplit", label: "拆股" },
            ]}
          />

          <FilterPill
            label="券商"
            selected={brokerFilter}
            onChange={setBrokerFilter}
            options={brokerOptions}
          />

          <DateScopeControl
            value={dateScope}
            onChange={setDateScope}
            presets={["month", "ytd", "last12m", "all", "custom"]}
          />

          {hasActiveFilters && (
            <Button variant="ghost" size="xs" className="text-[var(--ns-neg)]" onClick={clearFilters}>
              Clear filters
            </Button>
          )}

          <div className="flex-1" />
          <div className="flex gap-2">
            <ActionButton variant="secondary" onClick={() => downloadCsv("northstar-investments.csv", exportInvestmentCsv(recordRows, assetFor))}>匯出 CSV</ActionButton>
            <Button variant="outline" onClick={() => setImportOpen(true)}><UploadSimple />匯入 CSV</Button>
          </div>
        </div>

        <InvestmentImportWizard
          open={importOpen}
          onClose={() => setImportOpen(false)}
          accounts={accountRows}
          onImport={(input: InvestmentActivityImportPlan) => importRecords.mutateAsync(input)}
        />

        {paginatedGroups.length === 0 ? (
          allTx.length === 0 ? (
            <EmptyState
              icon={<PlusCircle size={24} weight="duotone" />}
              title="還沒有投資交易"
              description="先新增一筆交易，或從券商 CSV 大量匯入交易紀錄。"
              action={<ActionButton onClick={openCreate}><PlusCircle size={16} />新增第一筆交易</ActionButton>}
              secondaryAction={<Button variant="outline" onClick={() => setImportOpen(true)}><UploadSimple size={16} />匯入 CSV</Button>}
            />
          ) : (
            <EmptyState
              icon={<FunnelSimple size={24} weight="duotone" />}
              title="沒有符合篩選的交易"
              description="試著放寬日期、交易種類或券商的篩選條件。"
              action={<ActionButton variant="secondary" onClick={clearFilters}>清除篩選</ActionButton>}
            />
          )
        ) : (
          <>
            <div className="ns-invest-months">
              {paginatedGroups.map((group) => (
                <InvestmentMonthGroup
                  key={group.date}
                  group={group}
                  onEdit={openEdit}
                  onDuplicate={openDuplicate}
                  onDelete={async (recordId) => {
                    try {
                      await deleteRecord.mutateAsync(recordId);
                      if (editingRecordId === recordId) setEditingRecordId(null);
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "刪除失敗。");
                    }
                  }}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, marginBottom: 24 }}>
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</Button>
                <span className="text-body" style={{ alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
                <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</Button>
              </div>
            )}
          </>
        )}
      </CossCard>

      <InvestmentEntryDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingRecordId(null);
          setDuplicatingRecordId(null);
        }}
        accounts={accountRows}
        portfolioAssets={assetRows}
        title={editingRecordId ? "編輯交易" : duplicatingRecordId ? "複製交易" : "新增交易"}
        initialMode="transaction"
        onSubmitted={() => {
          setEditingRecordId(null);
          setDuplicatingRecordId(null);
          setMessage("");
        }}
        transactionPreset={editingPreset}
      />
    </div>
  );
}



function InvestmentMonthGroup({
  group,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  group: { date: string; rows: UnifiedTx[] };
  onEdit: (recordId: string) => void;
  onDuplicate: (recordId: string) => void;
  onDelete: (recordId: string) => Promise<void>;
}) {
  return (
    <section className="ns-invest-month">
      <div className="ns-invest-month-head">
        <h3>{formatMonthLabel(group.date)}</h3>
        <span>{group.rows.length} 筆</span>
      </div>

      <div className="ns-invest-table-wrap">
        <table className="ns-invest-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>標的</th>
              <th>類型</th>
              <th className="text-right">股數</th>
              <th className="text-right">價格</th>
              <th className="text-right">手續費</th>
              <th className="text-right">總額</th>
              <th>帳戶</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((tx) => (
              <InvestmentTransactionRow key={tx.id} tx={tx} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="ns-invest-mobile-list">
        {group.rows.map((tx) => (
          <InvestmentTransactionMobile key={tx.id} tx={tx} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function InvestmentTransactionRow({
  tx,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  tx: UnifiedTx;
  onEdit: (recordId: string) => void;
  onDuplicate: (recordId: string) => void;
  onDelete: (recordId: string) => Promise<void>;
}) {
  const isCash = tx.kind === "cash";
  return (
    <tr>
      <td className="mono muted">{tx.date.slice(5, 10)}</td>
      <td>
        <div className="ns-invest-asset-cell">
          {isCash ? (
            <span className="ns-invest-cash-logo"><Bank size={16} weight="duotone" /></span>
          ) : (
            <AssetLogo ticker={tx.ticker} name={tx.name} size={30} />
          )}
          <span className="min-w-0">
            <strong>{isCash ? "現金" : tx.ticker}</strong>
            <span>{tx.name}</span>
          </span>
        </div>
      </td>
      <td>
        <Badge variant={actionBadgeVariant(tx.actionKey)} className="rounded-full uppercase">{txTypeLabel(tx)}</Badge>
      </td>
      <td className="num text-right">{isCash ? "—" : formatQuantity(tx.quantity)}</td>
      <td className="num text-right">{isCash ? "—" : formatPrice(tx.price)}</td>
      <td className="num text-right muted">{tx.fee ? formatNumber(tx.fee) : "—"}</td>
      {tx.isOpeningLot ? (
        <td className="num text-right muted">—</td>
      ) : (
        <td className={`num text-right ${tx.signed >= 0 ? "pos" : "neg"}`}>
          {tx.signed >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.signed), tx.currency)}
        </td>
      )}
      <td className="muted">{tx.brokerName}</td>
      <td className="text-right">
        {tx.recordId ? (
          <div className="ns-invest-row-actions">
            <Button variant="ghost" size="icon-xs" aria-label="編輯交易" onClick={() => onEdit(tx.recordId!)}><PencilSimple size={13} /></Button>
            <Button variant="ghost" size="icon-xs" aria-label="複製交易" onClick={() => onDuplicate(tx.recordId!)}><CopySimple size={13} /></Button>
            <Button variant="ghost" size="icon-xs" aria-label="刪除交易" onClick={() => void onDelete(tx.recordId!)}><Trash size={13} /></Button>
          </div>
        ) : (
          <span className="muted text-xs">記帳</span>
        )}
      </td>
    </tr>
  );
}

function InvestmentTransactionMobile({
  tx,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  tx: UnifiedTx;
  onEdit: (recordId: string) => void;
  onDuplicate: (recordId: string) => void;
  onDelete: (recordId: string) => Promise<void>;
}) {
  const isCash = tx.kind === "cash";
  return (
    <div className="ns-invest-mobile-row">
      {isCash ? (
        <span className="ns-invest-cash-logo"><Bank size={16} weight="duotone" /></span>
      ) : (
        <AssetLogo ticker={tx.ticker} name={tx.name} size={34} />
      )}
      <div className="min-w-0 flex-1">
        <div className="ns-invest-mobile-title">
          <strong>{isCash ? tx.name : tx.ticker}</strong>
          <Badge variant={actionBadgeVariant(tx.actionKey)} className="rounded-full uppercase">{txTypeLabel(tx)}</Badge>
        </div>
        <div className="muted text-xs tabular">
          {isCash ? tx.date.slice(5, 10) : `${tx.date.slice(5, 10)} · ${formatQuantity(tx.quantity)} @ ${formatPrice(tx.price)}`}
        </div>
      </div>
      <div className="ns-invest-mobile-amount">
        {tx.isOpeningLot ? (
          <strong className="muted">—</strong>
        ) : (
          <strong className={tx.signed >= 0 ? "pos" : "neg"}>
            {tx.signed >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.signed), tx.currency)}
          </strong>
        )}
        <span>{tx.brokerName}</span>
      </div>
      {tx.recordId ? (
        <div className="ns-invest-mobile-actions">
          <Button variant="ghost" size="icon-xs" aria-label="編輯交易" onClick={() => onEdit(tx.recordId!)}><PencilSimple size={13} /></Button>
          <Button variant="ghost" size="icon-xs" aria-label="複製交易" onClick={() => onDuplicate(tx.recordId!)}><CopySimple size={13} /></Button>
          <Button variant="ghost" size="icon-xs" aria-label="刪除交易" onClick={() => void onDelete(tx.recordId!)}><Trash size={13} /></Button>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <CossCard className="p-4 sm:p-5">
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="num text-stat" style={{ fontWeight: 500 }}>{value}</div>
        {sublabel && <div className="num text-body" style={{ color: 'var(--ns-muted)' }}>{sublabel}</div>}
      </div>
    </CossCard>
  );
}

function formatMonthLabel(month: string) {
  const date = new Date(`${month}-01T00:00:00`);
  return `${date.toLocaleString("en-US", { month: "long" }).toUpperCase()} ${date.getFullYear()}`;
}

function actionBadgeVariant(action: string): "success" | "error" | "warning" | "info" | "secondary" | "outline" {
  if (action === "buy") return "success";
  if (action === "sell") return "error";
  if (action === "cashDividend" || action === "stockDividend") return "warning";
  if (action === DEPOSIT || action === WITHDRAW) return "info";
  return "secondary";
}
