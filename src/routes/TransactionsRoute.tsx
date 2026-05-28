import { ChartLineUp, PencilSimple, PlusCircle, Trash, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useMemo, useState } from "react";
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

  const deleteRecord = useRepositoryMutation((repository, id: string) => repository.deleteInvestmentRecord(id), ["investments", "assets", "accounts", "ledger"]);
  const importRecords = useRepositoryMutation((repository, input: InvestmentDraft[]) => repository.importInvestmentRecords(input), ["investments", "assets", "accounts", "ledger"]);

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const assetFor = (id: string) => assetRows.find((asset) => asset.id === id);

  const sortedRecords = useMemo(
    () => [...recordRows].sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`)),
    [recordRows],
  );

  const groupedRecords = useMemo(() => {
    const groups: Array<{ date: string; rows: InvestmentRecord[] }> = [];
    let currentDate = "";
    for (const row of sortedRecords) {
      if (row.date !== currentDate) {
        groups.push({ date: row.date, rows: [row] });
        currentDate = row.date;
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
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Portfolio · {monthKey}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>投資交易</h1>
        </div>
        <button className="ns-btn primary" onClick={openCreate}>
          <PlusCircle size={14} />新增交易
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <SummaryCard label="本月交易筆數" value={`${monthRows.length} 筆`} sublabel={monthKey} />
        <SummaryCard label="本月買進" value={formatNumber(monthBuy)} sublabel="未含手續費" />
        <SummaryCard label="本月賣出" value={formatNumber(monthSell)} sublabel="成交金額" />
        <SummaryCard label="本月現金股利" value={formatNumber(monthDividend)} sublabel={`T+2 留意 ${twdSettlementWatchCount} 筆`} />
      </div>

      {message ? <div style={{ marginBottom: 16 }}><StatusText>{message}</StatusText></div> : null}

      <div className="ns-card" style={{ padding: 0 }}>
        <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>交易紀錄</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ns-btn" onClick={() => downloadCsv("northstar-investments.csv", exportInvestmentCsv(recordRows, assetFor))}>匯出 CSV</button>
            <label className="ns-btn" style={{ cursor: "pointer" }}>
              <input style={{ display: "none" }} type="file" accept=".csv,text/csv" onChange={handleCsv} />
              <UploadSimple size={14} />匯入 CSV
            </label>
          </div>
        </div>

        {preview ? (
          <div style={{ margin: 16, borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", padding: 16, background: "var(--ns-bg-hover)" }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid</div>
            {preview.invalid.map((item) => <div key={item.row} className="neg" style={{ fontSize: 13 }}>Row {item.row}: {item.reason}</div>)}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="ns-btn primary" onClick={async () => { await importRecords.mutateAsync(preview.valid.map((item) => item.value)); setPreview(null); }}>確認匯入</button>
              <button className="ns-btn" onClick={() => setPreview(null)}>取消</button>
            </div>
          </div>
        ) : null}

        {groupedRecords.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <PlusCircle size={28} weight="duotone" style={{ color: "var(--ns-fg-muted)", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>還沒有投資交易</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>先新增一筆交易，或直接從投資頁建立目前持倉。</div>
            <button className="ns-btn primary" onClick={openCreate}><PlusCircle size={14} />新增第一筆交易</button>
          </div>
        ) : (
          <div style={{ padding: "0 0 8px" }}>
            {groupedRecords.map((group) => (
              <div key={group.date} style={{ marginBottom: 4 }}>
                <div style={{ padding: "12px 22px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="ns-eyebrow">{group.date}</span>
                  <span className="dim mono" style={{ fontSize: 11 }}>{group.rows.length} 筆</span>
                </div>
                {group.rows.map((record) => {
                  const asset = assetFor(record.assetId);
                  const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
                  const signed = record.action === "buy" ? -gross : gross;
                  return (
                    <div key={record.id} className="ns-row" style={{ gap: 14 }}>
                      <div style={{ width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                        <ChartLineUp size={17} weight="duotone" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                          {asset?.ticker ?? record.assetId}
                          <span className="ns-pill" style={{ fontSize: 10 }}>{actionLabels[record.action]}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {asset?.name || "未命名資產"}
                        </div>
                        <div className="dim mono" style={{ fontSize: 11.5, marginTop: 1 }}>
                          {record.action === "cashDividend" ? `股利 ${formatNumber(record.price)}` : `${formatNumber(record.quantity)} × ${formatNumber(record.price)}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className={"num " + (signed >= 0 ? "pos" : "neg")} style={{ fontSize: 14.5, fontWeight: 600 }}>
                          {signed >= 0 ? "+" : ""}{formatNumber(signed)}
                        </div>
                        <div className="dim mono" style={{ fontSize: 11 }}>Fee {formatNumber(record.fee)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ns-btn ghost" style={{ padding: 7 }} onClick={() => openEdit(record)} title="編輯"><PencilSimple size={13} /></button>
                        <button
                          className="ns-btn ghost"
                          style={{ padding: 7, color: "var(--ns-neg)" }}
                          title="刪除"
                          onClick={async () => {
                            try {
                              await deleteRecord.mutateAsync(record.id);
                              if (editingRecordId === record.id) setEditingRecordId(null);
                            } catch (error) {
                              setMessage(error instanceof Error ? error.message : "刪除失敗。");
                            }
                          }}
                        ><Trash size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

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

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="ns-card" style={{ padding: "var(--ns-pad-card)" }}>
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="ns-num-md">{value}</div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{sublabel}</div>
    </div>
  );
}
