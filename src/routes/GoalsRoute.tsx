import { CaretRight, Plus, Calculator, CheckCircle, Target, Star, Trash, PencilSimple } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { useToast } from "../components/Toast";
import { computeNetWorthInCurrency } from "../features/goals/netWorth";
import { projectRetirement, formatNumber, type FinancialGoal } from "../domain";

function goalTargetAmount(goal: FinancialGoal): number {
  if (goal.targetAmount && goal.targetAmount > 0) return goal.targetAmount;
  if (goal.annualSpending > 0 && goal.withdrawalRate > 0) return goal.annualSpending / (goal.withdrawalRate / 100);
  return 0;
}

export function GoalsRoute() {
  const { financialGoals, accounts, assets, quotes, settings, dailyFxRates } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];

  const toast = useToast();
  const navigate = useNavigate();

  const deleteGoal = useRepositoryMutation(
    (repository, id: string) => repository.deleteFinancialGoal(id),
    ["financialGoals"]
  );

  async function handleDeleteGoal(id: string) {
    try {
      await deleteGoal.mutateAsync(id);
      toast.success("已刪除目標");
    } catch (e) {
      toast.error("刪除目標失敗");
    }
  }

  const [activeProjection, setActiveProjection] = useState<"bear" | "base" | "bull">("base");

  const goals = (financialGoals.data ?? []).filter((g) => g.deletedAt === null);
  const fireGoal = goals.find((row) => row.kind === "fire") ?? null;

  const currentValue = useMemo(
    () => (fireGoal ? computeNetWorthInCurrency(fireGoal.currency, accountRows, assetRows, quoteRows, appSettings, fxHistory) : 0),
    [fireGoal, accountRows, assetRows, quoteRows, appSettings, fxHistory],
  );

  const projectionRates = { bear: 0.05, base: 0.072, bull: 0.1 };
  const activeRate = projectionRates[activeProjection];

  const projection = useMemo(
    () => (fireGoal ? projectRetirement({ goal: { ...fireGoal, expectedAnnualReturn: activeRate }, currentValue }) : null),
    [fireGoal, currentValue, activeRate],
  );

  const chartData = useMemo(() => {
    if (projection) return projection.series.map((row) => ({ age: row.age, portfolio: row.endBalance }));
    return [];
  }, [projection]);

  // FIRE card figures, derived from the real goal.
  const fireStats = useMemo(() => {
    if (!fireGoal) return null;
    const annualSaving = (fireGoal.monthlyContribution || 0) * 12;
    const annualSpending = fireGoal.annualSpending;
    const swr = fireGoal.withdrawalRate;
    const target = goalTargetAmount(fireGoal);
    let balance = currentValue;
    let fiYears: number | null = null;
    for (let i = 0; i <= 60; i++) {
      if (target > 0 && balance >= target && fiYears === null) fiYears = i;
      balance = balance * (1 + activeRate) + annualSaving;
    }
    const progress = target > 0 ? Math.min(100, (currentValue / target) * 100) : 0;
    return { annualSaving, annualSpending, swr, target, fiYears, progress };
  }, [fireGoal, currentValue, activeRate]);

  const chartColor = activeProjection === "bear" ? "var(--ns-neg)" : activeProjection === "bull" ? "var(--ns-accent)" : "var(--ns-pos)";

  return (
    <div style={{ padding: "32px 40px 100px", overflowY: "auto", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5, color: "var(--ns-fg-muted)", marginBottom: 8 }}>LONG-TERM PROGRESS</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 32, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>Goals &amp; FIRE</h1>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/goals/fire" className="ns-btn ghost" style={{ textDecoration: "none" }}>
            <Calculator size={16} /> FIRE Calculator
          </Link>
          <Link to="/goals/fire" className="ns-btn primary">
            <Plus size={16} weight="bold" /> 新目標
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Main FIRE Card */}
        {fireGoal && fireStats ? (
          <div className="ns-card" style={{ padding: 32, display: "flex", gap: 48, flexWrap: "wrap" }}>
            {/* Left column */}
            <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 12, letterSpacing: 0.5 }}>{fireGoal.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>NT${(currentValue / 1_000_000).toFixed(2)}M</span>
                  <span style={{ fontSize: 14, color: "var(--ns-fg-muted)" }}>/ NT${(fireStats.target / 1_000_000).toFixed(0)}M</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden", marginBottom: 12 }}>
                  <div style={{ width: `${fireStats.progress.toFixed(1)}%`, height: "100%", background: "linear-gradient(90deg, var(--ns-accent), var(--ns-pos))", borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 13, color: "var(--ns-fg-dim)" }}>
                  {fireStats.progress.toFixed(1)}% · {fireStats.fiYears !== null ? `預估 ${fireStats.fiYears} 年後達成 (${new Date().getFullYear() + fireStats.fiYears})` : "尚無法預估"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 48 }}>
                <Stat label="年儲蓄" value={`NT$${formatNumber(fireStats.annualSaving)}`} />
                <Stat label="假設報酬率" value={`${(activeRate * 100).toFixed(1)}%`} />
                <Stat label="年支出基準" value={`NT$${formatNumber(fireStats.annualSpending)}`} />
                <Stat label="SWR" value={`${fireStats.swr}%`} />
              </div>
            </div>

            {/* Right column: chart */}
            <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", color: "var(--ns-fg-muted)", letterSpacing: 1 }}>PROJECTION</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["bear", "保守 5%"], ["base", "基準 7.2%"], ["bull", "樂觀 10%"]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setActiveProjection(k)}
                      style={{
                        fontSize: 12, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid",
                        background: activeProjection === k ? "var(--ns-surface-strong)" : "transparent",
                        borderColor: activeProjection === k ? "var(--ns-border)" : "transparent",
                        color: activeProjection === k ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 220, width: "100%" }}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fireChartGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="age" hide />
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Area type="monotone" dataKey="portfolio" stroke={chartColor} fill="url(#fireChartGradient)" strokeWidth={2} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="muted" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                    補上年齡 / 報酬假設後即可預估退休曲線。
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="ns-card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Star size={26} weight="fill" />
            </div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>還沒有 FIRE 目標</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 18 }}>設定年支出、提領率與報酬假設，Northstar 會用你的真實淨值估算何時財務自由。</div>
            <Link to="/goals/fire" className="ns-btn primary"><Calculator size={14} />開啟 FIRE 計算機</Link>
          </div>
        )}

        {/* Goals list */}
        <div className="ns-card" style={{ padding: "24px 0", overflow: "hidden" }}>
          <div style={{ padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{goals.length} active {goals.length === 1 ? "goal" : "goals"}</h2>
          </div>

          {goals.length === 0 ? (
            <div className="muted" style={{ padding: "8px 32px 8px", fontSize: 13 }}>
              還沒有目標。到 <Link to="/goals/fire" style={{ color: "var(--ns-accent)" }}>FIRE 計算機</Link> 建立第一個目標。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {goals.map((goal, i) => {
                const target = goalTargetAmount(goal);
                const current = goal.kind === "fire" ? currentValue : (currentValue / goalTargetAmount(goal)) * 100;
                const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                const achieved = progress >= 100;
                const Icon = goal.kind === "fire" ? Star : Target;
                const color = goal.kind === "fire" ? "var(--ns-pos)" : "var(--ns-accent)";
                return (
                  <div key={goal.id} style={{ display: "flex", alignItems: "center", padding: "16px 32px", borderBottom: i < goals.length - 1 ? "1px solid var(--ns-border)" : "none" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ns-surface-strong)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 16, flexShrink: 0 }}>
                      <Icon size={20} color={color} weight={goal.kind === "fire" ? "fill" : "regular"} />
                    </div>
                    <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{goal.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ns-fg-muted)" }}>{goal.kind === "fire" ? "FIRE · 依淨值估算" : "一般目標"}</div>
                    </div>
                    <div style={{ flex: "0 0 180px" }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>NT${formatNumber(current)}</div>
                      <div style={{ fontSize: 12, color: "var(--ns-fg-dim)" }}>/ NT${formatNumber(target)}</div>
                    </div>
                    <div style={{ flex: 1, paddingRight: 48, display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: color, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ns-fg-dim)", width: 48, textAlign: "right" }}>{progress.toFixed(1)}%</div>
                    </div>
                    <div style={{ flex: "0 0 120px", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 16 }}>
                      {achieved ? (
                        <span style={{ fontSize: 13, color: "var(--ns-pos)", display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={14} weight="fill" /> 達成</span>
                      ) : (
                        <span style={{ fontSize: 13, color: "var(--ns-fg-dim)" }}>追蹤中</span>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="ns-btn ghost icon" title="編輯" onClick={() => navigate({ to: goal.kind === "fire" ? "/goals/fire" : "/goals", search: { id: goal.id } })}><PencilSimple size={14} /></button>
                        <button className="ns-btn ghost icon" title="刪除" style={{ color: "var(--ns-neg)" }} onClick={() => handleDeleteGoal(goal.id)}><Trash size={14} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
