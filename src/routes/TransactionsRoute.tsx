import { ChartLineUp, MagnifyingGlass, PencilSimple, PlusCircle, Trash, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useMemo, useState, useEffect } from "react";
import { ActionButton } from "../components/ActionButton";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportInvestmentCsv, parseInvestmentCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft } from "../data/repositories";
import { formatNumber, todayInTimezone } from "../domain";
import type { InvestmentAction, InvestmentRecord } from "../domain";
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

export function TransactionsRoute() {
  const { accounts, assets, investments } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const [preview, setPreview] = useState<ImportPreview<InvestmentDraft> | null>(null);
  const [message, setMessage] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const deleteRecord = useRepositoryMutation((repository, id: string) => repository.deleteInvestmentRecord(id), ["investments", "assets", "accounts", "ledger"]);
  const importRecords = useRepositoryMutation((repository, input: InvestmentDraft[]) => repository.importInvestmentRecords(input), ["investments", "assets", "accounts", "ledger"]);

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const assetFor = (id: string) => assetRows.find((asset) => asset.id === id);

  const sortedRecords = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return recordRows
      .filter((record) => {
        if (!query) return true;
        const asset = assetFor(record.assetId);
        const account = record.linkedAccountId ? accountMap.get(record.linkedAccountId) : null;
        return [asset?.ticker, asset?.name, account?.name, record.note, actionLabels[record.action]]
          .some((value) => value?.toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`));
  }, [accountMap, assetRows, recordRows, searchQuery]);

  const groupedRecords = useMemo(() => {
    const groups: Array<{ date: string; rows: InvestmentRecord[] }> = [];
    let currentDate = "";
    for (const row of sortedRecords) {
      const monthKey = row.date.slice(0, 7);
      if (monthKey !== currentDate) {
        groups.push({ date: monthKey, rows: [row] });
        currentDate = monthKey;
      } else {
        groups[groups.length - 1].rows.push(row);
      }
    }
    return groups;
  }, [sortedRecords]);

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
  }, [monthKey, searchQuery]);

  const paginatedGroups = useMemo(() => groupedRecords.slice((page - 1) * pageSize, page * pageSize), [groupedRecords, page]);
  const totalPages = Math.ceil(groupedRecords.length / pageSize);

  const monthRows = useMemo(() => recordRows.filter((row) => row.date.startsWith(monthKey)), [monthKey, recordRows]);
  const monthBuy = monthRows
    .filter((row) => row.action === "buy")
    .reduce((sum, row) => sum + row.price * row.quantity, 0);
  const monthSell = monthRows
    .filter((row) => row.action === "sell")
    .reduce((sum, row) => sum + row.price * row.quantity, 0);
  const monthDividend = monthRows
    .filter((row) => row.action === "cashDividend")
    .reduce((sum, row) => sum + row.price, 0);
  const twdSettlementWatchCount = monthRows.filter((row) => {
    const linked = row.linkedAccountId ? accountMap.get(row.linkedAccountId) : null;
    return row.action === "buy" && linked?.currency.toUpperCase() === "TWD";
  }).length;

  function openCreate() {
    setEditingRecordId(null);
    setMessage("");
    setDrawerOpen(true);
  }

  function openEdit(record: InvestmentRecord) {
    setEditingRecordId(record.id);
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
      <div className="flex justify-end mb-4">
        <ActionButton onClick={openCreate} size="sm">
          <PlusCircle size={16} />新增交易
        </ActionButton>
      </div>

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

        <label className="relative mb-4 block max-w-sm">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ns-muted)" }} />
          <input className="ns-input w-full pl-9" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋股票、帳戶、動作或備註" />
        </label>

        {paginatedGroups.length === 0 ? (
          <EmptyState
            icon={<PlusCircle size={24} weight="duotone" />}
            title="還沒有投資交易"
            description="先新增一筆交易，或直接從投資頁建立目前持倉。"
            action={<ActionButton onClick={openCreate}><PlusCircle size={16} />新增第一筆交易</ActionButton>}
          />
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
                    {group.rows.map((record) => {
                      const asset = assetFor(record.assetId);
                      const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
                      const signed = record.action === "buy" ? -gross : gross;
                      const tone = signed >= 0 ? "var(--ns-positive)" : "var(--ns-danger)";
                      return (
                        <div key={record.id} className="rounded-lg border p-3" style={{ borderColor: "var(--ns-panel-border)", background: "var(--ns-panel-surface)" }}>
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_240px] lg:items-center">
                            <div className="flex items-center gap-3">
                              <div className="grid size-9 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                                <ChartLineUp size={18} weight="duotone" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold">{asset?.ticker ?? record.assetId}</div>
                                <div className="truncate text-xs" style={{ color: "var(--ns-muted)" }}>{asset?.name || "未命名資產"}{record.date.length > 10 ? ` · ${record.date.slice(11, 16)}` : ""}</div>
                              </div>
                            </div>

                            <div className="text-sm">
                              <div className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-elevated)", color: "var(--ns-muted)" }}>
                                {actionLabels[record.action]}
                              </div>
                              <div className="mt-1 tabular" style={{ color: "var(--ns-muted)" }}>
                                {record.action === "cashDividend" ? `股利 ${formatNumber(record.price)}` : `${formatNumber(record.quantity)} × ${formatNumber(record.price)}`}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
                              <div className="tabular text-right">
                                <div className="font-semibold" style={{ color: tone }}>
                                  {signed >= 0 ? "+" : ""}{formatNumber(signed)}
                                </div>
                                <div className="text-xs" style={{ color: "var(--ns-muted)" }}>Fee {formatNumber(record.fee)}</div>
                              </div>
                              <div className="flex gap-2">
                                <ActionButton variant="secondary" size="sm" onClick={() => openEdit(record)}><PencilSimple size={14} />編輯</ActionButton>
                                <ActionButton
                                  variant="danger"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await deleteRecord.mutateAsync(record.id);
                                      if (editingRecordId === record.id) setEditingRecordId(null);
                                    } catch (error) {
                                      setMessage(error instanceof Error ? error.message : "刪除失敗。");
                                    }
                                  }}
                                >
                                  <Trash size={14} />刪除
                                </ActionButton>
                              </div>
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
                <button className="ns-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</button>
                <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
                <button className="ns-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</button>
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
    <div className="ns-card p-4 sm:p-5">
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="num" style={{ fontSize: 22, fontWeight: 500 }}>{value}</div>
        {sublabel && <div className="num" style={{ fontSize: 13, color: 'var(--ns-muted)' }}>{sublabel}</div>}
      </div>
    </div>
  );
}
