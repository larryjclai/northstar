import { ArrowsClockwise, ChartLineUp, Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card as CossCard } from "../components/coss/card";
import { Button } from "../components/coss/button";
import { EmptyState } from "../components/EmptyState";
import { SegmentedControl } from "../components/SegmentedControl";
import { TickerSearchField } from "../components/TickerSearchField";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { useUiPreferences } from "../state/uiPreferences";
import {
  annualizedVolatilityPct,
  buildBenchmarkSeries,
  buildPortfolioTwr,
  buildPortfolioValueSeries,
  buildCurrencyExposure,
  buildDividendAnalysis,
  buildPositionMetrics,
  buildReturnAttribution,
  calculateXirr,
  cashflowSpanDays,
  cumulativeReturnPct,
  dailyReturns,
  DEFAULT_RISK_FREE_RATE,
  hasEnoughReturns,
  maxDrawdown,
  MIN_ANALYTICS_DAYS,
  rollingVolatilityPct,
  sharpeRatio,
  sortinoRatio,
  toCumulativeReturnSeries,
  alignByDate,
  XIRR_MIN_DAYS,
  type AnalyticsPosition,
  type DailyPrice,
  type InvestmentRecord,
  type ManualPriceSnapshot,
  formatMoney,
} from "../domain";

const CHART_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
  "#2dd4bf",
  "#fb923c",
];

const VOL_THRESHOLD = 20;

/** Wealthfolio-style quick picks for the in-chart benchmark switcher. */
const BENCHMARK_PRESETS: Array<{ ticker: string; name: string; note: string }> = [
  { ticker: "0050.TW", name: "元大台灣50", note: "台股大盤代理" },
  { ticker: "^TWII", name: "加權指數", note: "台股大盤" },
  { ticker: "^GSPC", name: "S&P 500", note: "美股大型股" },
  { ticker: "^NDX", name: "Nasdaq 100", note: "美股科技股" },
  { ticker: "VT", name: "Vanguard Total World", note: "全球股市 ETF" },
];

function BenchmarkPicker({ current }: { current: string }) {
  const setBenchmarkTicker = useUiPreferences((state) => state.setBenchmarkTicker);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function choose(ticker: string) {
    setBenchmarkTicker(ticker);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <button
          type="button"
          className="ns-input text-xs"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", cursor: "pointer" }}
          title="更換比較指標"
        >
          <ChartLineUp size={13} />
          <span className="mono">{current}</span>
          <span className="muted text-caption">更換指標</span>
        </button>
      } />
      <PopoverContent align="end" style={{ width: 300, padding: 10 }}>
        <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>常用指標</div>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
          {BENCHMARK_PRESETS.map((preset) => (
            <button
              key={preset.ticker}
              type="button"
              onClick={() => choose(preset.ticker)}
              style={{
                display: "flex", alignItems: "baseline", gap: 8, padding: "7px 8px", borderRadius: "var(--ns-r-xs)",
                cursor: "pointer", textAlign: "left", border: "none",
                background: preset.ticker === current ? "var(--ns-accent-soft)" : "transparent",
              }}
            >
              <span className="mono text-xs" style={{ fontWeight: 600, flexShrink: 0 }}>{preset.ticker}</span>
              <span className="text-xs" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preset.name}</span>
              <span className="dim text-micro" style={{ marginLeft: "auto", flexShrink: 0 }}>{preset.note}</span>
            </button>
          ))}
        </div>
        <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>或搜尋任意代號</div>
        <TickerSearchField
          value={query}
          onChange={setQuery}
          onSelect={(result) => choose(result.symbol)}
          placeholder="例：QQQ、VWRA.L、2330.TW"
        />
      </PopoverContent>
    </Popover>
  );
}

