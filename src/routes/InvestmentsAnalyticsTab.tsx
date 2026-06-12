import { ArrowsClockwise, ChartLineUp, Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  alignByDate,
  allocationDriftSeries,
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

const VOL_THRESHOLD = 20; // % annualized — high-volatility marker on the rolling chart.

/** Wealthfolio-style quick picks for the in-chart benchmark switcher. */
const BENCHMARK_PRESETS: Array<{ ticker: string; name: string; note: string }> = [
  { ticker: "0050.TW", name: "元大台灣50", note: "台股大盤代理" },
  { ticker: "^TWII", name: "加權指數", note: "台股大盤" },
  { ticker: "^GSPC", name: "S&P 500", note: "美股大型股" },
  { ticker: "^NDX", name: "Nasdaq 100", note: "美股科技股" },
  { ticker: "VT", name: "Vanguard Total World", note: "全球股市 ETF" },
];

/** Benchmark chip + popover: preset list on top, free Yahoo symbol search
 *  below. Writes the shared uiPreferences benchmark so the whole analytics
 *  tab (and its auto-backfill) follows. */
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

/** Inclusive start date for an analytics period. ALL uses a far-past sentinel so
 *  the value-series builder trims to the actual first priced date. */
function periodStart(period: AnalyticsPeriod, end: string): string {
  if (period === "ALL") return "1900-01-01";
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<AnalyticsPeriod, "ALL" | "YTD">, number> = { "3M": 92, "6M": 183, "1Y": 365 };
  return daysAgo(days[period], end);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Rolling window of a metric, reusing the canonical (tested) metric functions
 *  so a rolling chart can never drift from the headline number. */
function rollingMetric(returns: number[], window: number, fn: (r: number[]) => number | null): Array<number | null> {
  return returns.map((_, i) => (i + 1 < window ? null : fn(returns.slice(i + 1 - window, i + 1))));
}

/** Underwater (drawdown-over-time) series, in percent, aligned to `values`. */
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

// ─── Sparkline (lightweight SVG; no chart lib overhead per KPI card) ──────────
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
  benchmarkTicker: string;
  primaryCurrency: string;
  /** Backfill all holdings' historical prices (the whole-tab empty-state CTA). */
  onBackfillHoldings: (range: "1y" | "5y") => void | Promise<void>;
  /** Ensure the benchmark ticker has history (auto-fired on first view). */
  onEnsureBenchmark: (ticker: string) => void | Promise<void>;
  backfilling: boolean;
}

export function InvestmentsAnalyticsTab({
  positions,
  records,
  dailyPrices,
  manualSnapshots,
  toPrimary,
  benchmarkTicker,
  primaryCurrency,
  onBackfillHoldings,
  onEnsureBenchmark,
  backfilling,
}: Props) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("1Y");
  const end = todayStr();

  // Auto-backfill the benchmark's history the first time it's missing, so the
  // Portfolio-vs-Benchmark line can draw without the user hunting for a button.
  const attempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    const t = benchmarkTicker.toUpperCase();
    if (!t || attempted.current.has(t)) return;
    const count = dailyPrices.reduce((n, p) => (p.ticker.toUpperCase() === t ? n + 1 : n), 0);
    if (count >= MIN_ANALYTICS_DAYS) return;
    attempted.current.add(t);
    void onEnsureBenchmark(benchmarkTicker);
  }, [benchmarkTicker, dailyPrices, onEnsureBenchmark]);

  // ── Period-scoped portfolio series + risk metrics (KPI strip) ──────────────
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

  // ── 三口徑報酬 ─────────────────────────────────────────────────────────────
  /** 期間 TWR（時間加權報酬）：排除加減碼時機影響，衡量持倉本身表現。 */
  const twrResult = useMemo(() => {
    const start = periodStart(period, end);
    return buildPortfolioTwr({ positions, records, dailyPrices, toPrimary, start, end });
  }, [positions, records, dailyPrices, toPrimary, period, end]);

  /** 年化 XIRR（金額加權報酬）：全期不受 period 影響，用所有持倉 cashflows。 */
  const xirrResult = useMemo(() => {
    // 把所有持倉的 records 依 assetId 分組，合併所有 cashflows。
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

    // Terminal value = 目前持倉總市值（最後一點 buildPortfolioValueSeries 全期 value）。
    const fullSeries = buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start: "1900-01-01", end });
    const lastValue = fullSeries.series.length > 0 ? fullSeries.series[fullSeries.series.length - 1].value : 0;
    const terminal = { date: end, amount: lastValue };

    const xirr = calculateXirr(allCashflows, terminal);
    return { xirr, gated: false };
  }, [positions, records, dailyPrices, manualSnapshots, toPrimary, end]);

  /** 報酬貢獻：各持倉在此期間貢獻的損益（fixed-basket，加總＝期間市值變化）。 */
  const attribution = useMemo(() => {
    const start = periodStart(period, end);
    return buildReturnAttribution({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });
  }, [positions, dailyPrices, manualSnapshots, toPrimary, period, end]);

  // ── Portfolio vs Benchmark (cumulative return, aligned dates) ──────────────
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

  // ── Allocation drift (fixed 12-month window) ───────────────────────────────
  const drift = useMemo(() => {
    const start = daysAgo(365, end);
    const d = allocationDriftSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });
    const data = d.dates.map((date, t) => {
      const row: Record<string, number | string> = { date };
      d.classes.forEach((c, ci) => { row[c] = d.data[t][ci]; });
      return row;
    });
    return { classes: d.classes, data };
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);

  // ── Rolling 30-day volatility (fixed 1-year window) ────────────────────────
  const rolling = useMemo(() => {
    const start = daysAgo(365, end);
    const { series } = buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });
    const returns = dailyReturns(series.map((p) => p.value));
    const roll = rollingVolatilityPct(returns, 30);
    // roll[i] corresponds to returns[i] → series[i + 1].
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

  // ── 幣別曝險 (current holdings, grouped by asset currency) ─────────────────
  const currencyExposure = useMemo(() => {
    const entries = positions.map((p) => ({
      currency: p.currency,
      value: latestPositionValue(p, dailyPrices, manualSnapshots, toPrimary, end),
    }));
    return buildCurrencyExposure(entries);
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);

  // ── 股利分析 (all-time; yield uses current market value) ───────────────────
  const dividends = useMemo(() => {
    const assetMeta = new Map(positions.map((p) => [p.assetId, { ticker: p.ticker, currency: p.currency }]));
    return buildDividendAnalysis({ records, assetMeta, toPrimary, currentMarketValue: allocationSummary.total, asOf: end });
  }, [records, positions, toPrimary, allocationSummary.total, end]);

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
    <div className="grid gap-4">
      <AnalyticsSectionHeading title="績效" description="時間區間會同步影響期間總覽、累積報酬與指標比較。" />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>績效</div>
          <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>期間總覽</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Always-available backfill — the Dashboard's 前往回補 link lands here,
              so the entry point can't live only in the empty state. */}
          <Button variant="outline" size="sm" onClick={() => onBackfillHoldings("1y")} loading={backfilling} disabled={backfilling} title="抓取所有持倉近 1 年的每日歷史股價">
            <ArrowsClockwise size={13} />{backfilling ? "回補中…" : "回補歷史股價"}
          </Button>
          <SegmentedControl value={period} onChange={setPeriod} options={periodOptions} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryMetricCard
          label="期初市值"
          value={periodSummary.startValue == null ? "—" : formatMoney(periodSummary.startValue, primaryCurrency)}
          help="目前持倉在這個期間第一個可計價日期的估算市值。若某些標的缺歷史價格，會從可用資料開始計算。"
        />
        <SummaryMetricCard
          label="期末市值"
          value={periodSummary.endValue == null ? "—" : formatMoney(periodSummary.endValue, primaryCurrency)}
          help="目前持倉在期間結束日的估算市值，通常接近最新可取得價格。"
        />
        <SummaryMetricCard
          label="期間市值變化"
          value={periodSummary.change == null ? "—" : `${periodSummary.change >= 0 ? "+" : "−"}${formatMoney(Math.abs(periodSummary.change), primaryCurrency)}`}
          tone={periodSummary.change == null ? "muted" : periodSummary.change >= 0 ? "pos" : "neg"}
          help="期末市值減期初市值。這是固定目前持倉籃子的期間變化，不等同完整已實現損益。"
        />
        <SummaryMetricCard
          label="期間報酬"
          value={fmtPct(periodSummary.changePct, 1)}
          tone={periodSummary.changePct == null ? "muted" : periodSummary.changePct >= 0 ? "pos" : "neg"}
          help="把期間內每日市值序列轉成累積報酬，會跟上方時間區間一起變動。"
        />
      </div>

      {/* ── 報酬口徑 ── */}
      <CossCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>報酬口徑</div>
          <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>三種報酬怎麼看</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden" }}>
          {[
            {
              label: "期間 TWR",
              val: twrResult.twrPct,
              help: "時間加權報酬：衡量持倉本身的表現，不受你加碼/減碼時點影響。",
            },
            {
              label: "年化 XIRR",
              val: xirrResult.gated ? null : (xirrResult.xirr != null ? xirrResult.xirr * 100 : null),
              help: "金額加權年化報酬：把資金投入的時點與多寡也算進來，反映你實際的資金成果。",
            },
            {
              label: "期間價格報酬",
              val: periodSummary.changePct,
              help: "目前持倉籃子在此期間的價格漲跌，不含加減碼與配息。",
            },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "12px 16px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
              <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                {s.label}
                <MetricHelp text={s.help} />
              </div>
              <div
                className="num text-stat"
                style={{
                  fontWeight: 600,
                  fontFamily: "var(--ns-font-num)",
                  fontVariantNumeric: "tabular-nums",
                  color: s.val == null ? "var(--ns-fg)" : s.val >= 0 ? "var(--ns-gain)" : "var(--ns-loss)",
                }}
              >
                {s.val == null ? "—" : `${s.val >= 0 ? "+" : "−"}${Math.abs(s.val).toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>
        {twrResult.excludedTickers && twrResult.excludedTickers.length > 0 ? (
          <div className="muted text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
            部分標的歷史股價不足，未納入 TWR 計算：{twrResult.excludedTickers.join("、")}。
          </div>
        ) : null}
      </CossCard>

      {/* ── 報酬貢獻 (attribution) ── */}
      {attribution.items.length > 0 ? (
        <CossCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>報酬貢獻</div>
            <HeadingWithHelp
              title="哪些持倉驅動了報酬"
              help="各持倉在此期間貢獻的損益（以目前持股 × 期間價格變化計算），加總等於上方的期間市值變化。正數綠色、負數紅色。"
            />
          </div>
          {(() => {
            const TOP = 6;
            const shown = attribution.items.slice(0, TOP);
            const rest = attribution.items.slice(TOP);
            const restSum = rest.reduce((s, it) => s + it.contribution, 0);
            const rows = [...shown.map((it) => ({ label: it.ticker, contribution: it.contribution, pct: it.pct }))];
            if (rest.length > 0) rows.push({ label: `其他 ${rest.length} 檔`, contribution: restSum, pct: Math.abs(attribution.total) > 0 ? (restSum / attribution.total) * 100 : 0 });
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
          {attribution.excludedTickers.length > 0 ? (
            <div className="muted text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
              部分標的歷史股價不足，未納入貢獻分析：{attribution.excludedTickers.join("、")}。
            </div>
          ) : null}
        </CossCard>
      ) : null}

      {/* ── Portfolio vs Benchmark ── */}
      <CossCard style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>績效比較</div>
            <HeadingWithHelp
              title="投資組合 vs 指標"
              help="把目前持倉和指標都換算成同一期間的累積報酬，方便看你的組合是否跑贏參考標的。"
            />
          </div>
          <BenchmarkPicker current={benchmarkTicker} />
        </div>

        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden", marginBottom: 14 }}>
          {[
            { label: "投資組合", val: perf.portFinal, color: perf.portFinal != null && perf.portFinal >= 0 ? "var(--ns-gain)" : "var(--ns-loss)" },
            { label: `${benchmarkTicker} 指標`, val: perf.benchFinal, color: "var(--ns-fg-muted)" },
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
            {/* ComposedChart (not AreaChart) so the benchmark <Line> renders
                alongside the portfolio <Area> — AreaChart silently drops Lines. */}
            <ComposedChart data={perf.data}>
              <defs>
                <linearGradient id="analyticsPort" x1="0" x2="0" y1="0" y2="1">
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
              <Area type="monotone" dataKey="port" stroke="var(--ns-accent)" fill="url(#analyticsPort)" strokeWidth={2} isAnimationActive={false} />
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
        {core.excludedTickers.length > 0 ? (
          <div className="muted text-caption" style={{ marginTop: 8, lineHeight: 1.5 }}>
            部分標的歷史股價不足，本期間未納入分析：{core.excludedTickers.join("、")}。回補更長區間的歷史股價即可納入。
          </div>
        ) : null}
      </CossCard>

      {/* ── 股利分析 ── */}
      {dividends.total > 0 ? (
        <>
          <AnalyticsSectionHeading title="股利" description="現金股利的年度與個股分布，以及以目前市值計算的近一年殖利率。" />
          <CossCard style={{ padding: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden", marginBottom: 16 }}>
              {[
                { label: "近一年股利 (TTM)", value: formatMoney(dividends.ttmTotal, primaryCurrency), help: "近 365 天收到的現金股利合計。" },
                { label: "近一年殖利率", value: dividends.yieldPct == null ? "—" : `${dividends.yieldPct.toFixed(2)}%`, help: "近一年股利 ÷ 目前持倉市值。" },
                { label: "累計股利", value: formatMoney(dividends.total, primaryCurrency), help: "有紀錄以來的現金股利合計（淨額）。" },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: "12px 16px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
                  <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>{s.label}<MetricHelp text={s.help} /></div>
                  <div className="num text-xl" style={{ fontWeight: 600, fontFamily: "var(--ns-font-num)", color: "var(--ns-gain)", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Annual dividends */}
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
              {/* Per-holding dividends */}
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
        </>
      ) : null}

      <AnalyticsSectionHeading title="風險" description="這些指標用來看波動、下跌壓力，以及報酬是否足以補償承擔的風險。" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis ? (
          <>
            <KpiCard label="年化波動率" note="Annual Volatility" value={fmtPct(kpis.vol, 1)} color="var(--ns-chart-2)" spark={kpis.volSpark} sub="日報酬標準差換算成年化" help="衡量期間內報酬上下震盪的幅度。數字越高，代表市值波動越大；它不分上漲或下跌，只看波動程度。" />
            <KpiCard label="Sortino 比率" note="越高越好" value={fmtRatio(kpis.sortino)} color="var(--ns-pos)" spark={kpis.sortinoSpark} sub={`只懲罰下跌波動 · MAR ${(DEFAULT_RISK_FREE_RATE * 100).toFixed(1)}%`} help="衡量每承擔一單位下跌風險，換到多少超額報酬。比 Sharpe 更重視真正讓人不舒服的下跌波動。" />
            <KpiCard label="Sharpe 比率" note="越高越好" value={fmtRatio(kpis.sharpe)} color="var(--ns-chart-1)" spark={kpis.sharpeSpark} sub={`相對無風險利率 ${(DEFAULT_RISK_FREE_RATE * 100).toFixed(1)}%`} help="衡量每承擔一單位總波動，換到多少超額報酬。常用來比較不同投資組合的風險調整後表現。" />
            <KpiCard
              label="最大回撤"
              note="Max Drawdown"
              value={fmtPct(kpis.dd.drawdownPct, 1)}
              color="var(--ns-neg)"
              spark={kpis.ddSpark}
              sub={kpis.dd.troughDate ? `${kpis.dd.peakDate} → ${kpis.dd.troughDate} · ${kpis.dd.recovered ? "已恢復" : "未恢復"}` : "—"}
              help="期間內從高點跌到低點的最大跌幅。它回答的是：這段時間最痛的一段下跌有多深。"
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RollingVolatilityCard rolling={rolling} />
        {kpis ? <DrawdownStatusCard drawdown={kpis.dd} values={core.values} primaryCurrency={primaryCurrency} /> : null}
      </div>

      <AnalyticsSectionHeading title="配置" description="觀察目前持倉的資產類別比例是否隨價格變動偏離原本想要的配置。" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Allocation drift */}
        <CossCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>配置</div>
            <HeadingWithHelp
              title="資產配置漂移 · 12 個月"
              help="顯示不同資產類別在投資組合中的比例如何隨時間改變。即使沒有買賣，漲跌不同也會讓配置比例漂移。"
            />
          </div>
          {drift.data.length < 2 || drift.classes.length === 0 ? (
            <div className="muted text-body" style={{ padding: "24px 0" }}>歷史股價不足，無法顯示配置漂移。</div>
          ) : (
            <>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drift.data} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--ns-fg-muted)" fontSize={11} minTickGap={28} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis stroke="var(--ns-fg-muted)" fontSize={11} width={36} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                    <Tooltip
                      formatter={(value: number, name) => [`${value.toFixed(1)}%`, name as string]}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
                      itemStyle={{ color: "var(--ns-fg)" }}
                      labelStyle={{ color: "var(--ns-fg)" }}
                    />
                    {drift.classes.map((c, i) => (
                      <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.84} isAnimationActive={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                {drift.classes.map((c, i) => (
                  <span key={c} className="text-caption" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                    <span className="muted">{c}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </CossCard>
        <AllocationSummaryCard summary={allocationSummary} primaryCurrency={primaryCurrency} />
      </div>

      {/* 幣別曝險 — only meaningful when holdings span more than one currency */}
      {currencyExposure.currencyCount >= 2 ? (
        <CossCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>幣別曝險</div>
            <HeadingWithHelp
              title="持倉的幣別分布"
              help="目前持倉依計價幣別的市值佔比（已換算成主幣比較）。海外持倉的佔比同時代表你承擔的匯率風險。僅計投資持倉，不含現金帳戶。"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currencyExposure.items.map((it, i) => (
              <div key={it.currency} style={{ display: "grid", gridTemplateColumns: "64px 1fr 150px", gap: 12, alignItems: "center" }}>
                <span className="mono text-xs">{it.currency}</span>
                <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                  <div style={{ width: `${it.pct}%`, height: "100%", background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 99 }} />
                </div>
                <div className="text-xs" style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <span className="num muted">{formatMoney(it.value, primaryCurrency)}</span>
                  <span className="num" style={{ minWidth: 46, textAlign: "right" }}>{it.pct.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </CossCard>
      ) : null}
    </div>
  );
}

function SummaryMetricCard({ label, value, tone = "muted", help }: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "muted";
  help: string;
}) {
  const color = tone === "pos" ? "var(--ns-gain)" : tone === "neg" ? "var(--ns-loss)" : "var(--ns-fg)";
  return (
    <CossCard style={{ padding: "16px 18px" }}>
      <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        <MetricHelp text={help} />
      </div>
      <div className="num" style={{ fontSize: "clamp(16px, 2vw, 22px)", fontWeight: 600, fontFamily: "var(--ns-font-num)", color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </CossCard>
  );
}

function AnalyticsSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 4 }}>投資分析</div>
      <h2 className="text-lg" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>{title}</h2>
      <p className="muted text-xs" style={{ margin: "4px 0 0", lineHeight: 1.5 }}>{description}</p>
    </div>
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

function AllocationSummaryCard({ summary, primaryCurrency }: {
  summary: {
    rows: Array<{ label: string; value: number; pct: number; color: string }>;
    total: number;
    largestClass: { label: string; value: number; pct: number; color: string } | null;
    largestHolding: { label: string; value: number } | null;
    topHoldingPct: number | null;
  };
  primaryCurrency: string;
}) {
  return (
    <CossCard style={{ padding: 22 }}>
      <div style={{ marginBottom: 14 }}>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>目前配置</div>
        <HeadingWithHelp
          title="集中度摘要"
          help="用最新可取得價格估算目前資產類別和最大單一持倉的集中程度，幫你判斷是否需要再平衡。"
        />
      </div>
      {summary.rows.length === 0 ? (
        <div className="muted text-body" style={{ padding: "24px 0" }}>目前持倉缺少最新價格，無法估算配置。</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div className="ns-surface" style={{ padding: "10px 12px" }}>
              <div className="muted text-caption">最大資產類別</div>
              <div style={{ marginTop: 4, fontWeight: 650 }}>{summary.largestClass?.label ?? "—"}</div>
              <div className="mono muted text-caption">{summary.largestClass ? `${summary.largestClass.pct.toFixed(1)}%` : "—"}</div>
            </div>
            <div className="ns-surface" style={{ padding: "10px 12px" }}>
              <div className="muted text-caption">最大單一持倉</div>
              <div className="mono" style={{ marginTop: 4, fontWeight: 650 }}>{summary.largestHolding?.label ?? "—"}</div>
              <div className="mono muted text-caption">{summary.topHoldingPct == null ? "—" : `${summary.topHoldingPct.toFixed(1)}%`}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {summary.rows.slice(0, 5).map((row) => (
              <div key={row.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 84px) minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                <span className="muted text-xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                <div style={{ height: 7, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, row.pct)}%`, height: "100%", borderRadius: 99, background: row.color }} />
                </div>
                <span className="mono text-xs">{row.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="muted text-caption">
            可計價市值 {formatMoney(summary.total, primaryCurrency)}
          </div>
        </div>
      )}
    </CossCard>
  );
}

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
  if (price) return toPrimary(price.close * position.quantity, price.currency, price.date);
  const snap = [...manualSnapshots]
    .filter((row) => row.assetId === position.assetId && row.date.slice(0, 10) <= end)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (snap) return toPrimary(snap.price * position.quantity, position.currency, snap.date);
  return 0;
}

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
