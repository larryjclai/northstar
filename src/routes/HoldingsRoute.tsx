import { ArrowClockwise, TrendUp } from "@phosphor-icons/react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { useFinanceData } from "../data/hooks";
import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";

export function HoldingsRoute() {
  const { assets, quotes } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const quoteFor = (ticker: string) => quoteRows.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="持倉" description="追蹤持股數量、平均成本與最新快取報價。" />
      <Card
        title="投資資產"
        action={
          <ActionButton
            onClick={() => refreshQuotes.mutate(assetRows.map((asset) => asset.ticker))}
            disabled={refreshQuotes.isPending || assetRows.length === 0}
          >
            <ArrowClockwise size={16} />{refreshQuotes.isPending ? "更新中" : "更新報價"}
          </ActionButton>
        }
      >
        {refreshQuotes.error ? <p className="mb-3 text-sm" style={{ color: "var(--ns-negative)" }}>{refreshQuotes.error.message}</p> : null}
        <div className="divide-y" style={{ borderColor: "var(--ns-border)" }}>
          {assetRows.map((asset) => {
            const quote = quoteFor(asset.ticker);
            const marketValue = quote ? quote.price * asset.totalQuantity : null;
            return (
              <div key={asset.id} className="grid grid-cols-[1fr_auto] gap-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                    <TrendUp size={20} weight="duotone" />
                  </div>
                  <div>
                    <div className="font-semibold">{asset.ticker}</div>
                    <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.name}</div>
                    <div className="text-xs" style={{ color: "var(--ns-muted)" }}>
                      {quote ? `Yahoo Finance · ${new Date(quote.updatedAt).toLocaleString("zh-TW")}` : "尚未更新報價"}
                    </div>
                  </div>
                </div>
                <div className="tabular text-right">
                  <div>{asset.totalQuantity.toLocaleString("zh-TW")} 股</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>均價 {asset.averageCost.toFixed(2)}</div>
                  <div className="text-sm font-semibold">{quote ? `${quote.price.toFixed(2)} ${quote.currency}` : "無報價"}</div>
                  {marketValue !== null ? <div className="text-sm" style={{ color: "var(--ns-muted)" }}>市值 {marketValue.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