type AnalyticsPeriod = "3M" | "6M" | "YTD" | "1Y" | "ALL";
const PERIODS: AnalyticsPeriod[] = ["3M", "6M", "YTD", "1Y", "ALL"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number, end: string): string {
  const d = new Date(`${end}T00:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function periodStart(period: AnalyticsPeriod, end: string): string {
  if (period === "ALL") return "1900-01-01";
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<AnalyticsPeriod, "ALL" | "YTD">, number> = { "3M": 92, "6M": 183, "1Y": 365 };
  return daysAgo(days[period], end);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function rollingMetric(returns: number[], window: number, fn: (r: number[]) => number | null): Array<number | null> {
  return returns.map((_, i) => (i + 1 < window ? null : fn(returns.slice(i + 1 - window, i + 1))));
}

function underwaterSeries(values: number[]): number[] {
  let peak = values[0] ?? 0;
  return values.map((v) => {
    if (v > peak) peak = v;
    return peak > 0 ? (v / peak - 1) * 100 : 0;
  });
}

function fmtPct(v: number | null, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
}

function fmtRatio(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function Sparkline({ data, color, width = 60, height = 26 }: { data: Array<number | null>; color: string; width?: number; height?: number }) {
  const pts = data.filter((v): v is number => v != null && Number.isFinite(v));
  if (pts.length < 2) return <svg width={width} height={height} style={{ display: "block" }} />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const h = height - pad * 2;
  const path = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (pts.length - 1)) * width).toFixed(1)},${(pad + (1 - (v - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  positions: AnalyticsPosition[];
  records: InvestmentRecord[];
  dailyPrices: DailyPrice[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  allAssetMeta: Map<string, { ticker: string; currency: string }>;
  benchmarkTicker: string;
  primaryCurrency: string;
  onBackfillHoldings: (range: "1y" | "5y") => void | Promise<void>;
  onEnsureBenchmark: (ticker: string) => void | Promise<void>;
  backfilling: boolean;
}

export function InvestmentsAnalyticsTab({
  positions,
  records,
  dailyPrices,
  manualSnapshots,
  toPrimary,
  allAssetMeta,
  benchmarkTicker,
  primaryCurrency,
  onBackfillHoldings,
  onEnsureBenchmark,
  backfilling,
}: Props) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("1Y");
  const end = todayStr();

  const attempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    const t = benchmarkTicker.toUpperCase();
    if (!t || attempted.current.has(t)) return;
    const count = dailyPrices.reduce((n, p) => (p.ticker.toUpperCase() === t ? n + 1 : n), 0);
    if (count >= MIN_ANALYTICS_DAYS) return;
    attempted.current.add(t);
    void onEnsureBenchmark(benchmarkTicker);
  }, [benchmarkTicker, dailyPrices, onEnsureBenchmark]);

  const core = useMemo(() => {
    const start = periodStart(period, end);
    const { series, excludedTickers } = buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });
    const values = series.map((p) => p.value);
    const returns = dailyReturns(values);
    return { series, values, returns, excludedTickers };
  }, [positions, dailyPrices, manualSnapshots, toPrimary, period, end]);

  const enough = hasEnoughReturns(core.returns);

  const periodSummary = useMemo(() => {
    const startValue = core.values[0] ?? null;
    const endValue = core.values.length ? core.values[core.values.length - 1] : null;
    const change = startValue != null && endValue != null ? endValue - startValue : null;
    const changePct = enough ? cumulativeReturnPct(core.values) : null;
    return { startValue, endValue, change, changePct };
  }, [core.values, enough]);

  const kpis = useMemo(() => {
    if (!enough) return null;
    const { values, returns } = core;
    const vol = annualizedVolatilityPct(returns);
    const sortino = sortinoRatio(returns);
    const sharpe = sharpeRatio(returns);
    const dd = maxDrawdown(values, core.series.map((p) => p.date));
    return {
      vol,
      sortino,
      sharpe,
      dd,
      volSpark: rollingVolatilityPct(returns, 30),
      sortinoSpark: rollingMetric(returns, 60, (r) => sortinoRatio(r)),
      sharpeSpark: rollingMetric(returns, 60, (r) => sharpeRatio(r)),
      ddSpark: underwaterSeries(values),
    };
  }, [core, enough]);

  const twrResult = useMemo(() => {
    const start = periodStart(period, end);
    return buildPortfolioTwr({ positions, records, dailyPrices, toPrimary, start, end });
  }, [positions, records, dailyPrices, toPrimary, period, end]);

  const xirrResult = useMemo(() => {
    const byAsset = new Map<string, InvestmentRecord[]>();
    for (const r of records) {
      if (r.deletedAt !== null) continue;
      const arr = byAsset.get(r.assetId) ?? [];
      arr.push(r);
      byAsset.set(r.assetId, arr);
    }
    const allCashflows: Array<{ date: string; amount: number }> = [];
    for (const recs of byAsset.values()) {
      const { cashflows } = buildPositionMetrics(recs);
      allCashflows.push(...cashflows);
    }
    if (allCashflows.length === 0) return { xirr: null, gated: true };
    const span = cashflowSpanDays(allCashflows, end);
    if (span < XIRR_MIN_DAYS) return { xirr: null, gated: true };
    const fullSeries = buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start: "1900-01-01", end });
    const lastValue = fullSeries.series.length > 0 ? fullSeries.series[fullSeries.series.length - 1].value : 0;
    const terminal = { date: end, amount: lastValue };
    const xirr = calculateXirr(allCashflows, terminal);
    return { xirr, gated: false };
  }, [positions, records, dailyPrices, manualSnapshots, toPrimary, end]);

  const attribution = useMemo(() => {
    const start = periodStart(period, end);
    return buildReturnAttribution({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });
  }, [positions, dailyPrices, manualSnapshots, toPrimary, period, end]);

  const perf = useMemo(() => {
    const start = periodStart(period, end);
    const series = core.series;
    const bench = buildBenchmarkSeries(dailyPrices, benchmarkTicker, start, end);
    const aligned = bench.length >= 2 ? alignByDate(series, bench) : { a: series, b: [] as typeof bench };
    const portCum = toCumulativeReturnSeries(aligned.a);
    const benchCum = aligned.b.length >= 2 ? toCumulativeReturnSeries(aligned.b) : [];
    const benchByDate = new Map(benchCum.map((p) => [p.date, p.pct]));
    const data = portCum.map((p) => ({ date: p.date, port: p.pct, bench: benchByDate.has(p.date) ? benchByDate.get(p.date)! : null }));
    const portFinal = portCum.length ? portCum[portCum.length - 1].pct : null;
    const benchFinal = benchCum.length ? benchCum[benchCum.length - 1].pct : null;
    const alpha = portFinal != null && benchFinal != null ? portFinal - benchFinal : null;
    return { data, portFinal, benchFinal, alpha, hasBenchmark: benchCum.length >= 2 };
  }, [core.series, dailyPrices, benchmarkTicker, period, end]);

  const rolling = useMemo(() => {
    const start = daysAgo(365, end);
    const { series } = buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });
    const returns = dailyReturns(series.map((p) => p.value));
    const roll = rollingVolatilityPct(returns, 30);
    const data = roll
      .map((vol, i) => ({ date: series[i + 1]?.date ?? "", vol }))
      .filter((p) => p.vol != null && p.date) as Array<{ date: string; vol: number }>;
    const vals = data.map((p) => p.vol);
    const current = vals.length ? vals[vals.length - 1] : null;
    const avg90 = vals.length ? mean(vals.slice(-90)) : null;
    let peak: { vol: number; date: string } | null = null;
    for (const p of data) if (!peak || p.vol > peak.vol) peak = { vol: p.vol, date: p.date };
    return { data, current, avg90, peak };
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);

  const allocationSummary = useMemo(() => {
    const byClass = new Map<string, number>();
    let total = 0;
    let largestHolding: { label: string; value: number } | null = null;
    for (const position of positions) {
      const className = position.assetClass || "其他";
      const priced = latestPositionValue(position, dailyPrices, manualSnapshots, toPrimary, end);
      if (priced <= 0) continue;
      total += priced;
      byClass.set(className, (byClass.get(className) ?? 0) + priced);
      if (!largestHolding || priced > largestHolding.value) largestHolding = { label: position.ticker, value: priced };
    }
    const rows = [...byClass.entries()]
      .map(([label, value], index) => ({
        label,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
    const largestClass = rows[0] ?? null;
    const topHoldingPct = largestHolding && total > 0 ? (largestHolding.value / total) * 100 : null;
    return { rows, total, largestClass, largestHolding, topHoldingPct };
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);

  const currencyExposure = useMemo(() => {
    const entries = positions.map((p) => ({
      currency: p.currency,
      value: latestPositionValue(p, dailyPrices, manualSnapshots, toPrimary, end),
    }));
    return buildCurrencyExposure(entries);
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);

  const dividends = useMemo(() => {
    return buildDividendAnalysis({ records, assetMeta: allAssetMeta, toPrimary, currentMarketValue: allocationSummary.total, asOf: end });
  }, [records, allAssetMeta, toPrimary, allocationSummary.total, end]);

  // ── Whole-tab gating ───────────────────────────────────────────────────────
  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<ChartLineUp size={24} weight="duotone" />}
        title="尚無分析資料"
        description="新增持倉後，這裡會顯示風險指標、與大盤的比較、配置漂移與滾動波動率。"
      />
    );
  }
  if (!enough) {
    return (
      <EmptyState
        icon={<ChartLineUp size={24} weight="duotone" />}
        title="還沒有足夠的歷史股價"
        description={`分析需要至少 ${MIN_ANALYTICS_DAYS} 天的每日股價才能計算風險指標。回補歷史股價後即可使用。`}
        action={
          <Button onClick={() => onBackfillHoldings("1y")} loading={backfilling} disabled={backfilling}>
            {backfilling ? "回補中…" : "回補 1Y 歷史股價"}
          </Button>
        }
      />
    );
  }

  const periodOptions = PERIODS.map((p) => ({ value: p, label: p }));

  return (
    <div className="grid gap-5">

      {/* ── Hero: equity curve + period selector + three return measures ───── */}
      <CossCard style={{ padding: 34 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>期間報酬 · {period}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span
                className="num"
                style={{
                  fontSize: "clamp(42px, 5.5vw, 68px)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  lineHeight: 0.9,
                  color:
                    periodSummary.changePct == null
                      ? "var(--ns-fg)"
                      : periodSummary.changePct >= 0
                      ? "var(--ns-gain)"
                      : "var(--ns-loss)",
                }}
              >
                {fmtPct(periodSummary.changePct, 1)}
              </span>
              {periodSummary.change != null && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 11px",
                    borderRadius: 99,
                    fontSize: 13,
                    fontWeight: 500,
                    background: "var(--ns-accent-soft)",
                    color: "var(--ns-accent)",
                  }}
                >
                  {periodSummary.change >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(periodSummary.change), primaryCurrency)}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBackfillHoldings("1y")}
                loading={backfilling}
                disabled={backfilling}
                title="抓取所有持倉近 1 年的每日歷史股價"
              >
                <ArrowsClockwise size={13} />
                {backfilling ? "回補中…" : "回補歷史股價"}
              </Button>
              <SegmentedControl value={period} onChange={setPeriod} options={periodOptions} />
            </div>
            <div style={{ display: "flex", gap: 28 }}>
              {[
                { l: "期初市值", v: periodSummary.startValue == null ? "—" : formatMoney(periodSummary.startValue, primaryCurrency) },
                { l: "期末市值", v: periodSummary.endValue == null ? "—" : formatMoney(periodSummary.endValue, primaryCurrency) },
              ].map((s) => (
                <div key={s.l}>
                  <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{s.l}</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500, color: "var(--ns-fg-muted)" }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Equity curve — portfolio cumulative return for the selected period */}
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={perf.data}>
              <defs>
                <linearGradient id="anHeroPort" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--ns-gain)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--ns-gain)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--ns-fg-muted)" fontSize={11} minTickGap={28} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis stroke="var(--ns-fg-muted)" fontSize={11} width={42} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip
                formatter={(value: number) => [`${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`, "累積報酬"]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
                itemStyle={{ color: "var(--ns-fg)" }}
                labelStyle={{ color: "var(--ns-fg)" }}
              />
              <Area type="monotone" dataKey="port" stroke="var(--ns-gain)" fill="url(#anHeroPort)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {core.excludedTickers.length > 0 && (
          <div className="muted text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
            部分標的歷史股價不足，本期間未納入分析：{core.excludedTickers.join("、")}。回補更長區間的歷史股價即可納入。
          </div>
        )}

        {/* Three return measures (TWR / XIRR / price return) */}
        <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", overflow: "hidden" }}>
          {[
            {
              l: "期間 TWR",
              sub: "剔除進出金影響",
              v: twrResult.twrPct,
              help: "時間加權報酬：衡量持倉本身的表現，不受你加碼/減碼時點影響。",
            },
            {
              l: "年化 XIRR",
              sub: "考慮金流時間",
              v: xirrResult.gated ? null : xirrResult.xirr != null ? xirrResult.xirr * 100 : null,
              help: "金額加權年化報酬：把資金投入的時點與多寡也算進來，反映你實際的資金成果。",
            },
            {
              l: "期間價格報酬",
              sub: "市值帳面變化",
              v: periodSummary.changePct,
              help: "目前持倉籃子在此期間的價格漲跌，不含加減碼與配息。",
            },
          ].map((s, i) => (
            <div
              key={s.l}
              style={{ padding: "16px 20px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)" }}
            >
              <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                {s.l}
                <MetricHelp text={s.help} />
              </div>
              <div
                className="num"
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: s.v == null ? "var(--ns-fg)" : s.v >= 0 ? "var(--ns-gain)" : "var(--ns-loss)",
                  fontVariantNumeric: "tabular-nums",
                  marginBottom: 5,
                }}
              >
                {s.v == null ? "—" : `${s.v >= 0 ? "+" : "−"}${Math.abs(s.v).toFixed(1)}%`}
              </div>
              <div className="dim" style={{ fontSize: 11.5 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        {twrResult.excludedTickers && twrResult.excludedTickers.length > 0 && (
          <div className="muted text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
            部分標的歷史股價不足，未納入 TWR 計算：{twrResult.excludedTickers.join("、")}。
          </div>
        )}
      </CossCard>

      {/* ── Treemap feature band (placeholder — implemented in next release) ── */}
      <NSAnBand deep>
        <NSAnHead
          kicker="持倉熱度 · HOLDINGS HEATMAP"
          title="你的錢放在哪、誰在發動"
          right={<span className="mono dim" style={{ fontSize: 12 }}>方塊大小＝市值　顏色＝1Y 報酬</span>}
        />
        <div
          style={{
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--ns-r-md)",
            border: "1px dashed var(--ns-border)",
            color: "var(--ns-fg-dim)",
            fontSize: 13,
          }}
        >
          持倉熱圖 — 即將推出
        </div>
      </NSAnBand>

      {/* ── Portfolio vs Benchmark ──────────────────────────────────────────── */}
      <CossCard style={{ padding: 34 }}>
        <NSAnHead
          kicker="績效比較 · vs 指標"
          title={`投資組合 vs ${benchmarkTicker}`}
          right={<BenchmarkPicker current={benchmarkTicker} />}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", overflow: "hidden", marginBottom: 16 }}>
          {[
            { label: "投資組合", val: perf.portFinal, color: perf.portFinal != null && perf.portFinal >= 0 ? "var(--ns-gain)" : "var(--ns-loss)", help: undefined },
            { label: `${benchmarkTicker} 指標`, val: perf.benchFinal, color: "var(--ns-fg-muted)", help: undefined },
            { label: "Alpha", val: perf.alpha, color: perf.alpha != null && perf.alpha >= 0 ? "var(--ns-accent)" : "var(--ns-loss)", help: "投資組合報酬減掉指標報酬。正數代表本期間跑贏指標，負數代表落後。" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "12px 16px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
              <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                {s.label}{s.help ? <MetricHelp text={s.help} /> : null}
              </div>
              <div className="num text-stat" style={{ fontWeight: 600, fontFamily: "var(--ns-font-num)", color: s.color, fontVariantNumeric: "tabular-nums" }}>
                {s.val == null ? "—" : `${s.val >= 0 ? "+" : "−"}${Math.abs(s.val).toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={perf.data}>
              <defs>
                <linearGradient id="anAlphaPort" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--ns-fg-muted)" fontSize={11} minTickGap={28} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis stroke="var(--ns-fg-muted)" fontSize={11} width={42} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip
                formatter={(value: number, name) => [`${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`, name === "port" ? "投資組合" : benchmarkTicker]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
                itemStyle={{ color: "var(--ns-fg)" }}
                labelStyle={{ color: "var(--ns-fg)" }}
              />
              <Area type="monotone" dataKey="port" stroke="var(--ns-accent)" fill="url(#anAlphaPort)" strokeWidth={2} isAnimationActive={false} />
              {perf.hasBenchmark ? (
                <Line type="monotone" dataKey="bench" stroke="var(--ns-fg-dim)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="text-caption" style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "var(--ns-accent)" }} />
            <span className="muted">投資組合（累積報酬）</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: "1px dashed var(--ns-fg-dim)" }} />
            <span className="muted">{perf.hasBenchmark ? `${benchmarkTicker} 指標` : `尚無 ${benchmarkTicker} 歷史股價`}</span>
          </span>
        </div>
      </CossCard>

      {/* ── Allocation + Currency feature band ──────────────────────────────── */}
      <NSAnBand deep>
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "start" }}>
          <div>
            <NSAnHead kicker="配置 · ALLOCATION" title="資產類別分布" />
            {allocationSummary.rows.length > 0 ? (
              <AnAllocBars rows={allocationSummary.rows} />
            ) : (
              <div className="muted text-body" style={{ padding: "24px 0" }}>目前持倉缺少最新價格，無法估算配置。</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {currencyExposure.currencyCount >= 2 && (
              <div>
                <NSAnHead kicker="幣別曝險 · CURRENCY" title="持倉的幣別分布" />
                <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
                  {currencyExposure.items.map((it, i) => (
                    <div key={it.currency} style={{ width: `${it.pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {currencyExposure.items.map((it, i) => (
                    <div
                      key={it.currency}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--ns-border)" }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                      <span className="mono" style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{it.currency}</span>
                      <span className="num muted" style={{ fontSize: 12.5 }}>{formatMoney(it.value, primaryCurrency)}</span>
                      <span className="num" style={{ fontSize: 13, fontWeight: 600, minWidth: 50, textAlign: "right" }}>{it.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <NSAnHead kicker="集中度 · CONCENTRATION" title="最大持倉佔比" />
              <div style={{ display: "flex", gap: 28 }}>
                <div>
                  <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>最大資產類別</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{allocationSummary.largestClass?.label ?? "—"}</div>
                  <div className="mono muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {allocationSummary.largestClass ? `${allocationSummary.largestClass.pct.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>最大單一持倉</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{allocationSummary.largestHolding?.label ?? "—"}</div>
                  <div className="mono muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {allocationSummary.topHoldingPct == null ? "—" : `${allocationSummary.topHoldingPct.toFixed(1)}%`}
                  </div>
                </div>
              </div>
              <div className="muted text-caption" style={{ marginTop: 14 }}>
                可計價市值 {formatMoney(allocationSummary.total, primaryCurrency)}
              </div>
            </div>
          </div>
        </div>
      </NSAnBand>

      {/* ── Calendar heatmap (placeholder — implemented in next release) ─────── */}
      <CossCard style={{ padding: 34 }}>
        <NSAnHead
          kicker="報酬節奏 · DAILY RETURNS"
          title="一整年的賺賠日曆"
          right={<span className="mono dim" style={{ fontSize: 12 }}>每格＝單日報酬</span>}
        />
        <div
          style={{
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--ns-r-md)",
            border: "1px dashed var(--ns-border)",
            color: "var(--ns-fg-dim)",
            fontSize: 13,
          }}
        >
          日曆熱圖 — 即將推出
        </div>
      </CossCard>

      {/* ── Dividends + Risk (2-column) ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: dividends.total > 0 ? "1fr 1fr" : "1fr", gap: 20 }}>
        {dividends.total > 0 && (
          <CossCard style={{ padding: 34 }}>
            <NSAnHead
              kicker="股利所得 · DIVIDENDS"
              title="逐年配息成長"
              right={
                dividends.byYear.length >= 2 ? (
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "4px 11px",
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--ns-pos-soft)",
                      color: "var(--ns-pos)",
                    }}
                  >
                    {dividends.byYear.length} 年紀錄
                  </span>
                ) : null
              }
            />
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 22 }}>
              {[
                { l: "近一年股利 (TTM)", v: formatMoney(dividends.ttmTotal, primaryCurrency), help: "近 365 天收到的現金股利合計。" },
                { l: "近一年殖利率", v: dividends.yieldPct == null ? "—" : `${dividends.yieldPct.toFixed(2)}%`, help: "近一年股利 ÷ 目前持倉市值。" },
                { l: "累計股利", v: formatMoney(dividends.total, primaryCurrency), help: "有紀錄以來的現金股利合計（淨額）。" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    {s.l}<MetricHelp text={s.help} />
                  </div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 600, color: "var(--ns-gain)", fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 10 }}>年度股利</div>
                {(() => {
                  const max = Math.max(...dividends.byYear.map((y) => y.total), 1);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {dividends.byYear.map((y) => (
                        <div key={y.year} style={{ display: "grid", gridTemplateColumns: "48px 1fr 110px", gap: 10, alignItems: "center" }}>
                          <span className="mono muted text-xs">{y.year}</span>
                          <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                            <div style={{ width: `${(y.total / max) * 100}%`, height: "100%", background: "var(--ns-gain)", borderRadius: 99 }} />
                          </div>
                          <span className="num text-xs" style={{ textAlign: "right" }}>{formatMoney(y.total, primaryCurrency)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 10 }}>個股股利貢獻</div>
                {(() => {
                  const max = Math.max(...dividends.byHolding.map((h) => h.total), 1);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {dividends.byHolding.slice(0, 6).map((h) => (
                        <div key={h.assetId} style={{ display: "grid", gridTemplateColumns: "96px 1fr 110px", gap: 10, alignItems: "center" }}>
                          <span className="mono text-xs" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.ticker}</span>
                          <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                            <div style={{ width: `${(h.total / max) * 100}%`, height: "100%", background: "var(--ns-chart-3)", borderRadius: 99 }} />
                          </div>
                          <span className="num text-xs" style={{ textAlign: "right" }}>{formatMoney(h.total, primaryCurrency)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </CossCard>
        )}

        <CossCard style={{ padding: 34 }}>
          <NSAnHead kicker="風險 · RISK" title="波動、下跌與報酬品質" />
          {kpis ? (
            <>
              <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 16 }}>
                <KpiCard
                  label="年化波動率"
                  note="Annual Volatility"
                  value={fmtPct(kpis.vol, 1)}
                  color="var(--ns-chart-2)"
                  spark={kpis.volSpark}
                  sub="日報酬標準差換算成年化"
                  help="衡量期間內報酬上下震盪的幅度。數字越高，代表市值波動越大；它不分上漲或下跌，只看波動程度。"
                />
                <KpiCard
                  label="Sortino 比率"
                  note="越高越好"
                  value={fmtRatio(kpis.sortino)}
                  color="var(--ns-pos)"
                  spark={kpis.sortinoSpark}
                  sub={`只懲罰下跌波動 · MAR ${(DEFAULT_RISK_FREE_RATE * 100).toFixed(1)}%`}
                  help="衡量每承擔一單位下跌風險，換到多少超額報酬。比 Sharpe 更重視真正讓人不舒服的下跌波動。"
                />
                <KpiCard
                  label="Sharpe 比率"
                  note="越高越好"
                  value={fmtRatio(kpis.sharpe)}
                  color="var(--ns-chart-1)"
                  spark={kpis.sharpeSpark}
                  sub={`相對無風險利率 ${(DEFAULT_RISK_FREE_RATE * 100).toFixed(1)}%`}
                  help="衡量每承擔一單位總波動，換到多少超額報酬。常用來比較不同投資組合的風險調整後表現。"
                />
                <KpiCard
                  label="最大回撤"
                  note="Max Drawdown"
                  value={fmtPct(kpis.dd.drawdownPct, 1)}
                  color="var(--ns-neg)"
                  spark={kpis.ddSpark}
                  sub={kpis.dd.troughDate ? `${kpis.dd.peakDate} → ${kpis.dd.troughDate} · ${kpis.dd.recovered ? "已恢復" : "未恢復"}` : "—"}
                  help="期間內從高點跌到低點的最大跌幅。它回答的是：這段時間最痛的一段下跌有多深。"
                />
              </div>
              {kpis.dd.drawdownPct != null && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--ns-r-md)",
                    background: "var(--ns-neg-soft)",
                    border: "1px solid color-mix(in srgb, var(--ns-neg) 30%, transparent)",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                  }}
                >
                  <span className="neg" style={{ fontWeight: 600 }}>回撤提醒 · </span>
                  <span className="muted">
                    期間最大跌幅 {fmtPct(kpis.dd.drawdownPct, 1)}
                    {kpis.dd.peakDate && kpis.dd.troughDate ? `（${kpis.dd.peakDate} → ${kpis.dd.troughDate}）` : ""}，
                    {kpis.dd.recovered ? "目前已恢復至高點。" : "目前尚未恢復。"}
                  </span>
                </div>
              )}
            </>
          ) : null}
        </CossCard>
      </div>

      {/* ── Rolling volatility + drawdown detail ────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RollingVolatilityCard rolling={rolling} />
        {kpis ? <DrawdownStatusCard drawdown={kpis.dd} values={core.values} primaryCurrency={primaryCurrency} /> : null}
      </div>

      {/* ── Return attribution ──────────────────────────────────────────────── */}
      {attribution.items.length > 0 ? (
        <CossCard style={{ padding: 34 }}>
          <NSAnHead kicker="報酬貢獻" title="哪些持倉驅動了報酬" />
          {(() => {
            const TOP = 6;
            const shown = attribution.items.slice(0, TOP);
            const rest = attribution.items.slice(TOP);
            const restSum = rest.reduce((s, it) => s + it.contribution, 0);
            const rows = [...shown.map((it) => ({ label: it.ticker, contribution: it.contribution, pct: it.pct }))];
            if (rest.length > 0)
              rows.push({
                label: `其他 ${rest.length} 檔`,
                contribution: restSum,
                pct: Math.abs(attribution.total) > 0 ? (restSum / attribution.total) * 100 : 0,
              });
            const maxAbs = Math.max(...rows.map((r) => Math.abs(r.contribution)), 1);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r) => {
                  const up = r.contribution >= 0;
                  const color = up ? "var(--ns-gain)" : "var(--ns-loss)";
                  return (
                    <div key={r.label} style={{ display: "grid", gridTemplateColumns: "96px 1fr 150px", gap: 12, alignItems: "center" }}>
                      <span className="mono text-xs" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                      <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                        <div style={{ width: `${(Math.abs(r.contribution) / maxAbs) * 100}%`, height: "100%", background: color, borderRadius: 99 }} />
                      </div>
                      <div className="text-xs" style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <span className="num" style={{ color }}>{up ? "+" : "−"}{formatMoney(Math.abs(r.contribution), primaryCurrency)}</span>
                        <span className="num muted" style={{ minWidth: 48, textAlign: "right" }}>{r.pct >= 0 ? "+" : "−"}{Math.abs(r.pct).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="text-xs" style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--ns-border)", display: "flex", justifyContent: "space-between" }}>
                  <span className="muted">期間合計</span>
                  <span className="num" style={{ color: attribution.total >= 0 ? "var(--ns-gain)" : "var(--ns-loss)", fontWeight: 600 }}>
                    {attribution.total >= 0 ? "+" : "−"}{formatMoney(Math.abs(attribution.total), primaryCurrency)}
                  </span>
                </div>
              </div>
            );
          })()}
          {attribution.excludedTickers.length > 0 && (
            <div className="muted text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
              部分標的歷史股價不足，未納入貢獻分析：{attribution.excludedTickers.join("、")}。
            </div>
          )}
        </CossCard>
      ) : null}
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────────────────────────

function latestPositionValue(
  position: AnalyticsPosition,
  dailyPrices: DailyPrice[],
  manualSnapshots: ManualPriceSnapshot[],
  toPrimary: (value: number, currency: string, asOf?: string) => number,
  end: string,
) {
  const ticker = position.ticker.toUpperCase();
  const price = [...dailyPrices]
    .filter((row) => row.ticker.toUpperCase() === ticker && row.date.slice(0, 10) <= end)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (price) return toPrimary(price.close * position.quantity, price.currency || position.currency, price.date);
  const snap = [...manualSnapshots]
    .filter((row) => row.assetId === position.assetId && row.date.slice(0, 10) <= end)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (snap) return toPrimary(snap.price * position.quantity, position.currency, snap.date);
  return 0;
}

// ── Shared primitive components ───────────────────────────────────────────────

function KpiCard({ label, note, value, color, spark, sub, help }: {
  label: string;
  note: string;
  value: string;
  color: string;
  spark: Array<number | null>;
  sub: string;
  help: string;
}) {
  return (
    <CossCard style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <div className="ns-eyebrow" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 5 }}>
          {label}
          <MetricHelp text={help} />
        </div>
        <span className="mono dim text-micro">{note}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div className="num" style={{ fontSize: "clamp(20px, 2.4vw, 26px)", fontWeight: 600, fontFamily: "var(--ns-font-num)", color, fontVariantNumeric: "tabular-nums lining-nums", letterSpacing: -0.01, whiteSpace: "nowrap" }}>{value}</div>
        <Sparkline data={spark} color={color} />
      </div>
      <div className="muted text-caption" style={{ lineHeight: 1.45 }}>{sub}</div>
    </CossCard>
  );
}

function HeadingWithHelp({ title, help }: { title: string; help: string }) {
  return (
    <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
      {title}
      <MetricHelp text={help} />
    </h3>
  );
}

function MetricHelp({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      style={{ display: "inline-flex", color: "var(--ns-fg-muted)", cursor: "help", lineHeight: 1, flexShrink: 0 }}
    >
      <Info size={13} />
    </span>
  );
}

function RollingVolatilityCard({ rolling }: {
  rolling: {
    data: Array<{ date: string; vol: number }>;
    current: number | null;
    avg90: number | null;
    peak: { vol: number; date: string } | null;
  };
}) {
  return (
    <CossCard style={{ padding: 22 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>風險趨勢</div>
        <HeadingWithHelp
          title="滾動 30 日波動率"
          help="每一天都用前 30 個交易日重新計算一次年化波動率，用來看風險是正在升高、降低，還是維持穩定。"
        />
      </div>
      {rolling.data.length < 2 ? (
        <div className="muted text-body" style={{ padding: "24px 0" }}>歷史股價不足，無法計算滾動波動率。</div>
      ) : (
        <>
          <div style={{ height: 168 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rolling.data}>
                <defs>
                  <linearGradient id="analyticsVol" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--ns-chart-2)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--ns-chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--ns-fg-muted)" fontSize={11} minTickGap={28} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis stroke="var(--ns-fg-muted)" fontSize={11} width={36} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)}%`, "年化波動率"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
                  itemStyle={{ color: "var(--ns-fg)" }}
                  labelStyle={{ color: "var(--ns-fg)" }}
                />
                <ReferenceLine y={VOL_THRESHOLD} stroke="var(--ns-neg)" strokeDasharray="2 4" strokeOpacity={0.65} />
                <Area type="monotone" dataKey="vol" stroke="var(--ns-chart-2)" fill="url(#analyticsVol)" strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            {[
              { dot: "var(--ns-chart-2)", label: "當前", value: fmtPct(rolling.current, 1) },
              { dot: "var(--ns-fg-dim)", label: "90 天平均", value: fmtPct(rolling.avg90, 1) },
              { dot: "var(--ns-neg)", label: "期間峰值", value: fmtPct(rolling.peak?.vol ?? null, 1), note: rolling.peak?.date },
            ].map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: r.dot, flexShrink: 0 }} />
                <span className="muted text-xs" style={{ flex: 1 }}>{r.label}</span>
                <span className="num text-body" style={{ color: r.dot, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
                {r.note ? <span className="dim text-micro">{r.note}</span> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </CossCard>
  );
}

function DrawdownStatusCard({ drawdown, values, primaryCurrency }: {
  drawdown: { drawdownPct: number | null; peakDate: string | null; troughDate: string | null; recovered: boolean };
  values: number[];
  primaryCurrency: string;
}) {
  const latest = values.length ? values[values.length - 1] : null;
  const peak = values.length ? Math.max(...values) : null;
  const gap = latest != null && peak != null ? peak - latest : null;
  return (
    <CossCard style={{ padding: 22 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>回撤狀態</div>
        <HeadingWithHelp
          title="離高點還差多少"
          help="最大回撤告訴你最深跌幅；這張卡補上目前是否已經回到高點，以及距離期間高點還有多少差距。"
        />
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="ns-surface" style={{ padding: "12px 14px" }}>
          <div className="muted text-xs" style={{ marginBottom: 4 }}>期間最大回撤</div>
          <div className="num neg text-[26px]" style={{ fontWeight: 650 }}>{fmtPct(drawdown.drawdownPct, 1)}</div>
          <div className="muted text-caption" style={{ marginTop: 4 }}>
            {drawdown.peakDate && drawdown.troughDate ? `${drawdown.peakDate} → ${drawdown.troughDate}` : "資料不足"}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <div className="ns-surface" style={{ padding: "10px 12px" }}>
            <div className="muted text-caption">恢復狀態</div>
            <div style={{ marginTop: 4, fontWeight: 600, color: drawdown.recovered ? "var(--ns-pos)" : "var(--ns-warn)" }}>
              {drawdown.recovered ? "已回到高點" : "尚未恢復"}
            </div>
          </div>
          <div className="ns-surface" style={{ padding: "10px 12px" }}>
            <div className="muted text-caption">距離高點</div>
            <div className="num" style={{ marginTop: 4, fontWeight: 600 }}>
              {gap == null ? "—" : formatMoney(Math.max(0, gap), primaryCurrency)}
            </div>
          </div>
        </div>
      </div>
    </CossCard>
  );
}

// ── Direction A Editorial layout components ───────────────────────────────────

/** Editorial section header: lime eyebrow + large title + optional right slot. */
function NSAnHead({ kicker, title, right, accent }: {
  kicker: string;
  title: string;
  right?: ReactNode;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 8, color: accent ?? "var(--ns-accent)" }}>{kicker}</div>
        <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
      </div>
      {right}
    </div>
  );
}

/** Deeper-than-page dark feature band (editorial block separator). */
function NSAnBand({ children, deep }: { children: ReactNode; deep?: boolean }) {
  return (
    <div
      style={{
        background: deep ? "#0a0c0e" : "var(--ns-bg-card)",
        border: deep ? "1px solid #1a1d20" : "1px solid var(--ns-border)",
        borderRadius: "var(--ns-r-xl)",
        padding: 34,
      }}
    >
      {children}
    </div>
  );
}

/** Vertical thin-stripe allocation bars (editorial style) + legend list. */
function AnAllocBars({ rows }: { rows: Array<{ label: string; value: number; pct: number; color: string }> }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 10, height: 120 }}>
        {rows.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            title={`${d.label} · ${d.pct.toFixed(1)}%`}
            style={{
              flex: `${d.pct} 0 0`,
              minWidth: 0,
              backgroundImage: `repeating-linear-gradient(90deg, ${d.color} 0 3px, transparent 3px 6.5px)`,
              backgroundPosition: "left center",
              borderRadius: 1,
              opacity: hover == null || hover === i ? 1 : 0.3,
              transition: "opacity .15s",
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
        {rows.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 4px",
              borderBottom: "1px solid var(--ns-border)",
              background: hover === i ? "var(--ns-bg-hover)" : "transparent",
              transition: "background .12s",
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14 }}>{d.label}</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {d.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
