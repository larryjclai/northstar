import { CaretRight, DownloadSimple, Plus, Star, ArrowUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useFinanceData } from "../data/hooks";
import { formatNumber, formatPrice, formatQuantity, resolveAssetName } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { InvestmentEntryDrawer } from "./InvestmentsAddSheet";
import { HoldingEditModal } from "./HoldingEditModal";
import { ChartLineUp, PencilSimple } from "@phosphor-icons/react";

function NSMark({ label, color, mono, size = 32 }: { label: string; color: string; mono?: boolean; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        background: color,
        color: "var(--ns-bg)",
        borderRadius: "var(--ns-r-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: mono ? "var(--ns-font-mono)" : "var(--ns-font-display)",
        fontWeight: 600,
        fontSize: size <= 28 ? 11 : 13,
        letterSpacing: mono ? 0 : "0.02em",
      }}
    >
      {label}
    </div>
  );
}

export function HoldingDetailRoute() {
  const params = useParams({ strict: false }) as any;
  const ticker = params.ticker || "";
  const navigate = useNavigate();
  
  const { assets, quotes, dailyPrices, accounts, investments } = useFinanceData();
  const nameLocale = useUiPreferences((state) => state.nameLocale);
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

  const series = useMemo(() => {
    return dailyPriceRows
      .filter((p) => p.ticker.toUpperCase() === ticker.toUpperCase())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(p => ({ date: p.date, price: p.close }));
  }, [dailyPriceRows, ticker]);

  const txns = useMemo(() => {
    if (!asset) return [];
    return recordRows
      .filter(r => r.assetId === asset.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [recordRows, asset]);

  const lots = useMemo(() => {
    // Basic mockup for open lots. A real implementation would use a FIFO engine.
    if (!asset) return [];
    const buyTxns = txns.filter(t => t.action === "buy");
    return buyTxns.map((t, idx) => {
      const pl = quote ? (quote.price - t.price) * t.quantity : 0;
      const pct = t.price ? ((quote?.price ?? t.price) - t.price) / t.price * 100 : 0;
      return {
        id: t.id,
        date: t.date,
        qty: t.quantity,
        cost: t.price,
        last: quote?.price ?? t.price,
        pl,
        pct,
        div: 0 // Mocked dividend for lot
      };
    });
  }, [txns, quote, asset]);

  if (!asset) {
    return (
      <div style={{ padding: "24px 32px 100px" }}>
        <button className="ns-btn ghost" onClick={() => navigate({ to: "/investments" })}>Back to Investments</button>
        <div style={{ marginTop: 20 }}>Holding not found.</div>
      </div>
    );
  }

  const marketPrice = quote?.price ?? asset.averageCost;
  const marketValue = marketPrice * asset.totalQuantity;
  const costBasis = asset.averageCost * asset.totalQuantity;
  const unrealizedGain = marketValue - costBasis;
  const unrealizedGainPercent = costBasis === 0 ? 0 : (unrealizedGain / costBasis) * 100;
  const pos = unrealizedGain >= 0;

  // 持倉天數：自最早一筆買進至今。
  const earliestBuyDate = txns.filter((t) => t.action === "buy").map((t) => t.date).sort()[0];
  const holdingDays = earliestBuyDate
    ? Math.max(0, Math.floor((Date.now() - new Date(earliestBuyDate).getTime()) / 86_400_000))
    : null;
  // 配息 YTD：本年度現金股利（cashDividend 以 price 存總額）。
  const thisYear = new Date().toISOString().slice(0, 4);
  const dividendYtd = txns
    .filter((t) => t.action === "cashDividend" && t.date.startsWith(thisYear))
    .reduce((sum, t) => sum + t.price, 0);

  const markColor = ticker.includes(".TW") || ticker.length === 4 
    ? "var(--ns-chart-1)" 
    : ["BTC", "ETH"].includes(ticker) ? "var(--ns-chart-3)" : "var(--ns-chart-2)";

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
          <NSMark label={asset.ticker.slice(0, 4)} color={markColor} size={52} mono />
          <div>
            <div className="mono" style={{ fontSize: 13, marginBottom: 2, letterSpacing: 0.04, color: "var(--ns-fg-muted)", textTransform: "uppercase" }}>
              {asset.assetType || "Asset"} · {asset.ticker}
            </div>
            <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 24, margin: "0 0 4px", fontWeight: 600, letterSpacing: -0.02 }}>
              {resolveAssetName(asset, nameLocale)}
            </h1>
            <div style={{ display: "flex", gap: 8 }}>
              {asset.sector && <span className="ns-pill"><span>{asset.sector}</span></span>}
              <span className="ns-pill"><span>{formatQuantity(asset.totalQuantity)} 股</span></span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn ghost"><Star size={14} />追蹤</button>
          <button className="ns-btn ghost" onClick={() => setEditOpen(true)}><PencilSimple size={14} />編輯持倉</button>
          <button className="ns-btn"><DownloadSimple size={14} />匯出</button>
          <button className="ns-btn primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} strokeWidth={2} />Buy / Sell
          </button>
        </div>
      </div>

      {/* Price + position */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 18, marginBottom: 20 }}>
        {/* Chart card */}
        <div className="ns-card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="ns-num-lg mono">{formatNumber(marketPrice)}</span>
                <span className="dim mono" style={{ fontSize: 13 }}>{asset.currency}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
                <span className={"ns-pill " + (pos ? "solid-pos" : "solid-neg")}>
                  {pos && <ArrowUp size={11} strokeWidth={2} />}
                  <span className="num">{pos ? "+" : ""}{formatNumber(unrealizedGain)}</span>
                </span>
                <span className={"ns-pill " + (pos ? "solid-pos" : "solid-neg")}>
                  <span className="num">{pos ? "+" : ""}{unrealizedGainPercent.toFixed(2)}% (Total)</span>
                </span>
                {quote?.updatedAt && <span className="muted mono" style={{ fontSize: 12 }}>更新 {new Date(quote.updatedAt).toLocaleTimeString()}</span>}
              </div>
            </div>
            <div className="ns-seg">
              {["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"].map((v) => (
                <button key={v} aria-selected={v.toLowerCase() === seg} onClick={() => setSeg(v.toLowerCase())}>{v}</button>
              ))}
            </div>
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
        </div>

        {/* Position summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ns-card" style={{ padding: 20 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 12 }}>Your position · FIFO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                ["市值", formatNumber(marketValue), null],
                ["FIFO 成本", formatNumber(costBasis), null],
                ["未實現損益", (pos ? "+" : "") + formatNumber(unrealizedGain), pos ? "pos" : "neg"],
                ["報酬率", (pos ? "+" : "") + unrealizedGainPercent.toFixed(2) + "%", pos ? "pos" : "neg"],
                ["配息 YTD", formatNumber(dividendYtd), null],
                ["持倉天數", holdingDays !== null ? `${holdingDays} 天` : "–", null],
              ].map(([l, v, c]) => (
                <div key={l}>
                  <div className="muted" style={{ fontSize: 11 }}>{l}</div>
                  <div className={"num " + (c || "")} style={{ fontSize: 16, fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Open lots */}
      <div className="ns-card" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>Open lots · {lots.length}</h3>
          <div style={{ flex: 1 }} />
          <span className="muted mono" style={{ fontSize: 11 }}>FIFO cost basis</span>
        </div>
        <div
          style={{
            display: "grid", gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr 0.9fr",
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
          <span style={{ textAlign: "right" }}>Dividends</span>
        </div>
        {lots.map((l) => (
          <div
            key={l.id}
            style={{
              display: "grid", gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr 0.9fr",
              padding: "14px 22px", borderTop: "1px solid var(--ns-border)", alignItems: "center",
            }}
          >
            <span className="mono muted" style={{ fontSize: 13 }}>{l.date}</span>
            <span className="num" style={{ textAlign: "right", fontSize: 13 }}>{formatQuantity(l.qty)}</span>
            <span className="num muted" style={{ textAlign: "right", fontSize: 13 }}>{formatPrice(l.cost)}</span>
            <span className="num" style={{ textAlign: "right", fontSize: 13 }}>{formatPrice(l.last)}</span>
            <span className={"num " + (l.pl >= 0 ? "pos" : "neg")} style={{ textAlign: "right", fontSize: 14, fontWeight: 500 }}>
              {l.pl >= 0 ? "+" : ""}{formatNumber(l.pl)}
            </span>
            <span className={"num " + (l.pct >= 0 ? "pos" : "neg")} style={{ textAlign: "right", fontSize: 14 }}>
              {l.pct >= 0 ? "+" : ""}{l.pct.toFixed(2)}%
            </span>
            <span className="num muted" style={{ textAlign: "right", fontSize: 13 }}>{formatNumber(l.div)}</span>
          </div>
        ))}
      </div>

      {/* Transaction history */}
      <div className="ns-card" style={{ padding: 0 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>Transaction history · {txns.length} records</h3>
          <div style={{ flex: 1 }} />
          <button className="ns-btn" style={{ fontSize: 12.5 }} onClick={() => setAddOpen(true)}>
            <Plus size={13} strokeWidth={2} /> Add
          </button>
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
            <span className={"ns-pill " + (tx.action === "buy" ? "solid-pos" : tx.action === "sell" ? "solid-neg" : "")} style={{ fontSize: 10.5, justifySelf: "start", textTransform: "uppercase" }}>
              {tx.action}
            </span>
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
      </div>

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
