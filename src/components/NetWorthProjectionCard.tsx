/**
 * NetWorthProjectionCard — Dashboard card showing a 30-year future net-worth
 * projection curve with bear/bull scenario bands.
 *
 * Uses the shared `projectNetWorth` adapter (which delegates all math to the
 * same `projectRetirementScenarios` engine the FIRE Calculator page uses).
 * The numbers are therefore consistent between the two views.
 */

import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { projectNetWorth } from "../domain/netWorthProjection";
import { formatCompactMoney, formatMoney } from "../domain";
import { Card } from "./coss/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NetWorthProjectionCardProps {
  /** Current net worth in the primary currency. */
  netWorth: number;
  /**
   * Annual net contribution to use (income − expense × 12, trailing average).
   * Pass 0 when unknown / no ledger history yet.
   */
  annualContribution: number;
  /** ISO currency code for formatting labels (e.g. "TWD"). */
  primaryCurrency: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NetWorthProjectionCard({
  netWorth,
  annualContribution,
  primaryCurrency,
}: NetWorthProjectionCardProps) {
  const [returnPct, setReturnPct] = useState(7);

  const hasData = netWorth > 0 || annualContribution > 0;

  const projection = useMemo(
    () =>
      hasData ? projectNetWorth(netWorth, annualContribution, returnPct, primaryCurrency) : null,
    [netWorth, annualContribution, returnPct, primaryCurrency, hasData],
  );

  // ── Empty state ──
  if (!hasData) {
    return (
      <Card style={{ padding: "var(--ns-pad-card)" }}>
        <SectionHead />
        <div className="muted text-body" style={{ marginTop: 8 }}>
          建立帳戶並記錄收支後，將顯示 30 年淨值成長預測。
        </div>
      </Card>
    );
  }

  const { series, at10, at20, at30, bearCagr, bullCagr } = projection!;

  // Format compact for the chart tooltip
  const fmtTooltip = (value: number) => formatMoney(value, primaryCurrency);

  return (
    <Card style={{ padding: "var(--ns-pad-card)" }}>
      <SectionHead />

      {/* ── Milestone figures ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <MilestoneCell label="10 年後" value={at10} currency={primaryCurrency} />
        <MilestoneCell label="20 年後" value={at20} currency={primaryCurrency} />
        <MilestoneCell label="30 年後" value={at30} currency={primaryCurrency} />
      </div>

      {/* ── Chart ── */}
      <div style={{ position: "relative", height: 200 }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 0, left: 0, bottom: 24 }}>
              <defs>
                {/* Bear/bull fill band */}
                <linearGradient id="nwp-band" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                </linearGradient>
                {/* Neutral line gradient */}
                <linearGradient id="nwp-neutral" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="year"
                tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis hide domain={[0, "dataMax"]} />
              <Tooltip
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    bullBalance: `樂觀 ${bullCagr.toFixed(1)}%`,
                    neutralBalance: `中性 ${returnPct.toFixed(1)}%`,
                    bearBalance: `悲觀 ${bearCagr.toFixed(1)}%`,
                  };
                  const key = String(name);
                  return [fmtTooltip(Number(value)), labels[key] ?? key];
                }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--ns-border)",
                  background: "var(--ns-bg-elev)",
                }}
                itemStyle={{ color: "var(--ns-fg)" }}
                labelStyle={{ color: "var(--ns-fg-muted)", fontSize: 11 }}
                labelFormatter={(year) => `${year} 年`}
              />

              {/* Reference lines at 10/20/30-yr marks */}
              <ReferenceLine
                x={series[0]?.year ? series[0].year + 10 : undefined}
                stroke="var(--ns-border)"
                strokeDasharray="3 3"
              />
              <ReferenceLine
                x={series[0]?.year ? series[0].year + 20 : undefined}
                stroke="var(--ns-border)"
                strokeDasharray="3 3"
              />

              {/* Bull band (top boundary) */}
              <Area
                type="monotone"
                dataKey="bullBalance"
                stroke="var(--ns-pos)"
                strokeDasharray="4 4"
                strokeWidth={1}
                fill="url(#nwp-band)"
                dot={false}
                isAnimationActive={false}
              />
              {/* Bear band (bottom boundary — covers the band fill) */}
              <Area
                type="monotone"
                dataKey="bearBalance"
                stroke="var(--ns-chart-3)"
                strokeDasharray="4 4"
                strokeWidth={1}
                fill="var(--ns-bg)"
                dot={false}
                isAnimationActive={false}
              />
              {/* Neutral line */}
              <Area
                type="monotone"
                dataKey="neutralBalance"
                stroke="var(--ns-accent)"
                strokeWidth={2}
                fill="url(#nwp-neutral)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div
          className="text-xs"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            display: "flex",
            gap: 14,
            color: "var(--ns-fg-dim)",
          }}
        >
          <LegendDot color="var(--ns-chart-3)" dashed label={`悲觀 ${bearCagr.toFixed(1)}%`} />
          <LegendDot color="var(--ns-accent)" label={`中性 ${returnPct.toFixed(1)}%`} />
          <LegendDot color="var(--ns-pos)" dashed label={`樂觀 ${bullCagr.toFixed(1)}%`} />
        </div>
      </div>

      {/* ── Return assumption control ── */}
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>
            預期年化報酬（中性）
          </span>
          <span className="num text-xs" style={{ fontWeight: 600, color: "var(--ns-accent)" }}>
            {returnPct.toFixed(1)}%
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={15}
          step={0.5}
          value={returnPct}
          onChange={(e) => setReturnPct(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--ns-accent)", cursor: "pointer" }}
          aria-label="預期年化報酬率"
        />
        <div
          className="text-caption"
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--ns-fg-dim)",
            marginTop: 2,
          }}
        >
          <span>1%</span>
          <span>15%</span>
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div className="text-caption" style={{ color: "var(--ns-fg-dim)", marginTop: 12 }}>
        以名目金額（含通膨）顯示 · 情境幅度 ±2.5% · 僅供參考，非財務建議
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHead() {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="text-xs"
        style={{ marginBottom: 4, color: "var(--ns-fg-muted)", fontWeight: 500 }}
      >
        Future net worth · 30-year projection
      </div>
      <h3
        className="text-base"
        style={{
          margin: 0,
          fontFamily: "var(--ns-font-display)",
          fontWeight: 500,
        }}
      >
        30 年淨值預測
      </h3>
    </div>
  );
}

function MilestoneCell({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "var(--ns-r-md)",
        background: "var(--ns-bg-hover)",
        border: "1px solid var(--ns-border)",
      }}
    >
      <div
        className="text-xs"
        style={{ fontSize: 10, marginBottom: 4, color: "var(--ns-fg-muted)", fontWeight: 500 }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: "var(--ns-font-num)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--ns-fg)",
        }}
      >
        {formatCompactMoney(value, currency)}
      </div>
    </div>
  );
}

function LegendDot({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: 14,
          height: 2,
          background: dashed ? "none" : color,
          borderBottom: dashed ? `2px dashed ${color}` : "none",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
