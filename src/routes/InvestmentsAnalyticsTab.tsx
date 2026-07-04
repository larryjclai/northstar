import { ArrowsClockwise, ChartLineUp, Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { useUiPreferences, type NameLocalePreference } from "../state/uiPreferences";
import {
  annualizedVolatilityPct,
  buildBenchmarkSeries,
  buildCostBasisAttribution,
  buildPortfolioTwr,
  buildPortfolioValueSeries,
  buildCurrencyExposure,
  buildDividendAnalysis,
  buildPositionMetrics,
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
  resolveSectorLabel,
  resolveCanonicalSectorLabel,
  buildSectorBreakdown,
  buildCountryBreakdown,
  etfBucketLabel,
  resolveHoldingCountry,
  resolveCountryLabel,
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
          className="ns-input text-xs inline-flex items-center gap-1.5 h-8 cursor-pointer"
          style={{ padding: "0 12px" }}
          title="更換比較指標"
        >
          <ChartLineUp size={13} />
          <span className="mono">{current}</span>
          <span className="muted text-caption">更換指標</span>
        </button>
      } />
      <PopoverContent align="end" style={{ width: 300, padding: 10 }}>
        <div className="text-xs mb-2 muted" style={{ fontSize: 10, fontWeight: 500 }}>常用指標</div>
        <div className="flex flex-col mb-2.5">
          {BENCHMARK_PRESETS.map((preset) => (
            <button
              key={preset.ticker}
              type="button"
              onClick={() => choose(preset.ticker)}
              className="flex items-baseline gap-2 text-left cursor-pointer border-none"
              style={{
                padding: "7px 8px", borderRadius: "var(--ns-r-xs)",
                background: preset.ticker === current ? "var(--ns-accent-soft)" : "transparent",
              }}
            >
              <span className="mono text-xs shrink-0" style={{ fontWeight: 600 }}>{preset.ticker}</span>
              <span className="text-xs min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{preset.name}</span>
              <span className="dim text-micro ml-auto shrink-0">{preset.note}</span>
            </button>
          ))}
        </div>
        <div className="text-xs ns-field-label" style={{ fontSize: 10 }}>或搜尋任意代號</div>
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

type AnalyticsPeriod = "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "All";
const PERIODS: AnalyticsPeriod[] = ["1M", "3M", "6M", "YTD", "1Y", "5Y", "All"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number, end: string): string {
  const d = new Date(`${end}T00:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function periodStart(period: AnalyticsPeriod, end: string): string {
  if (period === "All") return "1900-01-01";
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<AnalyticsPeriod, "All" | "YTD">, number> = {
    "1M": 30, "3M": 92, "6M": 183, "1Y": 365, "5Y": 1825,
  };
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
  onSectorClick?: (sector: string) => void;
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
  onSectorClick,
}: Props) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("1Y");
  const [showAllSectors, setShowAllSectors] = useState(false);
  const end = todayStr();
  const nameLocale = useUiPreferences((s) => (s.nameLocale === "auto" ? "zh-Hant" : s.nameLocale) as NameLocalePreference);

  const attempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    const t = benchmarkTicker.toUpperCase();
    if (!t || attempted.current.has(t)) return;
    const count = dailyPrices.reduce((n, p) => (p.ticker.toUpperCase() === t ? n + 1 : n), 0);
    if (count >= MIN_ANALYTICS_DAYS) return;
    attempted.current.add(t);
    void onEnsureBenchmark(benchmarkTicker);
  }, [benchmarkTicker, dailyPrices, onEnsureBenchmark]);

  const fullSeriesResult = useMemo(() => {
    return buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start: "1900-01-01", end });
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);

  const core = useMemo(() => {
    const start = periodStart(period, end);
    const startIndex = fullSeriesResult.series.findIndex(p => p.date >= start);
    const series = startIndex >= 0 ? fullSeriesResult.series.slice(startIndex) : [];
    const values = series.map((p) => p.value);
    const returns = dailyReturns(values);
    return { series, values, returns, excludedTickers: fullSeriesResult.excludedTickers };
  }, [fullSeriesResult, period, end]);

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
    if (allCashflows.length === 0) return { xirr: null, gated: true, spanDays: null as number | null };
    const span = cashflowSpanDays(allCashflows, end);
    if (span < XIRR_MIN_DAYS) return { xirr: null, gated: true, spanDays: span };
    const lastValue = fullSeriesResult.series.length > 0 ? fullSeriesResult.series[fullSeriesResult.series.length - 1].value : 0;
    const terminal = { date: end, amount: lastValue };
    const xirr = calculateXirr(allCashflows, terminal);
    return { xirr, gated: false, spanDays: span };
  }, [records, end, fullSeriesResult]);

  const attribution = useMemo(() => {
    return buildCostBasisAttribution({ positions, records, dailyPrices, manualSnapshots, toPrimary, end });
  }, [positions, records, dailyPrices, manualSnapshots, toPrimary, end]);

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
    const startIndex = fullSeriesResult.series.findIndex(p => p.date >= start);
    const series = startIndex >= 0 ? fullSeriesResult.series.slice(startIndex) : [];
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
  }, [fullSeriesResult, end]);

  // Priced entries shared by the sector and country breakdowns. Each dimension
  // groups the same values differently and independently sums to `total`.
  const pricedEntries = useMemo(
    () =>
      positions
        .map((position) => ({
          position,
          value: latestPositionValue(position, dailyPrices, manualSnapshots, toPrimary, end),
        }))
        .filter((e) => e.value > 0),
    [positions, dailyPrices, manualSnapshots, toPrimary, end],
  );

  const allocationSummary = useMemo(() => {
    // Sector breakdown — ETFs/funds land in the explicit 「ETF / 基金」 bucket (or
    // their fetched/manual weights), never 未知. manual > fetched > bucket.
    // Default to the canonical (GICS-11) taxonomy so TW + US holdings share
    // buckets; a future drill-down can pass level: "industry" for the fine split.
    const breakdown = buildSectorBreakdown(pricedEntries, {
      sectorLabelOf: (raw) => resolveSectorLabel(raw, nameLocale),
      canonicalLabelOf: (key) => resolveCanonicalSectorLabel(key, nameLocale),
      etfBucket: etfBucketLabel(nameLocale),
      unknownLabel: "未知",
      otherLabel: "其他",
    });
    const total = breakdown.total;
    let largestHolding: { label: string; value: number } | null = null;
    for (const { position, value } of pricedEntries) {
      if (!largestHolding || value > largestHolding.value) largestHolding = { label: position.ticker, value };
    }
    const rows = breakdown.buckets.map((b, index) => ({
      label: b.label,
      value: b.value,
      pct: b.pct,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
    const largestClass = rows[0] ?? null;
    const topHoldingPct = largestHolding && total > 0 ? (largestHolding.value / total) * 100 : null;
    return { rows, total, largestClass, largestHolding, topHoldingPct };
  }, [pricedEntries, nameLocale]);

  // Country / region breakdown of *direct* holdings — derived locally (no fetch)
  // from each holding's ticker suffix / market + currency tiebreak.
  const countrySummary = useMemo(() => {
    const breakdown = buildCountryBreakdown(pricedEntries, {
      countryOf: (position) =>
        resolveCountryLabel(resolveHoldingCountry(position.ticker, position.currency), nameLocale),
    });
    const rows = breakdown.buckets.map((b, index) => ({
      label: b.label,
      value: b.value,
      pct: b.pct,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
    return { rows, total: breakdown.total };
  }, [pricedEntries, nameLocale]);

  const holdingHeat = useMemo(
    () => buildHoldingHeat(positions, dailyPrices, manualSnapshots, toPrimary, end),
    [positions, dailyPrices, manualSnapshots, toPrimary, end],
  );

  const calendarData = useMemo(
    () => buildCalendarData(positions, dailyPrices, manualSnapshots, toPrimary, end),
    [positions, dailyPrices, manualSnapshots, toPrimary, end],
  );

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

  // Whole-tab gating is about whether *any* usable price history exists, not the
  // currently-selected period — otherwise picking a short range (e.g. 1M, or YTD
  // early in January) blanks the entire tab even when years of data are loaded.
  const hasHistory = useMemo(() => {
    return hasEnoughReturns(dailyReturns(fullSeriesResult.series.map((p) => p.value)));
  }, [fullSeriesResult]);

  // Sticky in-page section nav (anchors). 股利 only appears with dividend history.
  const sections = useMemo(() => {
    const list = [
      { id: "an-returns", label: "報酬" },
      { id: "an-risk", label: "風險" },
      { id: "an-allocation", label: "配置" },
    ];
    if (dividends.total > 0) list.push({ id: "an-income", label: "股利" });
    return list;
  }, [dividends.total]);
  const [activeSection, setActiveSection] = useState("an-returns");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveSection(top.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

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
  if (!hasHistory) {
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
  // Distance from the period high — the one piece of drawdown info not already
  // carried by the max-drawdown KPI card below.
  const ddGap = (() => {
    const latest = core.values.length ? core.values[core.values.length - 1] : null;
    const peak = core.values.length ? Math.max(...core.values) : null;
    return latest != null && peak != null ? Math.max(0, peak - latest) : null;
  })();

  return (
    <div className="grid gap-5">

      {/* ── Sticky in-page section nav (anchors, intentionally NOT styled like the
            page-level tabs so it doesn't read as a third tab layer) ──────────── */}
      <nav
        className="sticky top-0 z-20 flex items-center gap-1 -mb-2 overflow-x-auto"
        style={{
          padding: "8px 0",
          background: "var(--ns-bg)", borderBottom: "1px solid var(--ns-border)",
        }}
      >
        {sections.map((s) => {
          const active = activeSection === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="text-sm border-none cursor-pointer py-1.5 px-3 whitespace-nowrap"
              style={{
                background: "none",
                fontFamily: "inherit", fontWeight: active ? 600 : 400,
                color: active ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                borderBottom: active ? "2px solid var(--ns-accent)" : "2px solid transparent",
                marginBottom: -9, transition: "color .12s",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* ── Methodology caveat: fixed-weight historical look-back, not true TWR ── */}
      <div
        className="text-caption muted flex items-center gap-1.5 mt-0.5"
      >
        分析採固定持股權重的歷史回看近似（以目前持股 × 歷史價計算），非嚴格時間加權報酬；期間內加碼/減碼會影響解讀。
        <MetricHelp text="所有報酬、Alpha 與風險指標（波動、Sharpe、Sortino、最大回撤）皆以「目前持股數 × 歷史收盤價」回看計算，屬固定權重近似。若你在期間內買賣過該標的，實際時間加權報酬可能與此不同。" />
      </div>

      {/* ═══ 報酬 RETURNS ════════════════════════════════════════════════════ */}
      <section id="an-returns" className="grid gap-5 scroll-mt-16">

      {/* ── Hero: period selector + two return measures (curve lives in vs-benchmark) ── */}
      <CossCard style={{ padding: 34 }}>
        <div className="flex items-start justify-between flex-wrap gap-5 mb-6">
          <div>
            <div className="text-xs mb-2.5 muted" style={{ fontWeight: 500 }}>期間報酬 · {period}</div>
            <div className="flex items-baseline gap-3">
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
                  className="inline-flex items-center rounded-full"
                  style={{
                    padding: "4px 11px",
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
          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBackfillHoldings(period === "5Y" || period === "All" ? "5y" : "1y")}
                loading={backfilling}
                disabled={backfilling}
                title={`抓取所有持倉${period === "5Y" || period === "All" ? "近 5 年" : "近 1 年"}的每日歷史股價`}
              >
                <ArrowsClockwise size={13} />
                {backfilling ? "回補中…" : (period === "5Y" || period === "All" ? "回補 5Y 股價" : "回補歷史股價")}
              </Button>
              <SegmentedControl value={period} onChange={setPeriod} options={periodOptions} />
            </div>
            <div className="flex gap-7">
              {[
                { l: "期初市值", v: periodSummary.startValue == null ? "—" : formatMoney(periodSummary.startValue, primaryCurrency) },
                { l: "期末市值", v: periodSummary.endValue == null ? "—" : formatMoney(periodSummary.endValue, primaryCurrency) },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-xs ns-field-label" style={{ fontSize: 10 }}>{s.l}</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500, color: "var(--ns-fg-muted)" }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Two return measures (TWR / XIRR). The period price return is the hero
            number above, and the cumulative curve lives in the vs-benchmark card. */}
        <div className="mt-1 grid overflow-hidden" style={{ gridTemplateColumns: "repeat(2, 1fr)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)" }}>
          {[
            {
              l: "期間 TWR",
              sub: "剔除進出金影響",
              v: twrResult.twrPct,
              help: "時間加權報酬：衡量持倉本身的表現，不受你加碼/減碼時點影響。",
            },
            {
              l: "年化 XIRR",
              sub: xirrResult.spanDays != null && xirrResult.spanDays < 365
                ? `年化自 ${xirrResult.spanDays} 天紀錄推算，僅供參考`
                : "全期間 · 考慮金流時間",
              subTone: xirrResult.spanDays != null && xirrResult.spanDays < 365 ? "warn" : undefined,
              v: xirrResult.gated ? null : xirrResult.xirr != null ? xirrResult.xirr * 100 : null,
              help: "金額加權年化報酬：涵蓋你有紀錄以來的所有金流，不隨上方期間切換而改變，反映實際的資金成果。",
            },
          ].map((s, i) => (
            <div
              key={s.l}
              className="py-4 px-5"
              style={{ borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)" }}
            >
              <div className="text-xs ns-field-label flex items-center gap-1" style={{ fontSize: 10 }}>
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
              <div className="dim" style={{ fontSize: 11.5, color: s.subTone === "warn" ? "var(--ns-warn)" : undefined }}>{s.sub}</div>
            </div>
          ))}
        </div>
        {core.excludedTickers.length > 0 && (
          <div className="muted text-caption mt-2">
            部分標的歷史股價不足，本期間未納入分析：{core.excludedTickers.join("、")}。回補更長區間的歷史股價即可納入。
          </div>
        )}
        {twrResult.excludedTickers && twrResult.excludedTickers.length > 0 && (
          <div className="muted text-caption mt-2">
            部分標的歷史股價不足，未納入 TWR 計算：{twrResult.excludedTickers.join("、")}。
          </div>
        )}
      </CossCard>

      {/* ── Portfolio vs Benchmark — the primary cumulative-return curve ─────── */}
      <CossCard style={{ padding: 34 }}>
        <NSAnHead
          kicker="績效比較 · vs 指標"
          title={`投資組合 vs ${benchmarkTicker}`}
          right={<BenchmarkPicker current={benchmarkTicker} />}
        />

        <div className="grid overflow-hidden mb-4" style={{ gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)" }}>
          {[
            { label: "投資組合", val: perf.portFinal, color: perf.portFinal != null && perf.portFinal >= 0 ? "var(--ns-gain)" : "var(--ns-loss)", help: undefined },
            { label: `${benchmarkTicker} 指標`, val: perf.benchFinal, color: "var(--ns-fg-muted)", help: undefined },
            { label: "超額報酬", val: perf.alpha, color: perf.alpha != null && perf.alpha >= 0 ? "var(--ns-accent)" : "var(--ns-loss)", help: "投資組合報酬減掉指標報酬。正數代表本期間跑贏指標，負數代表落後。" },
          ].map((s, i) => (
            <div key={s.label} className="py-3 px-4 min-w-0" style={{ borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)" }}>
              <div className="text-xs whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-1 mb-1 muted" style={{ fontSize: 10, fontWeight: 500 }}>
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
                formatter={(value, name) => {
                  const v = Number(value);
                  return [`${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`, name === "port" ? "投資組合" : benchmarkTicker];
                }}
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
        <div className="text-caption flex gap-4 mt-2.5 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span style={{ width: 14, height: 2, background: "var(--ns-accent)" }} />
            <span className="muted">投資組合（累積報酬）</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 14, height: 0, borderTop: "1px dashed var(--ns-fg-dim)" }} />
            <span className="muted">{perf.hasBenchmark ? `${benchmarkTicker} 指標` : `尚無 ${benchmarkTicker} 歷史股價`}</span>
          </span>
        </div>
        {perf.alpha != null && (
          <div className="text-caption mt-1.5" style={{ color: "var(--ns-fg-muted)" }}>
            {perf.alpha < 0
              ? `期間累積落後 ${benchmarkTicker} ${Math.abs(perf.alpha).toFixed(1)}%`
              : `期間累積領先 ${benchmarkTicker} ${perf.alpha.toFixed(1)}%`}
          </div>
        )}
      </CossCard>

      {/* ── Cost-basis attribution: winners / losers ────────────────────────── */}
      {attribution.items.length > 0 ? (
        <CossCard style={{ padding: 34 }}>
          <NSAnHead
            kicker="未實現損益"
            title="上漲最多與下跌最多"
            right={
              <span className="muted whitespace-nowrap" style={{ fontSize: 12, fontFamily: "var(--ns-font-mono)" }}>
                成本基準 · {end}
              </span>
            }
          />
          {(() => {
            const TOP = 5;
            const winners = attribution.items.filter((it) => it.contribution >= 0).slice(0, TOP);
            const losers = attribution.items.filter((it) => it.contribution < 0).slice(0, TOP);
            const maxAbs = Math.max(
              ...winners.map((r) => r.contribution),
              ...losers.map((r) => Math.abs(r.contribution)),
              1,
            );

            function AttributionRow({ label, contribution, pct, color }: { label: string; contribution: number; pct: number; color: string }) {
              const money = `${contribution >= 0 ? "+" : "−"}${formatMoney(Math.abs(contribution), primaryCurrency)}`;
              const percent = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
              return (
                <div className="grid items-center min-w-0 gap-3" style={{ gridTemplateColumns: "minmax(64px, 96px) minmax(80px, 1fr) minmax(112px, 150px)" }}>
                  <span className="mono text-xs min-w-0 whitespace-nowrap overflow-hidden text-ellipsis" title={label}>{label}</span>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--ns-bg-hover)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(Math.abs(contribution) / maxAbs) * 100}%`, background: color }} />
                  </div>
                  <div className="text-xs min-w-0 text-right grid items-baseline gap-1.5" style={{ gridTemplateColumns: "minmax(0, 1fr) 48px" }}>
                    <span className="num min-w-0 whitespace-nowrap overflow-hidden text-ellipsis" title={money} style={{ color }}>{money}</span>
                    <span className="num muted min-w-0 text-right whitespace-nowrap overflow-hidden text-ellipsis" title={percent}>{percent}</span>
                  </div>
                </div>
              );
            }

            return (
              <div className="grid min-w-0 gap-8" style={{ gridTemplateColumns: losers.length > 0 ? "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" : "1fr" }}>
                {winners.length > 0 && (
                  <div className="min-w-0">
                    <div className="text-xs mb-3" style={{ fontSize: 10, color: "var(--ns-gain)", fontWeight: 500 }}>上漲 TOP {winners.length}</div>
                    <div className="flex flex-col gap-2.5">
                      {winners.map((r) => (
                        <AttributionRow key={r.ticker} label={r.ticker} contribution={r.contribution} pct={r.pct} color="var(--ns-gain)" />
                      ))}
                    </div>
                  </div>
                )}
                {losers.length > 0 && (
                  <div className="min-w-0">
                    <div className="text-xs mb-3" style={{ fontSize: 10, color: "var(--ns-loss)", fontWeight: 500 }}>下跌 TOP {losers.length}</div>
                    <div className="flex flex-col gap-2.5">
                      {losers.map((r) => (
                        <AttributionRow key={r.ticker} label={r.ticker} contribution={r.contribution} pct={r.pct} color="var(--ns-loss)" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {attribution.excludedTickers.length > 0 && (
            <div className="muted text-caption mt-2">
              部分標的歷史股價不足，未納入貢獻分析：{attribution.excludedTickers.join("、")}。
            </div>
          )}
        </CossCard>
      ) : null}

      </section>

      {/* ═══ 風險 RISK ═══════════════════════════════════════════════════════ */}
      <section id="an-risk" className="grid gap-5 scroll-mt-16">

      {/* ── Risk KPIs (volatility / Sortino / Sharpe / max drawdown) ─────────── */}
      <CossCard style={{ padding: 34 }}>
        <NSAnHead kicker="風險 · RISK" title="波動、下跌與報酬品質" />
        <div className="text-caption muted -mt-1 mb-3.5">
          風險指標基於固定權重日報酬序列估算，需足夠歷史天數方有參考意義。
        </div>
        {kpis ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-3.5">
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
            {ddGap != null && kpis.dd.drawdownPct != null && (
              <div className="muted text-caption">
                距離期間高點還差 {formatMoney(ddGap, primaryCurrency)} · {kpis.dd.recovered ? "目前已回到高點" : "目前尚未恢復"}
              </div>
            )}
          </>
        ) : (
          <div className="muted text-body py-6">
            此區間交易日不足 {MIN_ANALYTICS_DAYS} 天，無法計算風險指標，請改選較長區間。
          </div>
        )}
      </CossCard>

      {/* ── Rolling 30-day volatility (collapsed by default — the KPI sparkline
            already carries the trend) ───────────────────────────────────────── */}
      <RollingVolatilityCard rolling={rolling} />

      {/* ── Calendar heatmap ──────────────────────────────────────────────────── */}
      <CossCard style={{ padding: 34 }}>
        <NSAnHead
          kicker="報酬節奏 · DAILY RETURNS"
          title="一整年的賺賠日曆"
          right={<span className="mono dim" style={{ fontSize: 12 }}>每格＝單日報酬</span>}
        />
        {calendarData.daily.some((v) => v != null) ? (
          <NSCalendarHeatmap daily={calendarData.daily} startDate={calendarData.startDate} />
        ) : (
          <div className="h-25 flex items-center justify-center" style={{ color: "var(--ns-fg-dim)", fontSize: 13 }}>
            資料不足，無法顯示日曆
          </div>
        )}
      </CossCard>

      </section>

      {/* ═══ 配置 ALLOCATION ═════════════════════════════════════════════════ */}
      <section id="an-allocation" className="grid gap-5 scroll-mt-16">

      {/* ── Holdings heatmap ────────────────────────────────────────────────── */}
      <NSAnBand deep>
        <NSAnHead
          kicker="持倉熱度 · HOLDINGS HEATMAP"
          title="你的資產在哪、報酬如何"
          right={<span className="mono dim" style={{ fontSize: 12 }}>方塊大小＝市值　顏色＝1Y 報酬</span>}
        />
        {holdingHeat.length > 0 ? (
          <NSTreemap data={holdingHeat} primaryCurrency={primaryCurrency} />
        ) : (
          <div className="h-30 flex items-center justify-center" style={{ color: "var(--ns-fg-dim)", fontSize: 13 }}>
            無持倉資料
          </div>
        )}
      </NSAnBand>

      {/* ── Allocation + Currency feature band ──────────────────────────────── */}
      <NSAnBand deep>
        <div className="ns-an-feature-split">
          <div>
            <NSAnHead kicker="產業 · SECTOR" title="產業分類分布" />
            {allocationSummary.rows.length > 0 ? (() => {
              const TOP = 5;
              const hasMore = allocationSummary.rows.length > TOP;
              const displayRows = showAllSectors ? allocationSummary.rows : allocationSummary.rows.slice(0, TOP);
              return (
                <>
                  <AnAllocBars rows={displayRows} onSectorClick={onSectorClick} />
                  {hasMore && (
                    <button
                      onClick={() => setShowAllSectors((v) => !v)}
                      className="mt-2.5 border-none cursor-pointer p-0"
                      style={{
                        background: "none",
                        color: "var(--ns-accent)", fontFamily: "var(--ns-font-mono)", fontSize: 12,
                      }}
                    >
                      {showAllSectors ? "▲ 收合" : `▼ 查看全部 (+${allocationSummary.rows.length - TOP}個)`}
                    </button>
                  )}
                </>
              );
            })() : (
              <div className="muted text-body py-6">目前持倉缺少最新價格，無法估算配置。</div>
            )}
          </div>
          <div className="flex flex-col gap-8">
            {countrySummary.rows.length > 0 && (
              <div>
                <NSAnHead kicker="地區 · REGION" title="持倉的國家／地區分布" />
                <div className="flex h-3 rounded-full overflow-hidden mb-4">
                  {countrySummary.rows.map((it) => (
                    <div key={it.label} style={{ width: `${it.pct}%`, background: it.color }} />
                  ))}
                </div>
                <div className="flex flex-col">
                  {countrySummary.rows.map((it) => (
                    <div
                      key={it.label}
                      className="flex items-center gap-3 py-2.5"
                      style={{ borderBottom: "1px solid var(--ns-border)" }}
                    >
                      <span className="w-2.5 h-2.5 shrink-0" style={{ borderRadius: 3, background: it.color }} />
                      <span className="flex-1" style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</span>
                      <span className="num muted" style={{ fontSize: 12.5 }}>{formatMoney(it.value, primaryCurrency)}</span>
                      <span className="num text-right" style={{ fontSize: 13, fontWeight: 600, minWidth: 50 }}>{it.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div className="muted text-caption mt-3">
                  依持倉上市市場估算；ETF／基金以其本身上市地計入。
                </div>
              </div>
            )}
            {currencyExposure.currencyCount >= 2 && (
              <div>
                <NSAnHead kicker="幣別曝險 · CURRENCY" title="持倉的幣別分布" />
                <div className="flex h-3 rounded-full overflow-hidden mb-4">
                  {currencyExposure.items.map((it, i) => (
                    <div key={it.currency} style={{ width: `${it.pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  ))}
                </div>
                <div className="flex flex-col">
                  {currencyExposure.items.map((it, i) => (
                    <div
                      key={it.currency}
                      className="flex items-center gap-3 py-2.5"
                      style={{ borderBottom: "1px solid var(--ns-border)" }}
                    >
                      <span className="w-2.5 h-2.5 shrink-0" style={{ borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="mono flex-1" style={{ fontSize: 13, fontWeight: 600 }}>{it.currency}</span>
                      <span className="num muted" style={{ fontSize: 12.5 }}>{formatMoney(it.value, primaryCurrency)}</span>
                      <span className="num text-right" style={{ fontSize: 13, fontWeight: 600, minWidth: 50 }}>{it.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <NSAnHead kicker="集中度 · CONCENTRATION" title="最大持倉佔比" />
              <div className="flex gap-7">
                <div>
                  <div className="text-xs mb-2 muted" style={{ fontSize: 10, fontWeight: 500 }}>最大產業</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{allocationSummary.largestClass?.label ?? "—"}</div>
                  <div className="mono muted mt-0.5" style={{ fontSize: 12 }}>
                    {allocationSummary.largestClass ? `${allocationSummary.largestClass.pct.toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-2 muted" style={{ fontSize: 10, fontWeight: 500 }}>最大單一持倉</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{allocationSummary.largestHolding?.label ?? "—"}</div>
                  <div className="mono muted mt-0.5" style={{ fontSize: 12 }}>
                    {allocationSummary.topHoldingPct == null ? "—" : `${allocationSummary.topHoldingPct.toFixed(1)}%`}
                  </div>
                </div>
              </div>
              <div className="muted text-caption mt-3.5">
                可計價市值 {formatMoney(allocationSummary.total, primaryCurrency)}
              </div>
            </div>
          </div>
        </div>
      </NSAnBand>

      </section>

      {/* ═══ 股利 INCOME ═════════════════════════════════════════════════════ */}
      {dividends.total > 0 && (
        <section id="an-income" className="grid gap-5 scroll-mt-16">
          <CossCard style={{ padding: 34 }}>
            <NSAnHead
              kicker="股利所得 · DIVIDENDS"
              title="逐年配息成長"
              right={
                dividends.byYear.length >= 2 ? (
                  <span
                    className="inline-flex rounded-full"
                    style={{
                      padding: "4px 11px",
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
            <div className="flex gap-7 flex-wrap mb-5.5">
              {[
                { l: "近一年股利 (TTM)", v: formatMoney(dividends.ttmTotal, primaryCurrency), help: "近 365 天收到的現金股利合計。" },
                { l: "近一年殖利率", v: dividends.yieldPct == null ? "—" : `${dividends.yieldPct.toFixed(2)}%`, help: "近一年股利 ÷ 目前持倉市值。" },
                { l: "累計股利", v: formatMoney(dividends.total, primaryCurrency), help: "有紀錄以來的現金股利合計（淨額）。" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-xs ns-field-label flex items-center gap-1" style={{ fontSize: 10 }}>
                    {s.l}<MetricHelp text={s.help} />
                  </div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 600, color: "var(--ns-gain)", fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <div className="text-xs mb-2.5 muted" style={{ fontWeight: 500 }}>年度股利</div>
                {(() => {
                  const max = Math.max(...dividends.byYear.map((y) => y.total), 1);
                  return (
                    <div className="flex flex-col gap-2.25">
                      {dividends.byYear.map((y) => (
                        <div key={y.year} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "48px 1fr 110px" }}>
                          <span className="mono muted text-xs">{y.year}</span>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--ns-bg-hover)" }}>
                            <div className="h-full rounded-full" style={{ width: `${(y.total / max) * 100}%`, background: "var(--ns-gain)" }} />
                          </div>
                          <span className="num text-xs text-right">{formatMoney(y.total, primaryCurrency)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="text-xs mb-2.5 muted" style={{ fontWeight: 500 }}>個股股利貢獻</div>
                {(() => {
                  const max = Math.max(...dividends.byHolding.map((h) => h.total), 1);
                  return (
                    <div className="flex flex-col gap-2.25">
                      {dividends.byHolding.slice(0, 6).map((h) => (
                        <div key={h.assetId} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "96px 1fr 110px" }}>
                          <span className="mono text-xs whitespace-nowrap overflow-hidden text-ellipsis">{h.ticker}</span>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--ns-bg-hover)" }}>
                            <div className="h-full rounded-full" style={{ width: `${(h.total / max) * 100}%`, background: "var(--ns-chart-3)" }} />
                          </div>
                          <span className="num text-xs text-right">{formatMoney(h.total, primaryCurrency)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </CossCard>
        </section>
      )}
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
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="text-xs flex items-center gap-1.25 muted" style={{ fontSize: 10, fontWeight: 500 }}>
          {label}
          <MetricHelp text={help} />
        </div>
        <span className="mono dim text-micro">{note}</span>
      </div>
      <div className="flex items-end justify-between gap-2 mb-2">
        <div className="num" style={{ fontSize: "clamp(20px, 2.4vw, 26px)", fontWeight: 600, fontFamily: "var(--ns-font-num)", color, fontVariantNumeric: "tabular-nums lining-nums", letterSpacing: -0.01, whiteSpace: "nowrap" }}>{value}</div>
        <Sparkline data={spark} color={color} width={96} height={36} />
      </div>
      <div className="muted text-caption" style={{ lineHeight: 1.45 }}>{sub}</div>
    </CossCard>
  );
}

function HeadingWithHelp({ title, help }: { title: string; help: string }) {
  return (
    <h3 className="text-base m-0 flex items-center gap-1.5" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>
      {title}
      <MetricHelp text={help} />
    </h3>
  );
}

function MetricHelp({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <span
            aria-label={text}
            className="inline-flex cursor-pointer shrink-0"
            style={{ color: "var(--ns-fg-muted)", lineHeight: 1 }}
          >
            <Info size={15} />
          </span>
        }
      />
      <PopoverContent side="bottom" align="start" sideOffset={6}>
        <p className="m-0" style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ns-fg)" }}>{text}</p>
      </PopoverContent>
    </Popover>
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
  const [open, setOpen] = useState(false);
  return (
    <CossCard style={{ padding: 22 }}>
      <div className="flex items-end justify-between gap-3" style={{ marginBottom: open ? 12 : 0 }}>
        <div>
          <div className="text-xs mb-1 muted" style={{ fontWeight: 500 }}>風險趨勢</div>
          <HeadingWithHelp
            title="滾動 30 日波動率"
            help="每一天都用前 30 個交易日重新計算一次年化波動率，用來看風險是正在升高、降低，還是維持穩定。"
          />
        </div>
        <div className="flex items-center gap-3.5 shrink-0">
          {!open && rolling.current != null && (
            <span className="num text-body" style={{ color: "var(--ns-chart-2)", fontVariantNumeric: "tabular-nums" }}>
              當前 {fmtPct(rolling.current, 1)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="border-none cursor-pointer p-0 whitespace-nowrap"
            style={{ background: "none", color: "var(--ns-accent)", fontFamily: "var(--ns-font-mono)", fontSize: 12 }}
          >
            {open ? "▲ 收合" : "▼ 展開圖表"}
          </button>
        </div>
      </div>
      {open && (rolling.data.length < 2 ? (
        <div className="muted text-body py-6">歷史股價不足，無法計算滾動波動率。</div>
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
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, "年化波動率"]}
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
      ))}
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
        <div className="text-xs" style={{  marginBottom: 8, color: accent ?? "var(--ns-accent)" , fontWeight: 500 }}>{kicker}</div>
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
        background: "var(--ns-bg-card)",
        border: "1px solid var(--ns-border)",
        borderRadius: "var(--ns-r-xl)",
        padding: 34,
      }}
    >
      {children}
    </div>
  );
}

/** Vertical thin-stripe allocation bars (editorial style) + legend list. */
function AnAllocBars({
  rows,
  onSectorClick,
}: {
  rows: Array<{ label: string; value: number; pct: number; color: string }>;
  onSectorClick?: (sector: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clickable = !!onSectorClick;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 10, height: 120 }}>
        {rows.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSectorClick?.(d.label)}
            title={`${d.label} · ${d.pct.toFixed(1)}%${clickable ? " · 點選篩選持倉" : ""}`}
            style={{
              flex: `${d.pct} 0 0`,
              minWidth: 0,
              backgroundImage: `repeating-linear-gradient(90deg, ${d.color} 0 3px, transparent 3px 6.5px)`,
              backgroundPosition: "left center",
              borderRadius: 1,
              opacity: hover == null || hover === i ? 1 : 0.3,
              transition: "opacity .15s",
              cursor: clickable ? "pointer" : "default",
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
            onClick={() => onSectorClick?.(d.label)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 4px",
              borderBottom: "1px solid var(--ns-border)",
              background: hover === i ? "var(--ns-bg-hover)" : "transparent",
              transition: "background .12s",
              cursor: clickable ? "pointer" : "default",
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

// ── Treemap heat helpers ───────────────────────────────────────────────────────

type HeatItem = { sym: string; value: number; ret: number | null };
type LayoutCell = HeatItem & { _a: number; x: number; y: number; w: number; h: number };

/** Diverging green↔red heat color for treemap/calendar cells. */
function nsHeat(ret: number | null, scale = 9): string {
  if (ret == null) return "var(--ns-bg-elev)";
  const t = Math.max(-1, Math.min(1, ret / scale));
  const mag = Math.abs(t);
  const base = t >= 0 ? "var(--ns-pos)" : "var(--ns-neg)";
  const pct = (10 + mag * 78).toFixed(1);
  return `color-mix(in srgb, ${base} ${pct}%, var(--ns-bg-elev))`;
}

/** Foreground color that contrasts with nsHeat background. */
function nsHeatText(ret: number | null, scale = 9): string {
  if (ret == null) return "var(--ns-fg-dim)";
  return Math.abs(ret) / scale > 0.42 ? "var(--ns-bg)" : "var(--ns-fg)";
}

/** Squarified treemap layout — returns cells with absolute x/y/w/h in the given box. */
function nsSquarify(
  data: Array<HeatItem & { _a: number }>,
  X: number,
  Y: number,
  W: number,
  H: number,
): LayoutCell[] {
  const out: LayoutCell[] = [];
  let x = X, y = Y, w = W, h = H;
  const sum = (arr: typeof data) => arr.reduce((s, r) => s + r._a, 0);
  const worst = (arr: typeof data, len: number): number => {
    if (!arr.length) return Infinity;
    const s = sum(arr);
    const mx = Math.max(...arr.map((r) => r._a));
    const mn = Math.min(...arr.map((r) => r._a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const layoutRow = (row: typeof data) => {
    const len = Math.min(w, h);
    const s = sum(row);
    const thick = s / len;
    if (w >= h) {
      let oy = y;
      row.forEach((r) => { const hh = r._a / thick; out.push({ ...r, x, y: oy, w: thick, h: hh }); oy += hh; });
      x += thick; w -= thick;
    } else {
      let ox = x;
      row.forEach((r) => { const ww = r._a / thick; out.push({ ...r, x: ox, y, w: ww, h: thick }); ox += ww; });
      y += thick; h -= thick;
    }
  };
  const queue = [...data];
  let row: typeof data = [];
  while (queue.length) {
    const len = Math.min(w, h);
    const next = queue[0];
    if (!row.length || worst([...row, next], len) <= worst(row, len)) {
      row.push(next); queue.shift();
    } else {
      layoutRow(row); row = [];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

/** Build treemap input: current market value + 1Y price return per position. */
function buildHoldingHeat(
  positions: AnalyticsPosition[],
  dailyPrices: DailyPrice[],
  manualSnapshots: ManualPriceSnapshot[],
  toPrimary: (value: number, currency: string, asOf?: string) => number,
  end: string,
): HeatItem[] {
  const oneYearBack = new Date(end);
  oneYearBack.setFullYear(oneYearBack.getFullYear() - 1);
  const startIso = oneYearBack.toISOString().slice(0, 10);

  return positions
    .map((pos) => {
      const value = latestPositionValue(pos, dailyPrices, manualSnapshots, toPrimary, end);
      if (value <= 0) return null;

      const ticker = pos.ticker.toUpperCase();
      const series = dailyPrices
        .filter((r) => r.ticker.toUpperCase() === ticker)
        .sort((a, b) => b.date.localeCompare(a.date));

      let ret: number | null = null;
      if (series.length >= 2) {
        const latest = series.find((r) => r.date.slice(0, 10) <= end);
        const atStart = series.find((r) => r.date.slice(0, 10) <= startIso);
        if (latest && atStart && atStart.close > 0) {
          ret = (latest.close / atStart.close - 1) * 100;
        }
      } else if (pos.isManual) {
        const snaps = manualSnapshots
          .filter((s) => s.assetId === pos.assetId)
          .sort((a, b) => b.date.localeCompare(a.date));
        const latest = snaps.find((s) => s.date.slice(0, 10) <= end);
        const atStart = snaps.find((s) => s.date.slice(0, 10) <= startIso);
        if (latest && atStart && atStart.price > 0) {
          ret = (latest.price / atStart.price - 1) * 100;
        }
      }

      return { sym: pos.ticker, value, ret };
    })
    .filter((d): d is HeatItem => d !== null)
    .sort((a, b) => b.value - a.value);
}

// ── NSTreemap component ───────────────────────────────────────────────────────

/** Holdings treemap: size = market value, color = 1Y return heat. */
function NSTreemap({
  data,
  primaryCurrency,
  scale = 9,
  gap = 4,
}: {
  data: HeatItem[];
  primaryCurrency: string;
  scale?: number;
  gap?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const navigate = useNavigate();

  // Coordinate space: 1000 × 500 logical units → renders as % of container
  const W = 1000, H = 500;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const items = data.map((d) => ({ ...d, _a: (d.value / total) * W * H }));
  const cells = nsSquarify(items, 0, 0, W, H);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}` }}>
      {cells.map((c, i) => {
        // Size thresholds in logical units (scaled from 660×320 design reference)
        const big = c.w > 140 && c.h > 88;
        const med = c.w > 88 && c.h > 60;
        const isHover = hover === i;
        const txt = nsHeatText(c.ret, scale);
        return (
          <div
            key={`${c.sym}-${i}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => void navigate({ to: "/holdings/$ticker", params: { ticker: c.sym } })}
            style={{
              position: "absolute",
              left: `${(c.x / W) * 100}%`,
              top: `${(c.y / H) * 100}%`,
              width: `${(c.w / W) * 100}%`,
              height: `${(c.h / H) * 100}%`,
              padding: gap / 2,
              boxSizing: "border-box",
              cursor: "pointer",
            }}
          >
            <div style={{
              width: "100%", height: "100%",
              background: nsHeat(c.ret, scale),
              borderRadius: "var(--ns-r-sm)",
              boxShadow: isHover
                ? "0 0 0 1.5px var(--ns-fg)"
                : "inset 0 0 0 1px rgba(255,255,255,0.05)",
              padding: med ? "9px 11px" : "4px 6px",
              boxSizing: "border-box",
              display: "flex", flexDirection: "column",
              justifyContent: big ? "space-between" : "center",
              overflow: "hidden",
              transition: "box-shadow .12s",
            }}>
              {med && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <span style={{
                    fontFamily: "var(--ns-font-mono)", fontWeight: 600,
                    fontSize: big ? 14 : 11.5, color: txt, letterSpacing: "-0.01em",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{c.sym}</span>
                  {big && (
                    <span style={{
                      fontFamily: "var(--ns-font-mono)", fontSize: 11,
                      color: txt, opacity: 0.85, whiteSpace: "nowrap",
                    }}>{((c.value / total) * 100).toFixed(1)}%</span>
                  )}
                </div>
              )}
              {big && c.ret != null && (
                <div>
                  <div style={{
                    fontFamily: "var(--ns-font-mono)", fontWeight: 600,
                    fontSize: c.w > 220 ? 22 : 17,
                    color: txt, letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {c.ret >= 0 ? "+" : "−"}{Math.abs(c.ret).toFixed(1)}%
                  </div>
                </div>
              )}
              {!big && med && c.ret != null && (
                <div style={{
                  fontFamily: "var(--ns-font-mono)", fontSize: 11, color: txt,
                  fontVariantNumeric: "tabular-nums", marginTop: 2,
                }}>
                  {c.ret >= 0 ? "+" : "−"}{Math.abs(c.ret).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Hover tooltip */}
      {hover != null && (() => {
        const c = cells[hover];
        if (!c) return null;
        return (
          <div style={{
            position: "absolute",
            left: `${((c.x + c.w / 2) / W) * 100}%`,
            top: `${(c.y / H) * 100}%`,
            transform: "translate(-50%, -108%)",
            pointerEvents: "none",
            zIndex: 5,
            background: "var(--ns-bg-card)",
            border: "1px solid var(--ns-border-strong)",
            borderRadius: "var(--ns-r-sm)",
            padding: "8px 11px",
            whiteSpace: "nowrap",
            boxShadow: "var(--ns-shadow-2)",
          }}>
            <div style={{ fontFamily: "var(--ns-font-mono)", fontWeight: 600, fontSize: 12.5 }}>{c.sym}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 4, fontFamily: "var(--ns-font-mono)", fontSize: 11.5 }}>
              <span className="muted">
                市值 <span style={{ color: "var(--ns-fg)" }}>{formatMoney(c.value, primaryCurrency)}</span>
              </span>
              {c.ret != null && (
                <span className="muted">
                  1Y <span style={{ color: c.ret >= 0 ? "var(--ns-pos)" : "var(--ns-neg)", fontWeight: 600 }}>
                    {c.ret >= 0 ? "+" : "−"}{Math.abs(c.ret).toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Calendar heatmap helpers ──────────────────────────────────────────────────

/** Build day-by-day return array (null = weekend / no data) starting from the
 *  Monday of the week where portfolio history begins, up to `end`. */
function buildCalendarData(
  positions: AnalyticsPosition[],
  dailyPrices: DailyPrice[],
  manualSnapshots: ManualPriceSnapshot[],
  toPrimary: (value: number, currency: string, asOf?: string) => number,
  end: string,
): { daily: Array<number | null>; startDate: Date } {
  const start = daysAgo(370, end);
  const { series } = buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start, end });

  const retMap = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    if (prev > 0) retMap.set(series[i].date.slice(0, 10), (series[i].value / prev - 1) * 100);
  }

  // Snap back to the Monday of the first coverage week
  const coverageStart = series.length > 0 ? series[0].date.slice(0, 10) : start;
  const startDt = new Date(`${coverageStart}T00:00:00Z`);
  const wd0 = startDt.getUTCDay(); // 0=Sun … 6=Sat
  startDt.setUTCDate(startDt.getUTCDate() + (wd0 === 0 ? -6 : -(wd0 - 1)));

  const endDt = new Date(`${end}T00:00:00Z`);
  const daily: Array<number | null> = [];
  const cur = new Date(startDt);
  while (cur <= endDt) {
    const wd = cur.getUTCDay();
    daily.push(
      wd === 0 || wd === 6
        ? null
        : (retMap.get(cur.toISOString().slice(0, 10)) ?? null),
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return { daily, startDate: startDt };
}

// ── NSCalendarHeatmap component ───────────────────────────────────────────────

/** GitHub-style daily return heatmap. Mon–Fri cells colored by nsHeat; weekends blank. */
function NSCalendarHeatmap({
  daily,
  startDate,
  scale = 2.6,
  cell = 13,
  gap = 3,
}: {
  daily: Array<number | null>;
  startDate: Date;
  scale?: number;
  cell?: number;
  gap?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const weeks = Math.ceil(daily.length / 7);
  const W = weeks * (cell + gap);
  const H = 7 * (cell + gap);

  const dateOf = (i: number): Date => {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  };

  // One month label per new month, placed at the week where it first appears
  const monthMarks: Array<{ wk: number; m: number }> = [];
  let lastMonth = -1;
  for (let wk = 0; wk < weeks; wk++) {
    const d = dateOf(wk * 7);
    const m = d.getUTCMonth();
    if (m !== lastMonth) { monthMarks.push({ wk, m: m + 1 }); lastMonth = m; }
  }

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Month labels */}
        {monthMarks.map((mk) => (
          <text
            key={mk.wk}
            x={mk.wk * (cell + gap)}
            y={10}
            fontSize="10.5"
            fill="var(--ns-fg-dim)"
            fontFamily="var(--ns-font-mono)"
          >
            {mk.m}月
          </text>
        ))}
        {/* Day cells */}
        {daily.map((v, i) => {
          const wk = Math.floor(i / 7);
          const wd = i % 7;
          return (
            <rect
              key={i}
              x={wk * (cell + gap)}
              y={18 + wd * (cell + gap)}
              width={cell}
              height={cell}
              rx="2.5"
              fill={nsHeat(v, scale)}
              stroke={hover === i ? "var(--ns-fg)" : "transparent"}
              strokeWidth="1.2"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: v == null ? "default" : "pointer" }}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11 }}>
        <span className="mono muted">跌</span>
        {([-2.4, -1.2, 0, 1.2, 2.4] as const).map((v, i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 2.5, background: nsHeat(v, scale), display: "inline-block" }} />
        ))}
        <span className="mono muted">漲</span>
      </div>

      {/* Hover tooltip */}
      {hover != null && daily[hover] != null && (() => {
        const d = dateOf(hover);
        const wk = Math.floor(hover / 7);
        const v = daily[hover]!;
        return (
          <div style={{
            position: "absolute",
            left: `${(wk / weeks) * 100}%`,
            top: 0,
            transform: "translate(-50%, -100%)",
            pointerEvents: "none",
            background: "var(--ns-bg-card)",
            border: "1px solid var(--ns-border-strong)",
            borderRadius: "var(--ns-r-sm)",
            padding: "6px 9px",
            whiteSpace: "nowrap",
            boxShadow: "var(--ns-shadow-2)",
            fontFamily: "var(--ns-font-mono)",
            fontSize: 11.5,
          }}>
            <span className="muted">{d.getUTCMonth() + 1}/{d.getUTCDate()} </span>
            <span style={{ color: v >= 0 ? "var(--ns-pos)" : "var(--ns-neg)", fontWeight: 600 }}>
              {v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(2)}%
            </span>
          </div>
        );
      })()}
    </div>
  );
}
