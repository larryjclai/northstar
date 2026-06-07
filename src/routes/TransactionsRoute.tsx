import { ArrowsDownUp, Bank, FunnelSimple, MagnifyingGlass, PencilSimple, PlusCircle, Trash, UploadSimple } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card as CossCard } from "../components/coss/card";
import { AssetLogo } from "../components/AssetLogo";
import { Badge } from "../components/coss/badge";
import { ReactNode, useMemo, useState, useEffect } from "react";
import { ActionButton } from "../components/ActionButton";
import { EmptyState } from "../components/EmptyState";
import { StatusText } from "../components/StatusText";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { downloadCsv, exportInvestmentCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft } from "../data/repositories";
import { InvestmentImportWizard } from "./InvestmentImportWizard";
import { createFxConverter, formatMoney, formatNumber, todayInTimezone } from "../domain";
import type { InvestmentAction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { InvestmentEntryDrawer, type TransactionPreset } from "./InvestmentsAddSheet";

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
const depositLabel = "入金";
const allActionLabels: Record<string, string> = { ...actionLabels, [DEPOSIT]: depositLabel };
const actionShortLabels: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  cashDividend: "DIV",
  stockDividend: "STK",
  capitalReduction: "CAP",
  stockSplit: "SPLIT",
  [DEPOSIT]: "DEP",
};

type TxKind = "investment" | "deposit";

interface UnifiedTx {
  id: string;
  kind: TxKind;
  date: string;
  createdAt: string;
  actionKey: string; // InvestmentAction | "deposit"
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
}

