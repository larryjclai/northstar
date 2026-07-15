import { CaretRight, Plus, Calculator, CheckCircle, Target, Star, Trash, PencilSimple } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { useToast } from "../components/Toast";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { computeLinkedAccountsValue, computeNetWorthInCurrency } from "../features/goals/netWorth";
import { GoalEditorSheet } from "../features/goals/GoalEditorSheet";
import { projectRetirement, resolveTargetAmount, formatNumber, formatCompactNumber, formatCompactMoney, type FinancialGoal } from "../domain";
import { goalPace } from "../domain/goalPace";
import { fireMetricAccountIdSet } from "../domain/bookScope";

export function GoalsRoute() {
  const { financialGoals, accounts, assets, investments, quotes, settings, dailyFxRates, books, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const bookRows = books.data ?? [];

  // 帳本 scope (plan 189 §1 #6): goals are FIRE-family — the FIRE goal's
  // "current net worth" is scoped by fireMetricAccountIdSet, switcher-
  // INDEPENDENT (a 公司帳 with includeInFireMetrics off never inflates personal
  // FIRE progress). Custom goals keep tracking their explicitly-bound accounts.
  // For a single default 個人帳 (FIRE toggle on) this is every account/asset →
  // identical to pre-books.
  const fireAccountIds = useMemo(() => fireMetricAccountIdSet(accountRows, bookRows), [accountRows, bookRows]);
  const fireAccounts = useMemo(() => accountRows.filter((a) => fireAccountIds.has(a.id)), [accountRows, fireAccountIds]);
  const fireAssets = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assetRows) {
      if (a.accountId != null && fireAccountIds.has(a.accountId)) ids.add(a.id);
    }
    for (const r of recordRows) {
      if (r.linkedAccountId != null && fireAccountIds.has(r.linkedAccountId)) ids.add(r.assetId);
    }
    return assetRows.filter((a) => ids.has(a.id));
  }, [assetRows, recordRows, fireAccountIds]);

  const toast = useToast();
  const navigate = useNavigate();

  const deleteGoal = useRepositoryMutation(
    (repository, id: string) => repository.deleteFinancialGoal(id),
    ["financialGoals"]
  );

  // Two-click delete confirm (DESIGN.md §12.4) — first click arms the row,
  // second click deletes. window.confirm is a no-op in the Tauri webview.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleDeleteGoal(id: string) {
    try {
      await deleteGoal.mutateAsync(id);
      setConfirmDeleteId(null);
      toast.success("已刪除目標");
    } catch (e) {
      toast.error("刪除目標失敗");
    }
  }

  // Custom-goal create/edit sheet. `{ goal: null }` = create mode.
  const [editor, setEditor] = useState<{ goal: FinancialGoal | null } | null>(null);

  const [activeProjection, setActiveProjection] = useState<"bear" | "base" | "bull">("base");

  const goals = (financialGoals.data ?? []).filter((g) => g.deletedAt === null);
  const fireGoal = goals.find((row) => row.kind === "fire") ?? null;

  // The hero card can show any active goal. Default to the FIRE goal, falling
  // back to the first goal so a custom-only user still sees a hero.
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? fireGoal ?? goals[0] ?? null;
  const isFire = selectedGoal?.kind === "fire";

  // Per-goal "current" value: FIRE tracks total net worth; custom goals track
  // the balances of their bound accounts (and report 0 when nothing is bound).
  const goalCurrentValues = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of goals) {
      map[g.id] = g.kind === "fire"
        ? computeNetWorthInCurrency(g.currency, fireAccounts, fireAssets, quoteRows, appSettings, fxHistory)
        : computeLinkedAccountsValue(g.currency, g.accountShareMap, accountRows, appSettings, fxHistory);
    }
    return map;
  }, [goals, accountRows, fireAccounts, fireAssets, quoteRows, appSettings, fxHistory]);

  const currentValue = selectedGoal ? goalCurrentValues[selectedGoal.id] ?? 0 : 0;

  const projectionRates = { bear: 0.05, base: 0.072, bull: 0.1 };
  const activeRate = projectionRates[activeProjection];

  const projection = useMemo(
    () => (selectedGoal && isFire ? projectRetirement({ goal: { ...selectedGoal, expectedAnnualReturn: activeRate }, currentValue }) : null),
    [selectedGoal, isFire, currentValue, activeRate],
  );

  // Headline figures for the selected goal. For FIRE we compound at the chosen
  // projection rate; for custom goals we normalise the stored return (which may
  // be a fraction or a percentage) and accumulate yearly savings.
  const stats = useMemo(() => {
    if (!selectedGoal) return null;
    const annualSaving = (selectedGoal.monthlyContribution || 0) * 12;
    const annualSpending = selectedGoal.annualSpending;
    // withdrawalRate is a canonical decimal (0.04 = 4%); show it in percent.
    const swrPct = +(selectedGoal.withdrawalRate * 100).toFixed(1);
    const target = resolveTargetAmount(selectedGoal);
    const rawReturn = selectedGoal.expectedAnnualReturn || 0;
    const rate = isFire ? activeRate : rawReturn > 1 ? rawReturn / 100 : rawReturn;
    let balance = currentValue;
    let years: number | null = null;
    for (let i = 0; i <= 60; i++) {
      if (target > 0 && balance >= target && years === null) years = i;
      balance = balance * (1 + rate) + annualSaving;
    }
    const progress = target > 0 ? Math.min(100, (currentValue / target) * 100) : 0;
    return { annualSaving, annualSpending, swrPct, target, years, progress, rate };
  }, [selectedGoal, isFire, currentValue, activeRate]);

  // Unified, labelled chart series. FIRE uses the age-based retirement
  // projection; custom goals use a year-based savings accumulation.
  const chartData = useMemo(() => {
    if (!selectedGoal || !stats) return [];
    if (isFire && projection) return projection.series.map((row) => ({ x: row.age, portfolio: row.endBalance }));
    const startYear = new Date().getFullYear();
    let balance = currentValue;
    const out: { x: number; portfolio: number }[] = [];
    for (let i = 0; i <= 30; i++) {
      out.push({ x: startYear + i, portfolio: Math.round(balance) });
      balance = balance * (1 + stats.rate) + stats.annualSaving;
    }
    return out;
  }, [selectedGoal, isFire, projection, stats, currentValue]);

  // 提領期資產耗盡的年齡：曲線曾為正、之後首次 ≤ 0 的點（無則 null）。
  const depletionX = useMemo(() => {
    let seenPositive = false;
    for (const p of chartData) {
      if (p.portfolio > 0) seenPositive = true;
      else if (seenPositive && p.portfolio <= 0) return p.x;
    }
    return null;
  }, [chartData]);
  const xUnit = isFire ? "歲" : "年";

  const chartColor = !isFire ? "var(--ns-accent)" : activeProjection === "bear" ? "var(--ns-chart-3)" : activeProjection === "bull" ? "var(--ns-accent)" : "var(--ns-pos)";

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <Skeleton className="h-[260px]" />
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

  return (
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px]" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <div className="flex justify-between gap-4" style={{ alignItems: "flex-end", marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div className="text-xs ns-field-label">Long-term progress</div>
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>目標・FIRE</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" render={<Link to="/goals/fire" />}>
            <Calculator size={16} /> FIRE Calculator
          </Button>
          <Button onClick={() => setEditor({ goal: null })}>
            <Plus size={16} weight="bold" /> 新目標
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Main goal hero card — shows whichever active goal is selected. */}
        {selectedGoal && stats ? (
          <Card className="p-5 gap-8" style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {/* Left column */}
            <div className="flex flex-col justify-between min-w-0" style={{ flex: "1 1 280px" }}>
              <div>
                {/* Goal switcher — only when there's more than one active goal. */}
                {goals.length > 1 ? (
                  <div className="flex gap-1.5 mb-4" style={{ flexWrap: "wrap" }}>
                    {goals.map((g) => {
                      const active = g.id === selectedGoal.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => setSelectedGoalId(g.id)}
                          className="text-xs"
                          style={{
                            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid",
                            background: active ? "var(--ns-surface-strong)" : "transparent",
                            borderColor: active ? "var(--ns-border)" : "transparent",
                            color: active ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                          }}
                        >
                          {g.kind === "fire" ? <Star size={14} weight="fill" color="var(--ns-pos)" /> : <Target size={14} color="var(--ns-accent)" />}
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs mb-3" style={{ color: "var(--ns-fg-muted)", letterSpacing: 0.5 }}>{selectedGoal.name}</div>
                )}
                <div className="flex items-baseline gap-2 mb-4">
                  {isFire ? (
                    <>
                      <span className="text-[40px] font-semibold" style={{ letterSpacing: -1 }}>{formatCompactMoney(currentValue, selectedGoal.currency)}</span>
                      <span className="text-sm" style={{ color: "var(--ns-fg-muted)" }}>/ {formatCompactNumber(stats.target)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[40px] font-semibold" style={{ letterSpacing: -1 }}>{selectedGoal.currency} {formatNumber(currentValue)}</span>
                      <span className="text-sm" style={{ color: "var(--ns-fg-muted)" }}>/ {formatNumber(stats.target)}</span>
                    </>
                  )}
                </div>
                <div className="mb-3" style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
                  <div style={{ width: `${stats.progress.toFixed(1)}%`, height: "100%", background: "linear-gradient(90deg, var(--ns-accent), var(--ns-pos))", borderRadius: 3 }} />
                </div>
                <div className="text-body" style={{ color: "var(--ns-fg-dim)" }}>
                  {!isFire && Object.values(selectedGoal.accountShareMap ?? {}).filter((w) => w > 0).length === 0
                    ? <>尚未綁定帳戶 — <button onClick={() => setEditor({ goal: selectedGoal })} style={{ color: "var(--ns-accent)", cursor: "pointer", background: "none", border: "none", padding: 0, font: "inherit" }}>編輯目標</button> 以追蹤進度</>
                    : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{stats.progress.toFixed(1)}% · {stats.years !== null ? `預估 ${stats.years} 年後達成 (${new Date().getFullYear() + stats.years})` : "尚無法預估"}</span>
                        {(() => {
                          if (isFire) return null;
                          const pace = goalPace({ startDate: selectedGoal.startDate, targetDate: selectedGoal.targetDate, actualPct: stats.progress });
                          if (pace.status === "none") return null;
                          const chipStyle: CSSProperties = {
                            display: "inline-flex", alignItems: "center",
                            padding: "1px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: "20px",
                            background: pace.status === "ahead" ? "color-mix(in srgb, var(--ns-pos) 15%, transparent)"
                              : pace.status === "behind" ? "color-mix(in srgb, var(--ns-neg) 15%, transparent)"
                              : "color-mix(in srgb, var(--ns-fg-muted) 15%, transparent)",
                            color: pace.status === "ahead" ? "var(--ns-pos)"
                              : pace.status === "behind" ? "var(--ns-neg)"
                              : "var(--ns-fg-muted)",
                          };
                          const label = pace.status === "ahead" ? "超前" : pace.status === "behind" ? "落後" : "準時";
                          return <span style={chipStyle}>{label}</span>;
                        })()}
                      </span>
                    )}
                </div>
              </div>
              <div className="gap-6" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", marginTop: 48 }}>
                {isFire ? (
                  <>
                    <Stat label="年儲蓄" value={`NT$${formatNumber(stats.annualSaving)}`} />
                    <Stat label="假設報酬率" value={`${(activeRate * 100).toFixed(1)}%`} />
                    <Stat label="年支出基準" value={`NT$${formatNumber(stats.annualSpending)}`} />
                    <Stat label="SWR" value={`${stats.swrPct}%`} />
                  </>
                ) : (
                  <>
                    <Stat label="已存金額" value={`${selectedGoal.currency} ${formatNumber(currentValue)}`} />
                    <Stat label="目標金額" value={`${selectedGoal.currency} ${formatNumber(stats.target)}`} />
                    <Stat label="年儲蓄" value={`${selectedGoal.currency} ${formatNumber(stats.annualSaving)}`} />
                    <Stat label="假設報酬率" value={`${(stats.rate * 100).toFixed(1)}%`} />
                  </>
                )}
              </div>
            </div>

            {/* Right column: chart */}
            <div className="flex-1 flex flex-col" style={{ minWidth: 280 }}>
              <div className="flex justify-between items-center mb-4">
                <div className="text-caption" style={{ fontFamily: "var(--ns-font-mono)", color: "var(--ns-fg-muted)", letterSpacing: 1 }}>PROJECTION</div>
                {isFire ? (
                  <div className="flex gap-2">
                    {([["bear", "保守 5%"], ["base", "基準 7.2%"], ["bull", "樂觀 10%"]] as const).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setActiveProjection(k)}
                        className="text-xs"
                        style={{
                          padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid",
                          background: activeProjection === k ? "var(--ns-surface-strong)" : "transparent",
                          borderColor: activeProjection === k ? "var(--ns-border)" : "transparent",
                          color: activeProjection === k ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-caption" style={{ color: "var(--ns-fg-dim)" }}>依年儲蓄推估</div>
                )}
              </div>
              <div className="flex-1 w-full" style={{ minHeight: 220 }}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fireChartGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
                      <XAxis dataKey="x" tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${xUnit}`} minTickGap={28} />
                      <YAxis tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => formatCompactNumber(Number(v))} domain={["dataMin", "dataMax"]} />
                      <Tooltip
                        formatter={(value) => [`NT$${formatNumber(Number(value))}`, "預估淨值"]}
                        labelFormatter={(l) => `${l}${xUnit}`}
                        contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
                        itemStyle={{ color: "var(--ns-fg)" }}
                        labelStyle={{ color: "var(--ns-fg-muted)" }}
                      />
                      {stats.target > 0 ? (
                        <ReferenceLine y={stats.target} stroke="var(--ns-border-strong)" strokeDasharray="4 4" label={{ value: "目標", position: "insideTopRight", fill: "var(--ns-fg-muted)", fontSize: 10 }} />
                      ) : null}
                      {depletionX != null ? (
                        <ReferenceLine x={depletionX} stroke="var(--ns-warn)" strokeDasharray="4 4"
                          label={{ value: "預估資產耗盡", position: "insideTopLeft", fill: "var(--ns-warn)", fontSize: 10 }} />
                      ) : null}
                      <Area type="monotone" dataKey="portfolio" stroke={chartColor} fill="url(#fireChartGradient)" strokeWidth={2} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="muted text-body flex items-center justify-center" style={{ height: "100%" }}>
                    補上年齡 / 報酬假設後即可預估退休曲線。
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="text-center" style={{ padding: 40 }}>
            <div className="items-center justify-center mb-4" style={{ width: 56, height: 56, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "inline-flex" }}>
              <Star size={26} weight="fill" />
            </div>
            <div className="text-base font-semibold mb-1.5">還沒有目標</div>
            <div className="muted text-body" style={{ marginBottom: 18 }}>用 FIRE 計算機追蹤財務自由進度，或建立旅遊、買車等自訂儲蓄目標。</div>
            <div className="flex justify-center" style={{ gap: 10 }}>
              <Button render={<Link to="/goals/fire" />}><Calculator size={14} />開啟 FIRE 計算機</Button>
              <Button variant="outline" onClick={() => setEditor({ goal: null })}><Plus size={14} weight="bold" />新增自訂目標</Button>
            </div>
          </Card>
        )}

        {/* Goals list */}
        <Card style={{ padding: "24px 0", overflow: "hidden" }}>
          <div className="flex justify-between items-center mb-5" style={{ padding: "0 32px" }}>
            <h2 className="text-lg font-medium" style={{ margin: 0 }}>{goals.length} 個進行中目標</h2>
          </div>

          {goals.length === 0 ? (
            <div className="muted text-body" style={{ padding: "8px 32px 8px" }}>
              還沒有目標。到 <Link to="/goals/fire" style={{ color: "var(--ns-accent)" }}>FIRE 計算機</Link> 建立第一個目標。
            </div>
          ) : (
            <div className="flex flex-col">
              {goals.map((goal, i) => {
                const target = resolveTargetAmount(goal);
                const current = goalCurrentValues[goal.id] ?? 0;
                const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                const achieved = progress >= 100;
                const boundCount = Object.values(goal.accountShareMap ?? {}).filter((w) => w > 0).length;
                const Icon = goal.kind === "fire" ? Star : Target;
                const color = goal.kind === "fire" ? "var(--ns-pos)" : "var(--ns-accent)";
                return (
                  <div key={goal.id} className="flex items-center" style={{ flexWrap: "wrap", rowGap: 12, padding: "14px 18px", borderBottom: i < goals.length - 1 ? "1px solid var(--ns-border)" : "none" }}>
                    <div className="flex items-center justify-center mr-4 shrink-0" style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ns-surface-strong)" }}>
                      <Icon size={20} color={color} weight={goal.kind === "fire" ? "fill" : "regular"} />
                    </div>
                    <div className="min-w-0" style={{ flex: "1 1 140px" }}>
                      <div className="text-[15px] font-medium mb-1 truncate">{goal.name}</div>
                      <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>
                        {goal.kind === "fire"
                          ? "FIRE · 依淨值估算"
                          : boundCount > 0 ? `自訂目標 · 綁定 ${boundCount} 個帳戶` : "自訂目標 · 尚未綁定帳戶"}
                      </div>
                    </div>
                    <div className="text-right" style={{ flex: "0 0 auto" }}>
                      <div className="text-sm font-medium mb-1" style={{ whiteSpace: "nowrap" }}>{goal.currency} {formatNumber(current)}</div>
                      <div className="text-xs" style={{ color: "var(--ns-fg-dim)", whiteSpace: "nowrap" }}>/ {formatNumber(target)}</div>
                    </div>
                    <div className="flex items-center gap-3" style={{ flex: "1 1 180px" }}>
                      <div className="flex-1" style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: color, borderRadius: 3 }} />
                      </div>
                      <div className="text-body text-right shrink-0" style={{ color: "var(--ns-fg-dim)", width: 48 }}>{progress.toFixed(1)}%</div>
                    </div>
                    <div className="flex items-center gap-3" style={{ flex: "0 0 auto", marginLeft: "auto" }}>
                      {achieved ? (
                        <span className="text-body flex items-center gap-1" style={{ color: "var(--ns-pos)" }}><CheckCircle size={14} weight="fill" /> 達成</span>
                      ) : (
                        <span className="text-body" style={{ color: "var(--ns-fg-dim)" }}>追蹤中</span>
                      )}
                      <div className="flex gap-2 items-center">
                        {confirmDeleteId === goal.id ? (
                          <>
                            <Button variant="outline" size="sm" className="text-xs" style={{ color: "var(--ns-neg)" }} onClick={() => handleDeleteGoal(goal.id)}>確定刪除</Button>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setConfirmDeleteId(null)}>取消</Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost" size="icon-sm" title="編輯"
                              onClick={() => goal.kind === "fire" ? navigate({ to: "/goals/fire", search: { id: goal.id } }) : setEditor({ goal })}
                            ><PencilSimple size={14} /></Button>
                            <Button variant="ghost" size="icon-sm" title="刪除" style={{ color: "var(--ns-neg)" }} onClick={() => setConfirmDeleteId(goal.id)}><Trash size={14} /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {editor !== null && (
        <GoalEditorSheet
          goal={editor.goal}
          accounts={accountRows}
          primaryCurrency={appSettings?.primaryCurrency ?? "TWD"}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--ns-fg-muted)" }}>{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
