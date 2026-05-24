import { Confetti, Flag, Target } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { useFinanceData } from "../../data/hooks";
import {
  calculateFireProjection,
  createFxConverter,
  formatMoney,
  formatNumber,
  resolveTargetAmount,
  type Account,
  type AppSettings,
  type DailyFxRate,
  type PortfolioAsset,
} from "../../domain";

export function FireGoalCard() {
  const { financialGoals, accounts, assets, quotes, settings, dailyFxRates } = useFinanceData();
  const goal = (financialGoals.data ?? []).find((row) => row.kind === "fire") ?? null;
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];

  const currentValueInGoalCurrency = useMemo(
    () => goal ? netWorthIn(goal.currency, accountRows, assetRows, quoteRows, appSettings, fxHistory) : 0,
    [goal, accountRows, assetRows, quoteRows, appSettings, fxHistory],
  );

  if (!goal) {
    return (
      <Card title="FIRE 目標">
        <EmptyState
          icon={<Target size={24} weight="duotone" />}
          title="尚未設定 FIRE 目標"
          description="到「設定 → 目標」填入年支出與每月投入，就能看到達成 FIRE 的進度與預估時間。"
          action={
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold outline-none transition"
              style={{ background: "var(--ns-accent)", color: "var(--ns-on-accent, white)" }}
            >
              <Flag size={16} weight="fill" />前往設定
            </Link>
          }
        />
      </Card>
    );
  }

  const targetAmount = resolveTargetAmount(goal);
  const projection = calculateFireProjection({
    currentValue: currentValueInGoalCurrency,
    monthlyContribution: goal.monthlyContribution,
    expectedAnnualReturn: goal.expectedAnnualReturn,
    targetAmount,
  });

  const progressPct = Math.min(100, Math.max(0, projection.progressRatio * 100));
  const projectedYear =
    projection.projectedTargetDate?.toISOString().slice(0, 7).replace("-", " / ") ?? null;

  return (
    <Card title={goal.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
            目標
          </div>
          <div className="text-lg font-semibold">{formatMoney(targetAmount, goal.currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
            目前淨值
          </div>
          <div className="text-lg font-semibold tabular">{formatMoney(currentValueInGoalCurrency, goal.currency)}</div>
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
              background: projection.achieved
                ? "var(--ns-positive, var(--ns-accent))"
                : "var(--ns-accent)",
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ProjectionRow
          label="距離目標"
          value={projection.achieved ? "🎉 已達成" : projection.monthsToTarget === null ? "—" : `${formatNumber(targetAmount - currentValueInGoalCurrency)} ${goal.currency}`}
        />
        <ProjectionRow
          label="預估達成時間"
          value={
            projection.achieved
              ? "已達成"
              : projection.monthsToTarget === null
                ? "目前路徑無法達成"
                : `${projection.yearsToTarget?.toFixed(1)} 年 (${projectedYear ?? "—"})`
          }
        />
        <ProjectionRow
          label="月貢獻"
          value={`${formatMoney(goal.monthlyContribution, goal.currency)} / 月`}
        />
        <ProjectionRow
          label="假設"
          value={`提領率 ${(goal.withdrawalRate * 100).toFixed(1)}% · 報酬率 ${(goal.expectedAnnualReturn * 100).toFixed(1)}%`}
        />
      </div>

      {projection.achieved ? (
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

function ProjectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{label}</div>
      <div className="mt-1 text-sm font-semibold tabular">{value}</div>
    </div>
  );
}

/**
 * Compute net worth in the goal's denominated currency. We first convert
 * every account balance and holding market value into the user's primary
 * currency (using the existing FX history + manual rates), then re-convert
 * that primary-currency total into the goal currency. Two-step keeps the
 * existing `createFxConverter` reusable.
 */
function netWorthIn(
  goalCurrency: string,
  accountRows: Account[],
  assetRows: PortfolioAsset[],
  quoteRows: Array<{ symbol: string; price: number; currency: string }>,
  appSettings: AppSettings | undefined,
  fxHistory: DailyFxRate[],
) {
  if (!appSettings) return 0;
  const primaryConverter = createFxConverter(appSettings, fxHistory);
  const primary = appSettings.primaryCurrency;

  const cashInPrimary = accountRows.reduce(
    (sum, account) => sum + primaryConverter.toPrimary(account.balance, account.currency),
    0,
  );
  const holdingsInPrimary = assetRows.reduce((sum, asset) => {
    const quote = quoteRows.find((row) => row.symbol.toUpperCase() === asset.ticker.toUpperCase());
    const marketValue = (quote?.price ?? 0) * asset.totalQuantity;
    return sum + primaryConverter.toPrimary(marketValue, quote?.currency ?? asset.currency);
  }, 0);
  const netInPrimary = cashInPrimary + holdingsInPrimary;

  if (goalCurrency.toUpperCase() === primary.toUpperCase()) return netInPrimary;

  const goalConverter = createFxConverter({ ...appSettings, primaryCurrency: goalCurrency.toUpperCase() }, fxHistory);
  return goalConverter.toPrimary(netInPrimary, primary);
}
