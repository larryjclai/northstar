import { CaretRight, Plus, ArrowUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useFinanceData } from "../data/hooks";
import { buildPositionMetrics, buildDailyPriceLookup, priceAssetOnDate, calculateFifo, calculateXirr, formatNumber, formatPrice, formatQuantity, resolveAssetName, XIRR_MIN_DAYS } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { AssetLogo } from "../components/AssetLogo";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { ToggleGroup, ToggleGroupItem } from "../components/coss/toggle-group";
import { InvestmentEntryDrawer } from "./InvestmentsAddSheet";
import { HoldingEditModal } from "./HoldingEditModal";
import { ChartLineUp, PencilSimple } from "@phosphor-icons/react";

export function HoldingDetailRoute() {
  const params = useParams({ strict: false }) as any;
  const ticker = params.ticker || "";
  const navigate = useNavigate();
  
  const { assets, quotes, dailyPrices, accounts, investments } = useFinanceData();
  // "auto" follows the Chinese-first app language (see i18n.ts) → zh-Hant.
  const nameLocale = useUiPreferences((state) => (state.nameLocale === "auto" ? "zh-Hant" : state.nameLocale));
  const [seg, setSeg] = useState("1y");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];

  const asset = useMemo(() => assetRows.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase()), [assetRows, ticker]);
  const quote = useMemo(() => quoteRows.find((q) => q.symbol.toUpperCase() === ticker.toUpperCase()), [quoteRows, ticker]);

  // Canonical valuation (quote → latest daily close → average cost) so this
  // page's market value agrees with the Dashboard and the 投資 list.
  const today = new Date().toISOString().slice(0, 10);
  const dailyPriceLookup = useMemo(() => buildDailyPriceLookup(dailyPriceRows), [dailyPriceRows]);
  const priced = useMemo(
    () => (asset ? priceAssetOnDate(asset, today, { todayIso: today, dailyPriceLookup, quote }) : null),
    [asset, today, dailyPriceLookup, quote],
  );

  const series = useMemo(() => {
    const cutoff = rangeCutoff(seg);
    return dailyPriceRows
      .filter((p) => p.ticker.toUpperCase() === ticker.toUpperCase() && (!cutoff || p.date >= cutoff))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(p => ({ date: p.date, price: p.close }));
  }, [dailyPriceRows, ticker, seg]);

  const txns = useMemo(() => {
    if (!asset) return [];
    return recordRows
      .filter(r => r.assetId === asset.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [recordRows, asset]);

  const lots = useMemo(() => {
    if (!asset) return [];
    // Use the canonical market price (quote → latest close); fall back to the
    // lot's own cost only when no market price exists at all (P/L reads 0).
    const marketRef = priced && priced.source !== "cost" ? priced.value : null;
    return calculateFifo(txns).openLots.map((lot) => {
      const last = marketRef ?? lot.costPerShare;
      const pl = (last - lot.costPerShare) * lot.quantity;
      const pct = lot.costPerShare ? ((last - lot.costPerShare) / lot.costPerShare) * 100 : 0;
      return {
        id: lot.id,
        date: lot.openedAt,
        qty: lot.quantity,
        cost: lot.costPerShare,
        last,
        pl,
        pct,
      };
    });
  }, [txns, asset, priced]);

  if (!asset) {
    return (
      <div style={{ padding: "24px 32px 100px" }}>
        <Button variant="ghost" onClick={() => navigate({ to: "/investments" })}>返回投資</Button>
        <div style={{ marginTop: 20 }}>找不到此持倉。</div>
      </div>
    );
  }

  // priced is non-null here (asset is defined past the guard above).
  const marketPrice = priced ? priced.value : asset.averageCost;
  const marketValue = marketPrice * asset.totalQuantity;
  const costBasis = asset.averageCost * asset.totalQuantity;
  const unrealizedGain = marketValue - costBasis;
  const unrealizedGainPercent = costBasis === 0 ? 0 : (unrealizedGain / costBasis) * 100;
  const pos = unrealizedGain >= 0;

  // Moving-average position metrics: realized P/L, dividends, and the dated
  // cash-flow stream that drives money-weighted (XIRR) return.
  const metrics = useMemo(() => buildPositionMetrics(txns), [txns]);
  const realizedGain = metrics.realizedGain;
  const xirr = useMemo(
    () => calculateXirr(metrics.cashflows, { date: new Date().toISOString().slice(0, 10), amount: marketValue }),
    [metrics, marketValue],
  );

  // 持倉天數：自最早一筆買進算起；若沒有任何交易紀錄（手動持倉），則自
  // 新增持倉（Add Holdings）的日期起算。
  const earliestBuyDate = txns.filter((t) => t.action === "buy").map((t) => t.date).sort()[0];
  const holdingSince = earliestBuyDate ?? asset.acquisitionDate ?? null;
  const holdingDays = holdingSince
    ? Math.max(0, Math.floor((Date.now() - new Date(holdingSince).getTime()) / 86_400_000))
    : null;
  const xirrTooShort = xirr !== null && holdingDays !== null && holdingDays < XIRR_MIN_DAYS;
  // 配息 YTD：本年度現金股利。新列以 price 存總額(quantity=0)；舊列為
  // 「每股股利 × 股數」，兩者都要正確加總。
  const thisYear = new Date().toISOString().slice(0, 4);
  const dividendYtd = txns
    .filter((t) => t.action === "cashDividend" && t.date.startsWith(thisYear))
    .reduce((sum, t) => sum + (t.quantity > 0 ? t.price * t.quantity : t.price) - t.fee, 0);

  // Market by explicit ticker suffix only (no length-based guessing — tickers
  // are stored with their market suffix since the forced-suffix change).
  const upperTicker = ticker.toUpperCase();
  const markColor = upperTicker.endsWith(".TW") || upperTicker.endsWith(".TWO")
    ? "var(--ns-chart-1)"
    : asset?.assetType === "crypto" ? "var(--ns-chart-3)" : "var(--ns-chart-2)";

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 32px 100px" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 13, color: "var(--ns-fg-muted)" }}>
        <span style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/investments" })}>持倉投資</span>
        <CaretRight size={13} />
        <span className="mono" style={{ fontWeight: 500, color: "var(--ns-fg)" }}>{asset.ticker}</span>
      </div>

      {/* Hero header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <AssetLogo ticker={asset.ticker} name={resolveAssetName(asset, nameLocale)} size={52} />
          <div>
            <div className="mono" style={{ fontSize: 13, marginBottom: 2, letterSpacing: 0.04, color: "var(--ns-fg-muted)", textTransform: "uppercase" }}>
              {asset.assetType || "Asset"} · {asset.ticker}
            </div>
            <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 24, margin: "0 0 4px", fontWeight: 600, letterSpacing: -0.02 }}>
              {resolveAssetName(asset, nameLocale)}
            </h1>
            <div style={{ display: "flex", gap: 8 }}>
              {asset.sector && <Badge variant="outline" className="rounded-full">{asset.sector}</Badge>}
              <Badge variant="outline" className="rounded-full">{formatQuantity(asset.totalQuantity)} 股</Badge>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={() => setEditOpen(true)}><PencilSimple size={14} />編輯持倉</Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={14} strokeWidth={2} />新增交易
          </Button>
        </div>
      </div>

      {/* Price + position */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1fr_360px]" style={{ marginBottom: 20 }}>
        {/* Chart card */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="ns-num-lg mono">{formatPrice(marketPrice)}</span>
                <span className="dim mono" style={{ fontSize: 13 }}>{asset.currency}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
                <Badge variant={pos ? "success" : "error"} className="gap-1 rounded-full px-2">
                  {pos && <ArrowUp size={11} strokeWidth={2} />}
                  <span className="num">{pos ? "+" : ""}{formatNumber(unrealizedGain)}</span>
                </Badge>
                <Badge variant={pos ? "success" : "error"} className="rounded-full px-2">
                  <span className="num">{pos ? "+" : ""}{unrealizedGainPercent.toFixed(2)}% (Total)</span>
                </Badge>
                {quote?.updatedAt && <span className="muted mono" style={{ fontSize: 12 }}>更新 {new Date(quote.updatedAt).toLocaleTimeString()}</span>}
              </div>
            </div>
            <ToggleGroup
              variant="outline"
              value={[seg]}
              onValueChange={(value) => { const next = value[0]; if (next) setSeg(next); }}
            >
              {/* No "1D": the chart draws daily closes, so a one-day window has
                  at most a single point and renders blank. */}
              {["1W", "1M", "3M", "YTD", "1Y", "ALL"].map((v) => (
                <ToggleGroupItem key={v} value={v.toLowerCase()} size="sm" className="data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground">{v}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          
          <div style={{ height: 240, width: "100%" }}>
            {series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={markColor} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={markColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip />
                  <Area type="monotone" dataKey="price" stroke={markColor} fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "rgba(164, 219, 108, 0.2)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <ChartLineUp size={24} color="var(--ns-chart-1)" />
                </div>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>還沒有足夠的歷史股價</div>
                <div className="muted" style={{ fontSize: 13, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
                  先用「更新報價」或在編輯頁新增歷史快照，這裡就會依所選區間畫出投資市值趨勢。
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Position summary — stretches to the chart card's height so the two
            cards line up top and bottom; stats distribute to fill. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{ padding: 20, flex: 1 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 12 }}>Your position · 平均成本</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, alignContent: "space-between" }}>
              {[
                ["市值", formatNumber(marketValue), null],
                ["成本基礎", formatNumber(costBasis), null],
                ["未實現損益", (pos ? "+" : "") + formatNumber(unrealizedGain), pos ? "gain" : "loss"],
                ["總報酬率", (pos ? "+" : "") + unrealizedGainPercent.toFixed(2) + "%", pos ? "gain" : "loss"],
                ["已實現損益", (realizedGain >= 0 ? "+" : "") + formatNumber(realizedGain), realizedGain >= 0 ? "gain" : "loss"],
                // B1: annualized return is meaningless for short holding spans —
                // suppress to "—" with an explanatory tooltip below XIRR_MIN_DAYS.
                xirrTooShort
                  ? ["年化報酬 (XIRR)", "–", null, `持有期間少於 ${XIRR_MIN_DAYS} 天，年化報酬不具參考意義`]
                  : ["年化報酬 (XIRR)", xirr === null ? "–" : (xirr >= 0 ? "+" : "") + (xirr * 100).toFixed(2) + "%", xirr === null ? null : xirr >= 0 ? "gain" : "loss"],
                ["配息 YTD", formatNumber(dividendYtd), null],
                ["持倉天數", holdingDays !== null ? `${holdingDays} 天` : "–", null],
              ].map(([l, v, c, t]) => (
                <div key={l}>
                  <div className="muted" style={{ fontSize: 11 }}>{l}</div>
                  <div className={"num " + (c || "")} style={{ fontSize: 16, fontWeight: 500 }} title={t ?? undefined}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Open lots — FIFO tax-lot view (kept separate from the moving-average
          P/L above; useful for lot-level tax planning). */}
      <Card style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>稅務批次 (FIFO) · {lots.length}</h3>
          <div style={{ flex: 1 }} />
          <span className="muted mono" style={{ fontSize: 11 }}>FIFO 批次成本，僅供稅務參考</span>
        </div>
        <div
          style={{
            display: "grid", gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr",
            padding: "10px 22px", borderBottom: "1px solid var(--ns-border)",
            fontSize: 11, color: "var(--ns-fg-dim)", fontFamily: "var(--ns-font-mono)",
            letterSpacing: 0.06, textTransform: "uppercase",
          }}
        >
          <span>Date</span>
          <span style={{ textAlign: "right" }}>Qty</span>
          <span style={{ textAlign: "right" }}>Cost</span>
          <span style={{ textAlign: "right" }}>Last</span>
          <span style={{ textAlign: "right" }}>P/L</span>
          <span style={{ textAlign: "right" }}>P/L %</span>
        </div>
        {lots.map((l) => (
          <div
            key={l.id}
            style={{
              display: "grid", gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr",
              padding: "14px 22px", borderTop: "1px solid var(--ns-border)", alignItems: "center",
            }}
          >
            <span className="mono muted" style={{ fontSize: 13 }}>{l.date}</span>
            <span className="num" style={{ textAlign: "right", fontSize: 13 }}>{formatQuantity(l.qty)}</span>
            <span className="num muted" style={{ textAlign: "right", fontSize: 13 }}>{formatPrice(l.cost)}</span>
            <span className="num" style={{ textAlign: "right", fontSize: 13 }}>{formatPrice(l.last)}</span>
            <span className={"num " + (l.pl >= 0 ? "gain" : "loss")} style={{ textAlign: "right", fontSize: 14, fontWeight: 500 }}>
              {l.pl >= 0 ? "+" : ""}{formatNumber(l.pl)}
            </span>
            <span className={"num " + (l.pct >= 0 ? "gain" : "loss")} style={{ textAlign: "right", fontSize: 14 }}>
              {l.pct >= 0 ? "+" : ""}{l.pct.toFixed(2)}%
            </span>
          </div>
        ))}
      </Card>

      {/* Transaction history */}
      <Card style={{ padding: 0 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>交易紀錄 · {txns.length} 筆</h3>
          <div style={{ flex: 1 }} />
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={13} strokeWidth={2} /> 新增
          </Button>
        </div>
        {txns.map((tx, i) => (
          <div
            key={tx.id}
            style={{
              display: "grid", gridTemplateColumns: "100px 80px 0.7fr 0.9fr 0.9fr 1fr 1fr",
              gap: 0, padding: "13px 22px", borderTop: i ? "1px solid var(--ns-border)" : "none",
              alignItems: "center",
            }}
          >
            <span className="mono muted" style={{ fontSize: 12.5 }}>{tx.date}</span>
            <Badge variant={tx.action === "buy" ? "success" : tx.action === "sell" ? "error" : "secondary"} className="rounded-full uppercase" style={{ justifySelf: "start" }}>
              {tx.action}
            </Badge>
            <span className="num" style={{ textAlign: "right", fontSize: 13.5 }}>{formatQuantity(tx.quantity)}</span>
            <span className="num" style={{ textAlign: "right", fontSize: 13.5 }}>{formatPrice(tx.price)}</span>
            <span className="num muted" style={{ textAlign: "right", fontSize: 12 }}>fee {tx.fee || "–"}</span>
            <span className={"num " + (tx.action === "sell" ? "pos" : tx.action === "buy" ? "" : "pos")} style={{ textAlign: "right", fontSize: 14, fontWeight: 500 }}>
              {tx.action === "sell" ? "+" : tx.action === "cashDividend" ? "+" : "−"}{formatNumber(tx.quantity * tx.price)}
            </span>
            <span className="muted" style={{ textAlign: "right", fontSize: 12 }}>
              {accountRows.find(a => a.id === tx.linkedAccountId)?.name || "–"}
            </span>
          </div>
        ))}
      </Card>

      {addOpen && (
        <InvestmentEntryDrawer
          open={addOpen}
          onClose={() => setAddOpen(false)}
          accounts={accountRows}
          portfolioAssets={assetRows}
          title="新增交易"
          initialMode="transaction"
        />
      )}

      {editOpen && asset && (
        <HoldingEditModal
          editingAsset={asset}
          onClose={() => setEditOpen(false)}
          accounts={accountRows}
        />
      )}
    </div>
  );
}

function rangeCutoff(range: string) {
  const now = new Date();
  const date = new Date(now);
  if (range === "all") return null;
  if (range === "ytd") return `${now.getFullYear()}-01-01`;
  const days: Record<string, number> = { "1d": 1, "1w": 7, "1m": 31, "3m": 93, "1y": 366 };
  date.setDate(date.getDate() - (days[range] ?? 366));
  return date.toISOString().slice(0, 10);
}
