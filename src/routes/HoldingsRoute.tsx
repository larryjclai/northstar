import { ArrowClockwise, ArrowsClockwise, PencilSimple, PlusCircle, Trash, TrendUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { HoldingForm, emptyHoldingDraft } from "../components/HoldingForm";
import { StatusText } from "../components/StatusText";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { PortfolioAssetDraft } from "../data/repositories";
import type { PortfolioAsset } from "../domain";
import { useRefreshDailyPrices, useRefreshQuotes } from "../features/market-data/useMarketRefresh";

export function HoldingsRoute() {
  const { assets, quotes, dailyPrices } = useFinanceData();
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
      acquisitionDate: asset.acquisitionDate ?? new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="持倉" description="追蹤持股數量、平均成本與最新快取報價，也可以從今天的現有部位開始記錄。" />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title={editingId ? "編輯持倉" : "新增持倉"}>
          <HoldingForm
            value={form}
            onChange={setForm}
            onSubmit={submitHolding}
            submitLabel={editingId ? "儲存持倉" : "新增持倉"}
          />
          {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}
          {editingId ? (
            <div className="mt-3">
              <ActionButton variant="secondary" onClick={() => { setEditingId(null); setForm(emptyHoldingDraft); }}>取消編輯</ActionButton>
            </div>
          ) : null}
        </Card>
        <Card
          title="投資資產"
          action={
            <div className="flex flex-wrap gap-2">
              <ActionButton
                onClick={() => refreshQuotes.mutate(assetRows.map((asset) => asset.ticker))}
                disabled={refreshQuotes.isPending || assetRows.length === 0}
              >
                <ArrowClockwise size={16} />{refreshQuotes.isPending ? "更新中" : "更新報價"}
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={() => refreshAllDailyPrices("1y")}
                disabled={refreshDailyPrices.isPending || assetRows.length === 0}
              >
                <ArrowsClockwise size={16} />{refreshDailyPrices.isPending ? "抓取中" : "回補 1Y 歷史"}
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={() => refreshAllDailyPrices("5y")}
                disabled={refreshDailyPrices.isPending || assetRows.length === 0}
              >
                <ArrowsClockwise size={16} />回補 5Y
              </ActionButton>
            </div>
          }
        >
          {refreshQuotes.error ? <p className="mb-3 text-sm" style={{ color: "var(--ns-negative)" }}>{refreshQuotes.error.message}</p> : null}
          {refreshDailyPrices.error ? <p className="mb-3 text-sm" style={{ color: "var(--ns-negative)" }}>{refreshDailyPrices.error.message}</p> : null}
          {message ? <p className="mb-3 text-sm" style={{ color: "var(--ns-muted)" }}>{message}</p> : null}
          {assetRows.length === 0 ? (
            <EmptyState
              icon={<PlusCircle size={24} weight="duotone" />}
              title="尚未建立持倉"
              description="可以直接輸入現有部位與平均成本，也可以從投資交易開始逐筆累積。"
            />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--ns-border)" }}>
              {assetRows.map((asset) => {
                const quote = quoteFor(asset.ticker);
                const marketValue = quote ? quote.price * asset.totalQuantity : null;
                const stat = priceStats.get(asset.ticker.toUpperCase());
                return (
                  <div key={asset.id} className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-[1fr_auto]">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                        <TrendUp size={20} weight="duotone" />
                      </div>
                      <div>
                        <div className="font-semibold">{asset.ticker}</div>
                        <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.name}</div>
                        <div className="text-xs" style={{ color: "var(--ns-muted)" }}>
                          {asset.holdingSource === "manual" ? "手動持倉" : "交易計算"} · {quote ? `Yahoo Finance · ${new Date(quote.updatedAt).toLocaleString("zh-TW")}` : "尚未更新報價"}
                        </div>
                        <div className="text-xs" style={{ color: "var(--ns-muted)" }}>
                          每日股價：{stat ? `${stat.count} 筆（${stat.firstDate} ~ ${stat.lastDate}）` : "尚未回補歷史"}
                        </div>
                      </div>
                    </div>
                    <div className="tabular text-left sm:text-right">
                      <div>{asset.totalQuantity.toLocaleString("zh-TW")} 股</div>
                      <div className="text-sm" style={{ color: "var(--ns-muted)" }}>均價 {asset.averageCost.toFixed(2)}</div>
                      <div className="text-sm font-semibold">{quote ? `${quote.price.toFixed(2)} ${quote.currency}` : "無報價"}</div>
                      {marketValue !== null ? <div className="text-sm" style={{ color: "var(--ns-muted)" }}>市值 {marketValue.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</div> : null}
                      {asset.holdingSource === "manual" ? (
                        <div className="mt-3 flex gap-2 sm:justify-end">
                          <ActionButton variant="secondary" onClick={() => startEdit(asset)}><PencilSimple size={16} />編輯</ActionButton>
                          <ActionButton variant="danger" onClick={() => deleteHolding.mutate(asset.id)}><Trash size={16} />刪除</ActionButton>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
