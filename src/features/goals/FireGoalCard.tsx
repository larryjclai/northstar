import { ArrowRight, Confetti, Target } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { useFinanceData } from "../../data/hooks";
import { formatMoney, projectRetirement } from "../../domain";
import { computeNetWorthInCurrency } from "./netWorth";

/**
 * Compact summary card on the dashboard. Headline number, progress bar,
 * and a CTA to the new /goals page where the full plan editor lives.
 * Falls back to an empty state with a "建立目標" CTA when nothing is set.
 */
export function FireGoalCard() {
  const { financialGoals, accounts, assets, quotes, settings, dailyFxRates } = useFinanceData();
  const goal = (financialGoals.data ?? []).find((row) => row.kind === "fire") ?? null;
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];

  const currentValue = useMemo(
    () => goal ? computeNetWorthInCurrency(goal.currency, accountRows, assetRows, quoteRows, appSettings, fxHistory) : 0,
    [goal, accountRows, assetRows, quoteRows, appSettings, fxHistory],
  );

  const projection = useMemo(
    () => goal ? projectRetirement({ goal, currentValue }) : null,
    [goal, currentValue],
  );

  if (!goal || !projection) {
    return (
      <Card title="FIRE 目標">
        <EmptyState
          icon={<Target size={24} weight="duotone" />}
          title="尚未設定 FIRE 目標"
          description="到「目標」分頁建立 FIRE 計畫，看到達成 FIRE 的年齡、所需金額與每月需要的貢獻。"
          action={
            <Link
              to="/goals"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold outline-none transition"
              style={{ background: "var(--ns-accent)", color: "var(--ns-on-accent, white)" }}
            >
              <Target size={16} weight="fill" />前往目標
            </Link>
          }
        />
      </Card>
    );
  }

  const target = projection.targetAtRetirement;
  const progressPct = target > 0 ? Math.min(100, Math.max(0, (currentValue / target) * 100)) : 0;
  const reachedFi = currentValue >= target;

  return (
    <Card
      title={goal.name}
      action={
        <Link
          to="/goals"
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: "var(--ns-accent)" }}
        >
          查看完整計畫<ArrowRight size={12} />
        </Link>
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
            目前淨值
          </div>
          <div className="text-lg font-semibold tabular">{formatMoney(currentValue, goal.currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
            目標 @ {goal.retirementAge ?? 50} 歲
          </div>
          <div className="text-lg font-semibold tabular">{formatMoney(target, goal.currency)}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--ns-muted)" }}>
          <span>進度</span>
          <span className="tabular">{progressPct.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${progressPct}%`,
              background: reachedFi
                ? "var(--ns-positive, var(--ns-accent))"
                : projection.onTrack
                  ? "var(--ns-accent)"
                  : "var(--ns-danger, #c0392b)",
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryStat label="預估達成" value={projection.fiAge ? `${projection.fiAge} 歲` : "目前路徑不會達成"} />
        <SummaryStat label="目前進度" value={`${progressPct.toFixed(0)}%`} />
        <SummaryStat label="月貢獻" value={`${formatMoney(goal.monthlyContribution, goal.currency)} / 月`} />
      </div>

      {reachedFi ? (
        <div
          className="mt-4 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
          style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}
        >
          <Confetti size={18} weight="fill" />已達成 FIRE 目標
        </div>
      ) : null}
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{label}</div>
      <div className="mt-1 text-sm font-semibold tabular">{value}</div>
    </div>
  );
}
