import { ChartLineUp } from "@phosphor-icons/react";
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
import {
  alignByDate,
  allocationDriftSeries,
  annualizedVolatilityPct,
  buildBenchmarkSeries,
  buildPortfolioValueSeries,
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
  type AnalyticsPosition,
  type DailyPrice,
  type ManualPriceSnapshot,
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
  dailyPrices: DailyPrice[];
  manualSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  benchmarkTicker: string;
  /** Backfill all holdings' historical prices (the whole-tab empty-state CTA). */
  onBackfillHoldings: (range: "1y" | "5y") => void | Promise<void>;
  /** Ensure the benchmark ticker has history (auto-fired on first view). */
  onEnsureBenchmark: (ticker: string) => void | Promise<void>;
  backfilling: boolean;
}

export function InvestmentsAnalyticsTab({
  positions,
  dailyPrices,
  manualSnapshots,
  toPrimary,
  benchmarkTicker,
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
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis ? (
          <>
            <KpiCard label="Annual Volatility" note="年化波動率" value={fmtPct(kpis.vol, 1)} color="var(--ns-chart-2)" spark={kpis.volSpark} sub="年化標準差 · √252" />
            <KpiCard label="Sortino Ratio" note="越高越好" value={fmtRatio(kpis.sortino)} color="var(--ns-pos)" spark={kpis.sortinoSpark} sub={`下檔風險調整 · MAR ${(DEFAULT_RISK_FREE_RATE * 100).toFixed(1)}%`} />
            <KpiCard label="Sharpe Ratio" note="越高越好" value={fmtRatio(kpis.sharpe)} color="var(--ns-chart-1)" spark={kpis.sharpeSpark} sub={`無風險利率 ${(DEFAULT_RISK_FREE_RATE * 100).toFixed(1)}%`} />
            <KpiCard
              label="Max Drawdown"
              note="最大回撤"
              value={fmtPct(kpis.dd.drawdownPct, 1)}
              color="var(--ns-neg)"
              spark={kpis.ddSpark}
              sub={kpis.dd.troughDate ? `${kpis.dd.peakDate} → ${kpis.dd.troughDate} · ${kpis.dd.recovered ? "已恢復" : "未恢復"}` : "—"}
            />
          </>
        ) : null}
      </div>

      {/* ── Portfolio vs Benchmark ── */}
      <CossCard style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Performance</div>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>Portfolio vs Benchmark</h3>
          </div>
          <SegmentedControl value={period} onChange={setPeriod} options={periodOptions} />
        </div>

        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden", marginBottom: 14 }}>
          {[
            { label: "投資組合", val: perf.portFinal, color: perf.portFinal != null && perf.portFinal >= 0 ? "var(--ns-pos)" : "var(--ns-neg)" },
            { label: `${benchmarkTicker} 指標`, val: perf.benchFinal, color: "var(--ns-fg-muted)" },
            { label: "Alpha", val: perf.alpha, color: perf.alpha != null && perf.alpha >= 0 ? "var(--ns-accent)" : "var(--ns-neg)" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "12px 16px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
              <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
              <div className="num" style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--ns-font-mono)", color: s.color, fontVariantNumeric: "tabular-nums" }}>
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
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11.5, flexWrap: "wrap" }}>
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
          <div className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            部分標的歷史股價不足，本期間未納入分析：{core.excludedTickers.join("、")}。回補更長區間的歷史股價即可納入。
          </div>
        ) : null}
      </CossCard>

      {/* ── Allocation drift + Rolling volatility ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Allocation drift */}
        <CossCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Allocation</div>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>資產配置漂移 · 12 個月</h3>
          </div>
          {drift.data.length < 2 || drift.classes.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "24px 0" }}>歷史股價不足，無法顯示配置漂移。</div>
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
                  <span key={c} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                    <span className="muted">{c}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </CossCard>

        {/* Rolling 30-day volatility */}
        <CossCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 12 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Risk over time</div>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>滾動 30 日波動率</h3>
          </div>
          {rolling.data.length < 2 ? (
            <div className="muted" style={{ fontSize: 13, padding: "24px 0" }}>歷史股價不足，無法計算滾動波動率。</div>
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
                    <span className="muted" style={{ flex: 1, fontSize: 12.5 }}>{r.label}</span>
                    <span className="num" style={{ fontSize: 13, fontFamily: "var(--ns-font-mono)", color: r.dot, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
                    {r.note ? <span className="dim" style={{ fontSize: 10.5 }}>{r.note}</span> : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </CossCard>
      </div>
    </div>
  );
}

function KpiCard({ label, note, value, color, spark, sub }: {
  label: string;
  note: string;
  value: string;
  color: string;
  spark: Array<number | null>;
  sub: string;
}) {
  return (
    <CossCard style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <div className="ns-eyebrow" style={{ fontSize: 10 }}>{label}</div>
        <span className="mono dim" style={{ fontSize: 10 }}>{note}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div className="num" style={{ fontSize: "clamp(20px, 2.4vw, 26px)", fontWeight: 600, fontFamily: "var(--ns-font-mono)", color, fontVariantNumeric: "tabular-nums lining-nums", letterSpacing: -0.01, whiteSpace: "nowrap" }}>{value}</div>
        <Sparkline data={spark} color={color} />
      </div>
      <div className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>{sub}</div>
    </CossCard>
  );
}