export function TransactionsRoute() {
  const { accounts, assets, investments, ledger, settings, dailyFxRates } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const { primaryCurrency, toPrimary } = createFxConverter(settings.data, dailyFxRates.data ?? []);
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [brokerFilter, setBrokerFilter] = useState<Set<string>>(new Set());

  const deleteRecord = useRepositoryMutation((repository, id: string) => repository.deleteInvestmentRecord(id), ["investments", "assets", "accounts", "ledger"]);
  const importRecords = useRepositoryMutation((repository, input: InvestmentDraft[]) => repository.importInvestmentRecords(input), ["investments", "assets", "accounts", "ledger"]);

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const assetFor = (id: string) => assetRows.find((asset) => asset.id === id);
  const investmentAccounts = useMemo(() => accountRows.filter((a) => a.type === "investment"), [accountRows]);
  const investmentAccountIds = useMemo(() => new Set(investmentAccounts.map((a) => a.id)), [investmentAccounts]);

  // Unified rows: each investment record, plus each cash transfer INTO a
  // brokerage account (the inflow side, amount > 0). Transfers that belong to a
  // trade carry linkedInvestmentRecordId and are already represented by the
  // record itself, so they're excluded to avoid double counting.
  const allTx = useMemo<UnifiedTx[]>(() => {
    const investmentTx: UnifiedTx[] = recordRows.map((record) => {
      const asset = assetFor(record.assetId);
      const account = record.linkedAccountId ? accountMap.get(record.linkedAccountId) : null;
      const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
      const signed = record.action === "buy" ? -gross : gross;
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
      };
    });

    const depositTx: UnifiedTx[] = ledgerRows
      .filter((row) => row.entryType === "transfer" && row.amount > 0 && investmentAccountIds.has(row.accountId) && !row.linkedInvestmentRecordId)
      .map((row) => {
        const account = accountMap.get(row.accountId);
        return {
          id: row.id,
          kind: "deposit",
          date: row.date,
          createdAt: row.createdAt,
          actionKey: DEPOSIT,
          ticker: "—",
          name: row.name || row.note || "資金轉入",
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
        };
      });

    return [...investmentTx, ...depositTx];
  }, [accountMap, assetRows, recordRows, ledgerRows, investmentAccountIds]);

  const filteredTx = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return allTx
      .filter((tx) => {
        if (typeFilter.size > 0 && !typeFilter.has(tx.actionKey)) return false;
        if (assetTypeFilter !== "all" && tx.assetType !== assetTypeFilter) return false;
        if (brokerFilter.size > 0 && !brokerFilter.has(tx.brokerId ?? "none")) return false;
        if (!query) return true;
        return [tx.ticker, tx.name, tx.brokerName, tx.note, allActionLabels[tx.actionKey]]
          .some((value) => value?.toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`));
  }, [allTx, searchQuery, assetTypeFilter, typeFilter, brokerFilter]);

  const groupedTx = useMemo(() => {
    const groups: Array<{ date: string; rows: UnifiedTx[] }> = [];
    let currentDate = "";
    for (const row of filteredTx) {
      const monthKey = row.date.slice(0, 7);
      if (monthKey !== currentDate) {
        groups.push({ date: monthKey, rows: [row] });
        currentDate = monthKey;
      } else {
        groups[groups.length - 1].rows.push(row);
      }
    }
    return groups;
  }, [filteredTx]);

  const editingPreset = useMemo<TransactionPreset | undefined>(() => {
    if (!editingRecordId) return undefined;
    const record = recordRows.find((row) => row.id === editingRecordId);
    if (!record) return undefined;
    const asset = assetFor(record.assetId);
    return {
      id: record.id,
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
  }, [assetRows, editingRecordId, recordRows]);

  // Summary cards aggregate across currencies, so each record is converted to
  // the primary currency at its trade date before summing (USD buys no longer
  // get added to TWD buys at face value).
  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    let dividends = 0;
    for (const record of recordRows) {
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
  }, [recordRows, assetRows, toPrimary]);

  const monthKey = todayInTimezone(timezone).slice(0, 7);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [monthKey, searchQuery, assetTypeFilter, typeFilter, brokerFilter]);

  const paginatedGroups = useMemo(() => groupedTx.slice((page - 1) * pageSize, page * pageSize), [groupedTx, page]);
  const totalPages = Math.ceil(groupedTx.length / pageSize);

  // Filter dropdown options. Broker list includes an "unspecified" bucket when
  // any row lacks a broker so those rows remain reachable.
  const brokerOptions = useMemo(() => {
    const opts = investmentAccounts.map((a) => ({ value: a.id, label: a.name }));
    if (allTx.some((tx) => !tx.brokerId)) opts.push({ value: "none", label: "未指定" });
    return opts;
  }, [investmentAccounts, allTx]);

  function openCreate() {
    setEditingRecordId(null);
    setMessage("");
    setDrawerOpen(true);
  }

  function openEdit(recordId: string) {
    setEditingRecordId(recordId);
    setMessage("");
    setDrawerOpen(true);
  }

  return (
    <div className="mt-4 ns-investment-transactions">
      <div className="ns-invest-summary">
        <SummaryCard label="Records" value={`${recordRows.length} txns`} sublabel="總筆數" />
        <SummaryCard label="Total Bought" value={formatMoney(totals.bought, primaryCurrency)} sublabel="總買入" />
        <SummaryCard label="Total Sold" value={formatMoney(totals.sold, primaryCurrency)} sublabel="總賣出" />
        <SummaryCard label="Dividends" value={formatMoney(totals.dividends, primaryCurrency)} sublabel="總股利" />
      </div>

      {message ? <div className="mb-4"><StatusText>{message}</StatusText></div> : null}

      <CossCard className="ns-invest-panel">
        <div className="ns-invest-toolbar">
          <div className="ns-invest-segments" aria-label="資產類型">
            {[
              ["all", "All"],
              ["equity", "Stocks"],
              ["etf", "ETF"],
              ["crypto", "Crypto"],
              ["cash", "Cash"],
            ].map(([value, label]) => (
              <button key={value} type="button" data-active={assetTypeFilter === value || undefined} onClick={() => setAssetTypeFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="ns-invest-segments" aria-label="交易種類">
            {[
              ["all", "All types"],
              ["buy", "Buy"],
              ["sell", "Sell"],
              ["cashDividend", "Dividend"],
              ["stockSplit", "Split"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                data-active={(value === "all" ? typeFilter.size === 0 : typeFilter.has(value)) || undefined}
                onClick={() => setTypeFilter(value === "all" ? new Set() : new Set([value]))}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="ns-invest-search">
            <MagnifyingGlass size={15} />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search ticker..." />
          </label>
          <MultiSelectFilter
            icon={<Bank size={14} />}
            label="券商"
            options={brokerOptions}
            selected={brokerFilter}
            onChange={setBrokerFilter}
          />
          <div className="ns-invest-actions">
            <ActionButton variant="secondary" onClick={() => downloadCsv("northstar-investments.csv", exportInvestmentCsv(recordRows, assetFor))}>匯出 CSV</ActionButton>
            <Button variant="outline" onClick={() => setImportOpen(true)}><UploadSimple />匯入 CSV</Button>
          </div>
        </div>

        <InvestmentImportWizard
          open={importOpen}
          onClose={() => setImportOpen(false)}
          accounts={accountRows}
          onImport={(input) => importRecords.mutateAsync(input)}
        />

        {(typeFilter.size > 0 || brokerFilter.size > 0 || assetTypeFilter !== "all" || searchQuery) ? (
          <div className="ns-invest-clear">
            <Button variant="ghost" size="xs" onClick={() => { setTypeFilter(new Set()); setBrokerFilter(new Set()); setAssetTypeFilter("all"); setSearchQuery(""); }}>清除篩選</Button>
          </div>
        ) : null}

        {paginatedGroups.length === 0 ? (
          allTx.length === 0 ? (
            <EmptyState
              icon={<PlusCircle size={24} weight="duotone" />}
              title="還沒有投資交易"
              description="先新增一筆交易，或直接從投資頁建立目前持倉。"
              action={<ActionButton onClick={openCreate}><PlusCircle size={16} />新增第一筆交易</ActionButton>}
            />
          ) : (
            <EmptyState
              icon={<FunnelSimple size={24} weight="duotone" />}
              title="沒有符合篩選的交易"
              description="試著放寬交易種類或券商的篩選條件。"
              action={<ActionButton variant="secondary" onClick={() => { setTypeFilter(new Set()); setBrokerFilter(new Set()); setAssetTypeFilter("all"); setSearchQuery(""); }}>清除篩選</ActionButton>}
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
                <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
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
        }}
        accounts={accountRows}
        portfolioAssets={assetRows}
        title={editingPreset ? "編輯交易" : "新增交易"}
        initialMode="transaction"
        onSubmitted={() => {
          setEditingRecordId(null);
          setMessage("");
        }}
        transactionPreset={editingPreset}
      />
    </div>
  );
}

function MultiSelectFilter({
  icon,
  label,
  options,
  selected,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }
  const count = selected.size;
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium"
        style={{ borderColor: count ? "var(--ns-accent)" : "var(--ns-border)", background: "var(--ns-surface-elevated)", color: count ? "var(--ns-accent)" : "var(--ns-fg)" }}
      >
        {icon}
        {label}
        {count ? <span className="rounded-full px-1.5 text-xs" style={{ background: "var(--ns-accent)", color: "var(--ns-accent-fg)" }}>{count}</span> : <ArrowsDownUp size={11} />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="mb-1 flex items-center justify-between px-1 text-xs" style={{ color: "var(--ns-muted)" }}>
          <span>{label}</span>
          {count ? <button className="hover:underline" onClick={() => onChange(new Set())}>清除</button> : <span>全部</span>}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {options.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              <input type="checkbox" checked={selected.has(opt.value)} onChange={() => toggle(opt.value)} />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InvestmentMonthGroup({
  group,
  onEdit,
  onDelete,
}: {
  group: { date: string; rows: UnifiedTx[] };
  onEdit: (recordId: string) => void;
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
              <th>Date</th>
              <th>Asset</th>
              <th>Type</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Price</th>
              <th className="text-right">Fee</th>
              <th className="text-right">Total</th>
              <th>Account</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((tx) => (
              <InvestmentTransactionRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="ns-invest-mobile-list">
        {group.rows.map((tx) => (
          <InvestmentTransactionMobile key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function InvestmentTransactionRow({
  tx,
  onEdit,
  onDelete,
}: {
  tx: UnifiedTx;
  onEdit: (recordId: string) => void;
  onDelete: (recordId: string) => Promise<void>;
}) {
  const isDeposit = tx.kind === "deposit";
  return (
    <tr>
      <td className="mono muted">{tx.date.slice(5, 10)}</td>
      <td>
        <div className="ns-invest-asset-cell">
          {isDeposit ? (
            <span className="ns-invest-cash-logo"><Bank size={16} weight="duotone" /></span>
          ) : (
            <AssetLogo ticker={tx.ticker} name={tx.name} size={30} />
          )}
          <span className="min-w-0">
            <strong>{isDeposit ? "Cash" : tx.ticker}</strong>
            <span>{tx.name}</span>
          </span>
        </div>
      </td>
      <td>
        <Badge variant={actionBadgeVariant(tx.actionKey)} className="rounded-full uppercase">{actionShortLabels[tx.actionKey] ?? tx.actionKey}</Badge>
      </td>
      <td className="num text-right">{isDeposit ? "—" : formatNumber(tx.quantity)}</td>
      <td className="num text-right">{isDeposit ? "—" : formatNumber(tx.price)}</td>
      <td className="num text-right muted">{tx.fee ? formatNumber(tx.fee) : "—"}</td>
      <td className={`num text-right ${tx.signed >= 0 ? "pos" : "neg"}`}>
        {tx.signed >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.signed), tx.currency)}
      </td>
      <td className="muted">{tx.brokerName}</td>
      <td className="text-right">
        {tx.recordId ? (
          <div className="ns-invest-row-actions">
            <Button variant="ghost" size="icon-xs" aria-label="編輯交易" onClick={() => onEdit(tx.recordId!)}><PencilSimple size={13} /></Button>
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
  onDelete,
}: {
  tx: UnifiedTx;
  onEdit: (recordId: string) => void;
  onDelete: (recordId: string) => Promise<void>;
}) {
  const isDeposit = tx.kind === "deposit";
  return (
    <div className="ns-invest-mobile-row">
      {isDeposit ? (
        <span className="ns-invest-cash-logo"><Bank size={16} weight="duotone" /></span>
      ) : (
        <AssetLogo ticker={tx.ticker} name={tx.name} size={34} />
      )}
      <div className="min-w-0 flex-1">
        <div className="ns-invest-mobile-title">
          <strong>{isDeposit ? tx.name : tx.ticker}</strong>
          <Badge variant={actionBadgeVariant(tx.actionKey)} className="rounded-full uppercase">{actionShortLabels[tx.actionKey] ?? tx.actionKey}</Badge>
        </div>
        <div className="muted text-xs tabular">
          {isDeposit ? tx.date.slice(5, 10) : `${tx.date.slice(5, 10)} · ${formatNumber(tx.quantity)} @ ${formatNumber(tx.price)}`}
        </div>
      </div>
      <div className="ns-invest-mobile-amount">
        <strong className={tx.signed >= 0 ? "pos" : "neg"}>
          {tx.signed >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.signed), tx.currency)}
        </strong>
        <span>{tx.brokerName}</span>
      </div>
      {tx.recordId ? (
        <div className="ns-invest-mobile-actions">
          <Button variant="ghost" size="icon-xs" aria-label="編輯交易" onClick={() => onEdit(tx.recordId!)}><PencilSimple size={13} /></Button>
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
        <div className="num" style={{ fontSize: 22, fontWeight: 500 }}>{value}</div>
        {sublabel && <div className="num" style={{ fontSize: 13, color: 'var(--ns-muted)' }}>{sublabel}</div>}
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
  if (action === DEPOSIT) return "info";
  return "secondary";
}
