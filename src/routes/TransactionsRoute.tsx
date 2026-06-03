import { ArrowsDownUp, Bank, ChartLineUp, FunnelSimple, MagnifyingGlass, PencilSimple, PlusCircle, Trash, UploadSimple } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card as CossCard } from "../components/coss/card";
import { ChangeEvent, ReactNode, useMemo, useState, useEffect } from "react";
import { ActionButton } from "../components/ActionButton";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { StatusText } from "../components/StatusText";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { downloadCsv, exportInvestmentCsv, parseInvestmentCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft } from "../data/repositories";
import { formatNumber, todayInTimezone } from "../domain";
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

type TxKind = "investment" | "deposit";

interface UnifiedTx {
  id: string;
  kind: TxKind;
  date: string;
  createdAt: string;
  actionKey: string; // InvestmentAction | "deposit"
  ticker: string;
  name: string;
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
  const { accounts, assets, investments, ledger } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const [preview, setPreview] = useState<ImportPreview<InvestmentDraft> | null>(null);
  const [message, setMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
        if (brokerFilter.size > 0 && !brokerFilter.has(tx.brokerId ?? "none")) return false;
        if (!query) return true;
        return [tx.ticker, tx.name, tx.brokerName, tx.note, allActionLabels[tx.actionKey]]
          .some((value) => value?.toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`));
  }, [allTx, searchQuery, typeFilter, brokerFilter]);

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

  const monthKey = todayInTimezone(timezone).slice(0, 7);

  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [monthKey, searchQuery, typeFilter, brokerFilter]);

  const paginatedGroups = useMemo(() => groupedTx.slice((page - 1) * pageSize, page * pageSize), [groupedTx, page]);
  const totalPages = Math.ceil(groupedTx.length / pageSize);

  // Filter dropdown options. Broker list includes an "unspecified" bucket when
  // any row lacks a broker so those rows remain reachable.
  const typeOptions = useMemo(() => Object.entries(allActionLabels).map(([value, label]) => ({ value, label })), []);
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

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseInvestmentCsv(await file.text()));
    event.target.value = "";
  }

  return (
    <div className="mt-4">
      {/* Add lives in the page header ("Buy / Sell"); no duplicate here. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <SummaryCard label="Records (All time)" value={`${recordRows.length}`} sublabel="總筆數" />
        <SummaryCard label="Total Bought (All time)" value={formatNumber(recordRows.filter(r => r.action === "buy").reduce((s, r) => s + r.price * r.quantity, 0))} sublabel="總買入金額" />
        <SummaryCard label="Total Sold (All time)" value={formatNumber(recordRows.filter(r => r.action === "sell").reduce((s, r) => s + r.price * r.quantity, 0))} sublabel="總賣出金額" />
        <SummaryCard label="Dividends (All time)" value={formatNumber(recordRows.filter(r => r.action === "cashDividend").reduce((s, r) => s + r.price, 0))} sublabel="總股利" />
      </div>

      {message ? <div className="mb-4"><StatusText>{message}</StatusText></div> : null}

      <Card
        title="交易紀錄"
        variant="raised"
        action={
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" onClick={() => downloadCsv("northstar-investments.csv", exportInvestmentCsv(recordRows, assetFor))}>匯出 CSV</ActionButton>
            <label>
              <input className="hidden" type="file" accept=".csv,text/csv" onChange={handleCsv} />
              <span className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-elevated)" }}><UploadSimple size={16} />匯入 CSV</span>
            </label>
          </div>
        }
      >
        {preview ? (
          <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-subtle)" }}>
            <div className="font-semibold">匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid</div>
            {preview.invalid.map((item) => <div key={item.row} className="text-sm" style={{ color: "var(--ns-negative)" }}>Row {item.row}: {item.reason}</div>)}
            <div className="mt-3 flex gap-2">
              <ActionButton onClick={async () => { await importRecords.mutateAsync(preview.valid.map((item) => item.value)); setPreview(null); }}>確認匯入</ActionButton>
              <ActionButton variant="secondary" onClick={() => setPreview(null)}>取消</ActionButton>
            </div>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative block min-w-[12rem] flex-1 max-w-sm">
            <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ns-muted)" }} />
            <input className="ns-input w-full pl-9" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋股票、券商、動作或備註" />
          </label>
          <MultiSelectFilter
            icon={<FunnelSimple size={14} />}
            label="交易種類"
            options={typeOptions}
            selected={typeFilter}
            onChange={setTypeFilter}
          />
          <MultiSelectFilter
            icon={<Bank size={14} />}
            label="券商"
            options={brokerOptions}
            selected={brokerFilter}
            onChange={setBrokerFilter}
          />
          {(typeFilter.size > 0 || brokerFilter.size > 0) ? (
            <Button variant="ghost" style={{ fontSize: 12.5 }} onClick={() => { setTypeFilter(new Set()); setBrokerFilter(new Set()); }}>清除篩選</Button>
          ) : null}
        </div>

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
              action={<ActionButton variant="secondary" onClick={() => { setTypeFilter(new Set()); setBrokerFilter(new Set()); setSearchQuery(""); }}>清除篩選</ActionButton>}
            />
          )
        ) : (
          <>
            <div className="space-y-5">
              {paginatedGroups.map((group) => (
                <section key={group.date} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--ns-muted)" }}>{group.date}</h3>
                    <span className="text-xs tabular" style={{ color: "var(--ns-muted)" }}>{group.rows.length} 筆</span>
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((tx) => {
                      const isDeposit = tx.kind === "deposit";
                      const tone = tx.signed >= 0 ? "var(--ns-positive)" : "var(--ns-danger)";
                      return (
                        <div key={tx.id} className="rounded-lg border p-3" style={{ borderColor: "var(--ns-panel-border)", background: "var(--ns-panel-surface)" }}>
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_260px] lg:items-center">
                            <div className="flex items-center gap-3">
                              <div className="grid size-9 place-items-center rounded-md" style={{ background: isDeposit ? "var(--ns-chart-2-soft, var(--ns-accent-soft))" : "var(--ns-accent-soft)", color: isDeposit ? "var(--ns-chart-2, var(--ns-accent))" : "var(--ns-accent)" }}>
                                {isDeposit ? <Bank size={18} weight="duotone" /> : <ChartLineUp size={18} weight="duotone" />}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold">{isDeposit ? tx.name : tx.ticker}</div>
                                <div className="truncate text-xs" style={{ color: "var(--ns-muted)" }}>{isDeposit ? "資金轉入" : (tx.name || "未命名資產")}{tx.date.length > 10 ? ` · ${tx.date.slice(11, 16)}` : ""}</div>
                              </div>
                            </div>

                            <div className="text-sm">
                              <div className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-elevated)", color: "var(--ns-muted)" }}>
                                {allActionLabels[tx.actionKey]}
                              </div>
                              <div className="mt-1 tabular" style={{ color: "var(--ns-muted)" }}>
                                {isDeposit ? "—" : tx.actionKey === "cashDividend" ? `股利 ${formatNumber(tx.price)}` : `${formatNumber(tx.quantity)} × ${formatNumber(tx.price)}`}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
                              <div className="tabular text-right">
                                <div className="font-semibold" style={{ color: tone }}>
                                  {tx.signed >= 0 ? "+" : ""}{formatNumber(tx.signed)} <span className="text-xs" style={{ color: "var(--ns-muted)" }}>{tx.currency}</span>
                                </div>
                                <div className="text-xs" style={{ color: "var(--ns-muted)" }}>
                                  {isDeposit ? tx.brokerName : `${tx.brokerName} · Fee ${formatNumber(tx.fee)}`}
                                </div>
                              </div>
                              {tx.recordId ? (
                                <div className="flex gap-2">
                                  <ActionButton variant="secondary" size="sm" onClick={() => openEdit(tx.recordId!)}><PencilSimple size={14} />編輯</ActionButton>
                                  <ActionButton
                                    variant="danger"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        await deleteRecord.mutateAsync(tx.recordId!);
                                        if (editingRecordId === tx.recordId) setEditingRecordId(null);
                                      } catch (error) {
                                        setMessage(error instanceof Error ? error.message : "刪除失敗。");
                                      }
                                    }}
                                  >
                                    <Trash size={14} />刪除
                                  </ActionButton>
                                </div>
                              ) : (
                                <span className="text-xs" style={{ color: "var(--ns-muted)" }}>於記帳管理</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
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
      </Card>

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
