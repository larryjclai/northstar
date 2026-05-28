import { ArrowClockwise, ArrowsClockwise, PencilSimple, PlusCircle, Trash, TrendUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { StatusText } from "../components/StatusText";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { PortfolioAssetDraft } from "../data/repositories";
import { formatNumber, formatPrice, formatQuantity, resolveAssetName, todayInTimezone, type PortfolioAsset } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { useRefreshDailyPrices, useRefreshQuotes } from "../features/market-data/useMarketRefresh";

export function HoldingsRoute() {
  const { assets, quotes, dailyPrices, accounts } = useFinanceData();
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const timezone = useUiPreferences((state) => state.timezone);
  const accountRows = accounts.data ?? [];
  const emptyHoldingDraft = useMemo(() => makeEmptyHoldingDraft(timezone), [timezone]);
  const [form, setForm] = useState<PortfolioAssetDraft>(emptyHoldingDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const refreshQuotes = useRefreshQuotes();
  const refreshDailyPrices = useRefreshDailyPrices();
  const createHolding = useRepositoryMutation((repository, input: PortfolioAssetDraft) => repository.createManualHolding(input), ["assets"]);
  const updateHolding = useRepositoryMutation((repository, input: PortfolioAssetDraft & { id: string }) => repository.updateManualHolding(input.id, input), ["assets"]);
  const deleteHolding = useRepositoryMutation((repository, id: string) => repository.deleteManualHolding(id), ["assets"]);
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const quoteFor = (ticker: string) => quoteRows.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const priceStats = useMemo(() => {
    const map = new Map<string, { count: number; firstDate: string; lastDate: string }>();
    for (const row of dailyPriceRows) {
      const key = row.ticker.toUpperCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { count: 1, firstDate: row.date, lastDate: row.date });
      } else {
        existing.count += 1;
        if (row.date < existing.firstDate) existing.firstDate = row.date;
        if (row.date > existing.lastDate) existing.lastDate = row.date;
      }
    }
    return map;
  }, [dailyPriceRows]);

  async function refreshAllDailyPrices(range: string) {
    setMessage("");
    if (assetRows.length === 0) {
      setMessage("尚無持倉可以回補價格。");
      return;
    }
    try {
      const result = await refreshDailyPrices.mutateAsync({
        tickers: assetRows.map((asset) => asset.ticker),
        range,
      });
      setMessage(`已抓取 ${result.saved} 筆每日股價${result.failed.length ? `（部分失敗：${result.failed.join("；")}）` : "。"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "股價更新失敗。");
    }
  }

  async function submitHolding() {
    setMessage("");
    try {
      if (!form.ticker.trim()) throw new Error("請輸入 ticker。");
      if (editingId) await updateHolding.mutateAsync({ ...form, id: editingId });
      else await createHolding.mutateAsync(form);
      setForm(emptyHoldingDraft);
      setEditingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "持倉儲存失敗。");
    }
  }

  function startEdit(asset: PortfolioAsset) {
    setEditingId(asset.id);
    setForm({
      ticker: asset.ticker,
      name: asset.name,
      currency: asset.currency,
      totalQuantity: asset.totalQuantity,
      averageCost: asset.averageCost,
      acquisitionDate: asset.acquisitionDate ?? todayInTimezone(timezone),
      accountId: asset.accountId,
    });
  }

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Portfolio · Manual</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>持倉</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
        <div className="ns-card" style={{ padding: 22 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 14 }}>{editingId ? "編輯持倉" : "新增持倉"}</div>
          <HoldingForm
            value={form}
            onChange={setForm}
            onSubmit={submitHolding}
            submitLabel={editingId ? "儲存持倉" : "新增持倉"}
            accounts={accountRows}
          />
          {message ? <div style={{ marginTop: 12 }}><StatusText>{message}</StatusText></div> : null}
          {editingId ? (
            <div style={{ marginTop: 12 }}>
              <button className="ns-btn" onClick={() => { setEditingId(null); setForm(emptyHoldingDraft); }}>取消編輯</button>
            </div>
          ) : null}
        </div>

        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>投資資產</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ns-btn"
                onClick={() => refreshQuotes.mutate(assetRows.map((asset) => asset.ticker))}
                disabled={refreshQuotes.isPending || assetRows.length === 0}
              >
                <ArrowClockwise size={14} />{refreshQuotes.isPending ? "更新中" : "更新報價"}
              </button>
              <button
                className="ns-btn"
                onClick={() => refreshAllDailyPrices("1y")}
                disabled={refreshDailyPrices.isPending || assetRows.length === 0}
              >
                <ArrowsClockwise size={14} />{refreshDailyPrices.isPending ? "抓取中" : "回補 1Y"}
              </button>
              <button
                className="ns-btn"
                onClick={() => refreshAllDailyPrices("5y")}
                disabled={refreshDailyPrices.isPending || assetRows.length === 0}
              >
                <ArrowsClockwise size={14} />回補 5Y
              </button>
            </div>
          </div>

          {refreshQuotes.error ? <div style={{ padding: "10px 22px", color: "var(--ns-neg)", fontSize: 13 }}>{refreshQuotes.error.message}</div> : null}
          {refreshDailyPrices.error ? <div style={{ padding: "10px 22px", color: "var(--ns-neg)", fontSize: 13 }}>{refreshDailyPrices.error.message}</div> : null}

          {assetRows.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <PlusCircle size={28} weight="duotone" style={{ color: "var(--ns-fg-muted)", marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>尚未建立持倉</div>
              <div className="muted" style={{ fontSize: 13 }}>可以直接輸入現有部位與平均成本，也可以從投資交易開始逐筆累積。</div>
            </div>
          ) : (
            assetRows.map((asset) => {
              const quote = quoteFor(asset.ticker);
              const marketValue = quote ? quote.price * asset.totalQuantity : null;
              const stat = priceStats.get(asset.ticker.toUpperCase());
              return (
                <div key={asset.id} className="ns-row" style={{ gap: 14 }}>
                  <div style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                    <TrendUp size={18} weight="duotone" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{asset.ticker}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{resolveAssetName(asset, nameLocale)}</div>
                    <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                      {asset.holdingSource === "manual" ? "手動持倉" : "交易計算"} · {quote ? `Yahoo · ${new Date(quote.updatedAt).toLocaleString("zh-TW")}` : "尚未更新報價"}
                    </div>
                    <div className="dim" style={{ fontSize: 11 }}>
                      每日股價：{stat ? `${stat.count} 筆（${stat.firstDate} ~ ${stat.lastDate}）` : "尚未回補"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{formatQuantity(asset.totalQuantity)} 股</div>
                    <div className="muted mono" style={{ fontSize: 12 }}>均價 {formatPrice(asset.averageCost)}</div>
                    <div className="num" style={{ fontSize: 12.5, fontWeight: 500 }}>{quote ? `${formatPrice(quote.price)} ${quote.currency}` : "無報價"}</div>
                    {marketValue !== null ? <div className="muted mono" style={{ fontSize: 11.5 }}>市值 {formatNumber(marketValue)}</div> : null}
                    {asset.holdingSource === "manual" ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
                        <button className="ns-btn ghost" style={{ padding: 7 }} onClick={() => startEdit(asset)} title="編輯"><PencilSimple size={13} /></button>
                        <button className="ns-btn ghost" style={{ padding: 7, color: "var(--ns-neg)" }} onClick={() => deleteHolding.mutate(asset.id)} title="刪除"><Trash size={13} /></button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
