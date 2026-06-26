import { CaretRight, Plus, ArrowUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { ManualPriceSnapshotDraft } from "../data/repositories";
import { buildPositionMetrics, buildDailyPriceLookup, buildManualPriceLookup, priceAssetOnDate, calculateFifo, calculateXirr, formatNumber, formatPrice, formatQuantity, resolveAssetName, resolveSectorLabel, XIRR_MIN_DAYS } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { AssetLogo } from "../components/AssetLogo";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Field, TextInput } from "../components/Field";
import { Skeleton } from "../components/coss/skeleton";
import { ToggleGroup, ToggleGroupItem } from "../components/coss/toggle-group";
import { InvestmentEntryDrawer } from "./InvestmentsAddSheet";
import { HoldingEditModal } from "./HoldingEditModal";
import { ManualPriceImportWizard } from "./ManualPriceImportWizard";
import { ChartLineUp, PencilSimple, UploadSimple } from "@phosphor-icons/react";

export function HoldingDetailRoute() {
  const params = useParams({ strict: false }) as any;
  const ticker = params.ticker || "";
  const navigate = useNavigate();
  
  const { assets, quotes, dailyPrices, accounts, investments, manualPriceSnapshots, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  // "auto" follows the Chinese-first app language (see i18n.ts) → zh-Hant.
  const nameLocale = useUiPreferences((state) => (state.nameLocale === "auto" ? "zh-Hant" : state.nameLocale));
  const showTradeMarkers = useUiPreferences((state) => state.showTradeMarkers);
  const setShowTradeMarkers = useUiPreferences((state) => state.setShowTradeMarkers);
  const [seg, setSeg] = useState("1y");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [priceFormOpen, setPriceFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [priceInput, setPriceInput] = useState("");
  const [priceDate, setPriceDate] = useState(todayStr);
  const [priceNote, setPriceNote] = useState("");
  const [priceMessage, setPriceMessage] = useState("");
  // Two-click inline confirm for deleting a manual-price snapshot (no window.confirm).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const createManualPrice = useRepositoryMutation(
    (repository, input: ManualPriceSnapshotDraft) => repository.createManualPriceSnapshot(input),
    ["manualPriceSnapshots", "assets", "accounts"],
  );
  const deleteManualPrice = useRepositoryMutation(
    (repository, id: string) => repository.deleteManualPriceSnapshot(id),
    ["manualPriceSnapshots", "assets", "accounts"],
  );

  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];
  const manualSnapshotRows = manualPriceSnapshots.data ?? [];

  const asset = useMemo(() => assetRows.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase()), [assetRows, ticker]);
  const quote = useMemo(() => quoteRows.find((q) => q.symbol.toUpperCase() === ticker.toUpperCase()), [quoteRows, ticker]);

  // Canonical valuation (quote → latest daily close → average cost) so this
  // page's market value agrees with the Dashboard and the 投資 list.
  const today = new Date().toISOString().slice(0, 10);
  const dailyPriceLookup = useMemo(() => buildDailyPriceLookup(dailyPriceRows), [dailyPriceRows]);
  const manualPriceLookup = useMemo(() => buildManualPriceLookup(manualSnapshotRows), [manualSnapshotRows]);
  const priced = useMemo(
    () => (asset ? priceAssetOnDate(asset, today, { todayIso: today, dailyPriceLookup, quote, manualPriceLookup }) : null),
    [asset, today, dailyPriceLookup, quote, manualPriceLookup],
  );
  // For custom assets, the latest manual-price snapshot drives the displayed
  // 手動價格 + its date.
  const isCustomAsset = asset?.assetType === "custom";
  const latestManualSnapshot = useMemo(() => {
    if (!asset) return null;
    return manualSnapshotRows
      .filter((snap) => snap.assetId === asset.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1) ?? null;
  }, [manualSnapshotRows, asset]);
  // Full manual-price history for this asset, newest first, for the editable log.
  const manualHistoryRows = useMemo(() => {
    if (!asset) return [];
    return manualSnapshotRows
      .filter((snap) => snap.assetId === asset.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [manualSnapshotRows, asset]);

  async function deleteManualSnapshot(id: string) {
    try {
      await deleteManualPrice.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch (error) {
      setPriceMessage(error instanceof Error ? error.message : "刪除失敗。");
    }
  }

  async function submitManualPrice() {
    setPriceMessage("");
    if (!asset) return;
    const price = Number(priceInput);
    if (!priceInput.trim() || !Number.isFinite(price) || price <= 0) {
      setPriceMessage("請輸入大於 0 的價格。");
      return;
    }
    if (!priceDate) {
      setPriceMessage("請選擇日期。");
      return;
    }
    try {
      await createManualPrice.mutateAsync({ assetId: asset.id, date: priceDate, price, note: priceNote.trim() });
      setPriceFormOpen(false);
      setPriceInput("");
      setPriceNote("");
      setPriceDate(todayStr);
    } catch (error) {
      setPriceMessage(error instanceof Error ? error.message : "價格更新失敗。");
    }
  }

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

  // Buy/sell markers for the price chart. A trade's date is snapped to the
  // nearest charted close date (trades can land on non-trading days) so the
  // ReferenceDot's category-axis x always matches a data point; y uses the
  // trade's own price so the marker sits where you actually transacted.
  const tradeMarkers = useMemo(() => {
    if (series.length === 0) return [] as Array<{ date: string; price: number; action: "buy" | "sell" }>;
    const seriesDates = series.map((p) => p.date);
    const closeByDate = new Map(series.map((p) => [p.date, p.price]));
    const snap = (date: string): string | null => {
      const d = date.slice(0, 10);
      if (d < seriesDates[0] || d > seriesDates[seriesDates.length - 1]) return null;
      let best = seriesDates[0];
      let bestGap = Infinity;
      for (const sd of seriesDates) {
        const gap = Math.abs(Date.parse(sd) - Date.parse(d));
        if (gap < bestGap) { bestGap = gap; best = sd; }
      }
      return best;
    };
    return txns
      .filter((t) => t.action === "buy" || t.action === "sell")
      .map((t) => {
        const snapped = snap(t.date);
        return snapped ? { date: snapped, price: closeByDate.get(snapped) ?? t.price, action: t.action as "buy" | "sell" } : null;
      })
      .filter((m): m is { date: string; price: number; action: "buy" | "sell" } => m !== null);
  }, [txns, series]);

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

  // Moving-average position metrics + money-weighted (XIRR) return. Computed
  // before the early return below so the Hooks order stays stable while
  // `asset` is still loading (null). Terminal market value is null-safe here.
  const metrics = useMemo(() => buildPositionMetrics(txns), [txns]);
  const xirrMarketValue = asset ? (priced ? priced.value : asset.averageCost) * asset.totalQuantity : 0;
  const xirr = useMemo(
    () => calculateXirr(metrics.cashflows, { date: new Date().toISOString().slice(0, 10), amount: xirrMarketValue }),
    [metrics, xirrMarketValue],
  );

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-40" />
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

  const realizedGain = metrics.realizedGain;

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
      <div className="text-body" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, color: "var(--ns-fg-muted)" }}>
        <span style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/investments" })}>持倉投資</span>
        <CaretRight size={13} />
        <span className="mono" style={{ fontWeight: 500, color: "var(--ns-fg)" }}>{asset.ticker}</span>
      </div>

      {/* Hero header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <AssetLogo ticker={asset.ticker} name={resolveAssetName(asset, nameLocale)} size={52} />
          <div>
            <div className="mono text-body" style={{ marginBottom: 2, letterSpacing: 0.04, color: "var(--ns-fg-muted)", textTransform: "uppercase" }}>
              {asset.assetType || "資產"} · {asset.ticker}
            </div>
            <h1 className="text-[24px]" style={{ fontFamily: "var(--ns-font-display)", margin: "0 0 4px", fontWeight: 600, letterSpacing: -0.02 }}>
              {resolveAssetName(asset, nameLocale)}
            </h1>
            <div style={{ display: "flex", gap: 8 }}>
              {resolveSectorLabel(asset.sector, nameLocale) && <Badge variant="outline" className="rounded-full">{resolveSectorLabel(asset.sector, nameLocale)}</Badge>}
              <Badge variant="outline" className="rounded-full">{formatQuantity(asset.totalQuantity)} 股</Badge>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={() => setEditOpen(true)}><PencilSimple size={14} />編輯持倉</Button>
          {isCustomAsset ? (
            <>
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                <UploadSimple size={14} />匯入價格
              </Button>
              <Button onClick={() => { setPriceFormOpen((open) => !open); setPriceMessage(""); }}>
                <Plus size={14} weight="bold" />更新價格
              </Button>
            </>
          ) : (
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={14} weight="bold" />新增交易
            </Button>
          )}
        </div>
      </div>

      {/* Custom asset: manual-price indicator + inline 更新價格 form */}
      {isCustomAsset ? (
        <Card style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="muted text-xs" style={{ textTransform: "uppercase", letterSpacing: 0.04 }}>手動價格</span>
            {latestManualSnapshot ? (
              <>
                <span className="mono" style={{ fontWeight: 600 }}>{formatPrice(latestManualSnapshot.price)} {asset.currency}</span>
                <span className="muted text-xs">更新於 {latestManualSnapshot.date}</span>
              </>
            ) : (
              <span className="muted text-sm">尚未更新價格，目前以平均成本 {formatPrice(asset.averageCost)} {asset.currency} 計價。</span>
            )}
          </div>
          {priceFormOpen ? (
            <div className="grid gap-3" style={{ marginTop: 16 }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                <Field label="價格">
                  <TextInput
                    type="number"
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                    placeholder={String(asset.averageCost)}
                  />
                </Field>
                <Field label="日期">
                  <TextInput type="date" value={priceDate} onChange={(event) => setPriceDate(event.target.value)} />
                </Field>
              </div>
              <Field label="備註（選填）">
                <TextInput value={priceNote} onChange={(event) => setPriceNote(event.target.value)} placeholder="例如：最新估值" />
              </Field>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button onClick={submitManualPrice} disabled={createManualPrice.isPending}>
                  {createManualPrice.isPending ? "儲存中…" : "儲存價格"}
                </Button>
                <Button variant="ghost" onClick={() => { setPriceFormOpen(false); setPriceMessage(""); }}>取消</Button>
                {priceMessage ? <span className="text-sm" style={{ color: "var(--ns-danger, #d33)" }}>{priceMessage}</span> : null}
              </div>
            </div>
          ) : null}

          {/* Manual-price history — date / price / note, newest first, each
              deletable via a two-click inline confirm (no window.confirm). */}
          {manualHistoryRows.length > 0 ? (
            <div style={{ marginTop: 18, borderTop: "1px solid var(--ns-border)", paddingTop: 14 }}>
              <div className="muted text-xs" style={{ textTransform: "uppercase", letterSpacing: 0.04, marginBottom: 8 }}>價格紀錄 · {manualHistoryRows.length}</div>
              <div className="grid" style={{ gap: 2 }}>
                {manualHistoryRows.map((snap) => (
                  <div
                    key={snap.id}
                    style={{
                      display: "grid", gridTemplateColumns: "110px 1fr 1.2fr auto", gap: 12,
                      alignItems: "center", padding: "8px 0",
                    }}
                  >
                    <span className="mono muted text-xs">{snap.date}</span>
                    <span className="mono text-body" style={{ fontWeight: 500, textAlign: "right" }}>{formatPrice(snap.price)} {asset.currency}</span>
                    <span className="muted text-xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={snap.note}>{snap.note || "—"}</span>
                    {confirmDeleteId === snap.id ? (
                      <span style={{ display: "flex", gap: 6, justifySelf: "end" }}>
                        <Button variant="ghost" size="sm" onClick={() => deleteManualSnapshot(snap.id)} disabled={deleteManualPrice.isPending} style={{ color: "var(--ns-danger, #d33)" }}>確認刪除</Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>取消</Button>
                      </span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { setConfirmDeleteId(snap.id); setPriceMessage(""); }} style={{ justifySelf: "end" }}>刪除</Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Price + position */}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1fr_360px]" style={{ marginBottom: 20 }}>
        {/* Chart card */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="ns-num-lg mono">{formatPrice(marketPrice)}</span>
                <span className="dim mono text-body">{asset.currency}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
                <Badge variant={pos ? "success" : "error"} className="gap-1 rounded-full px-2">
                  {pos && <ArrowUp size={11} strokeWidth={2} />}
                  <span className="num">{pos ? "+" : ""}{formatNumber(unrealizedGain)}</span>
                </Badge>
                <Badge variant={pos ? "success" : "error"} className="rounded-full px-2">
                  <span className="num">{pos ? "+" : ""}{unrealizedGainPercent.toFixed(2)}% (Total)</span>
                </Badge>
                {quote?.updatedAt && <span className="muted mono text-xs">更新 {new Date(quote.updatedAt).toLocaleTimeString()}</span>}
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
                  <Tooltip
                    formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "price"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
                    itemStyle={{ color: "var(--ns-fg)" }}
                    labelStyle={{ color: "var(--ns-fg)" }}
                  />
                  <Area type="monotone" dataKey="price" stroke={markColor} fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
                  {showTradeMarkers && tradeMarkers.map((m, i) => (
                    <ReferenceDot
                      key={`${m.date}-${i}`}
                      x={m.date}
                      y={m.price}
                      r={0}
                      ifOverflow="hidden"
                      shape={(props: { cx?: number; cy?: number }) => <TradeMarker cx={props.cx ?? 0} cy={props.cy ?? 0} action={m.action} />}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "rgba(164, 219, 108, 0.2)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <ChartLineUp size={24} color="var(--ns-chart-1)" />
                </div>
                <div className="text-[15px]" style={{ fontWeight: 600, marginBottom: 8 }}>還沒有足夠的歷史股價</div>
                <div className="muted text-body" style={{ textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
                  先用「更新報價」或在編輯頁新增歷史快照，這裡就會依所選區間畫出投資市值趨勢。
                </div>
              </div>
            )}
          </div>
          {/* Buy/sell marker legend + toggle (only when there are trades to mark) */}
          {series.length > 0 && tradeMarkers.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
              <label className="text-xs" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--ns-fg-muted)" }}>
                <input type="checkbox" checked={showTradeMarkers} onChange={(e) => setShowTradeMarkers(e.target.checked)} />
                顯示買賣標記
              </label>
              {showTradeMarkers ? (
                <div className="text-caption" style={{ display: "flex", gap: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width={11} height={11} viewBox="0 0 11 11"><path d="M5.5 1 L10 9 L1 9 Z" fill="var(--ns-gain)" /></svg>
                    <span className="muted">買進</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width={11} height={11} viewBox="0 0 11 11"><path d="M5.5 10 L10 2 L1 2 Z" fill="var(--ns-loss)" /></svg>
                    <span className="muted">賣出</span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {/* Position summary — stretches to the chart card's height so the two
            cards line up top and bottom; stats distribute to fill. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{ padding: 20, flex: 1 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 12 }}>你的部位 · 平均成本</div>
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
                  <div className="muted text-caption">{l}</div>
                  <div className={"num text-base " + (c || "")} style={{ fontWeight: 500 }} title={t ?? undefined}>{v}</div>
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
          <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>稅務批次 (FIFO) · {lots.length}</h3>
          <div style={{ flex: 1 }} />
          <span className="muted mono text-caption">FIFO 批次成本，僅供稅務參考</span>
        </div>
        {lots.length > 0 ? (
          <>
            <div
              className="text-caption"
              style={{
                display: "grid", gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr",
                padding: "10px 22px", borderBottom: "1px solid var(--ns-border)",
                color: "var(--ns-fg-dim)", fontFamily: "var(--ns-font-mono)",
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
                <span className="mono muted text-body">{l.date}</span>
                <span className="num text-body" style={{ textAlign: "right" }}>{formatQuantity(l.qty)}</span>
                <span className="num muted text-body" style={{ textAlign: "right" }}>{formatPrice(l.cost)}</span>
                <span className="num text-body" style={{ textAlign: "right" }}>{formatPrice(l.last)}</span>
                <span className={"num text-sm " + (l.pl >= 0 ? "gain" : "loss")} style={{ textAlign: "right", fontWeight: 500 }}>
                  {l.pl >= 0 ? "+" : ""}{formatNumber(l.pl)}
                </span>
                <span className={"num text-sm " + (l.pct >= 0 ? "gain" : "loss")} style={{ textAlign: "right" }}>
                  {l.pct >= 0 ? "+" : ""}{l.pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="muted text-body" style={{ padding: "28px 22px", textAlign: "center" }}>目前無未平倉部位</div>
        )}
      </Card>

      {/* Transaction history */}
      <Card style={{ padding: 0 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center" }}>
          <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>交易紀錄 · {txns.length} 筆</h3>
          <div style={{ flex: 1 }} />
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} weight="bold" /> 新增
          </Button>
        </div>
        {txns.length > 0 ? (
          txns.map((tx, i) => (
            <div
              key={tx.id}
              style={{
                display: "grid", gridTemplateColumns: "100px 80px 0.7fr 0.9fr 0.9fr 1fr 1fr",
                gap: 0, padding: "13px 22px", borderTop: i ? "1px solid var(--ns-border)" : "none",
                alignItems: "center",
              }}
            >
              <span className="mono muted text-xs">{tx.date}</span>
              <Badge variant={tx.action === "buy" ? "success" : tx.action === "sell" ? "error" : "secondary"} className="rounded-full uppercase" style={{ justifySelf: "start" }}>
                {tx.action}
              </Badge>
              <span className="num text-body" style={{ textAlign: "right" }}>{formatQuantity(tx.quantity)}</span>
              <span className="num text-body" style={{ textAlign: "right" }}>{formatPrice(tx.price)}</span>
              <span className="num muted text-xs" style={{ textAlign: "right" }}>fee {tx.fee || "–"}</span>
              <span className={"num text-sm " + (tx.action === "sell" ? "pos" : tx.action === "buy" ? "" : "pos")} style={{ textAlign: "right", fontWeight: 500 }}>
                {tx.action === "sell" ? "+" : tx.action === "cashDividend" ? "+" : "−"}{formatNumber(tx.quantity * tx.price)}
              </span>
              <span className="muted text-xs" style={{ textAlign: "right" }}>
                {accountRows.find(a => a.id === tx.linkedAccountId)?.name || "–"}
              </span>
            </div>
          ))
        ) : (
          <div className="muted text-body" style={{ padding: "28px 22px", textAlign: "center" }}>尚無交易紀錄</div>
        )}
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

      {importOpen && asset && (
        <ManualPriceImportWizard
          open={importOpen}
          onClose={() => setImportOpen(false)}
          assetId={asset.id}
          assetLabel={resolveAssetName(asset, nameLocale)}
          currency={asset.currency}
          onImport={async (drafts) => {
            for (const draft of drafts) {
              await createManualPrice.mutateAsync(draft);
            }
          }}
        />
      )}
    </div>
  );
}

/** Triangle marker on the price chart: up (buy, green) / down (sell, red). */
function TradeMarker({ cx, cy, action }: { cx: number; cy: number; action: "buy" | "sell" }) {
  const color = action === "buy" ? "var(--ns-gain)" : "var(--ns-loss)";
  // Buy points up and sits just below the line; sell points down and sits above.
  const d = action === "buy"
    ? `M ${cx} ${cy + 2} L ${cx - 5} ${cy + 11} L ${cx + 5} ${cy + 11} Z`
    : `M ${cx} ${cy - 2} L ${cx - 5} ${cy - 11} L ${cx + 5} ${cy - 11} Z`;
  return <path d={d} fill={color} stroke="var(--ns-bg-elev)" strokeWidth={1} />;
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
