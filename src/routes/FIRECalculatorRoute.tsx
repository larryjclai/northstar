import { CaretLeft, Star, Info, ChartLineUp, ChartBar, X } from "@phosphor-icons/react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, Line, LineChart } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { formatNumber, projectRetirementScenarios, todayInTimezone, type FinancialGoal, type IncomeItem } from "../domain";
import { computeNetWorthInCurrency } from "../features/goals/netWorth";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useToast } from "../components/Toast";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import type { FinancialGoalDraft } from "../data/repositories";

export function FIRECalculatorRoute() {
  const navigate = useNavigate();
  const toast = useToast();
  const { id: editingGoalId } = useSearch({ strict: false }) as { id?: string };
  const { accounts, assets, quotes, settings, dailyFxRates, financialGoals } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";

  const upsertGoal = useRepositoryMutation<FinancialGoalDraft & { id?: string }>(
    (repo, input) => repo.upsertFinancialGoal(input).then(() => {}),
    ["financialGoals"],
  );
  
  // Sync current assets from real account data
  const realNetWorth = useMemo(
    () => computeNetWorthInCurrency(primaryCurrency, accountRows, assetRows, quoteRows, appSettings, fxHistory),
    [primaryCurrency, accountRows, assetRows, quoteRows, appSettings, fxHistory],
  );

  const [currentAge, setCurrentAge] = useState(30);
  const [targetAge, setTargetAge] = useState(50);
  
  const [annualSavings, setAnnualSavings] = useState(580000);
  
  const [annualExpense, setAnnualExpense] = useState(1400000);
  const [swr, setSwr] = useState(4.0);
  
  const [cagr, setCagr] = useState(7.2);

  // Retirement income (pensions / 勞保 / annuities) offsets portfolio withdrawals.
  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);

  // currentAssets is always synced from real data
  const currentAssets = realNetWorth;

  // When opened via the goal edit pencil (?id=…), prefill the sliders from the
  // saved goal once it loads. A ref guards against clobbering edits on later
  // renders / data refreshes.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editingGoalId || prefilledFor.current === editingGoalId) return;
    const goal = (financialGoals.data ?? []).find((g) => g.id === editingGoalId && g.deletedAt === null);
    if (!goal) return;
    prefilledFor.current = editingGoalId;
    if (goal.currentAge != null) setCurrentAge(goal.currentAge);
    if (goal.retirementAge != null) setTargetAge(goal.retirementAge);
    if (goal.monthlyContribution) setAnnualSavings(Math.round(goal.monthlyContribution * 12));
    if (goal.annualSpending) setAnnualExpense(goal.annualSpending);
    // Stored rates are canonical decimals (0.04 = 4%) — repositories normalize
    // legacy percent-unit rows on load. Sliders run in percent.
    if (goal.withdrawalRate) setSwr(+(goal.withdrawalRate * 100).toFixed(1));
    if (goal.expectedAnnualReturn) setCagr(+(goal.expectedAnnualReturn * 100).toFixed(1));
    if (Array.isArray(goal.incomeItems)) setIncomeItems(goal.incomeItems);
  }, [editingGoalId, financialGoals.data]);

  const editingGoal = editingGoalId ? (financialGoals.data ?? []).find((g) => g.id === editingGoalId && g.deletedAt === null) ?? null : null;
  const isEditing = Boolean(editingGoal);

  const fireTarget = annualExpense / (swr / 100);
  const savingsRatePct = annualSavings + annualExpense > 0
    ? Math.round((annualSavings / (annualSavings + annualExpense)) * 100)
    : 0;

  // Drive the calculator from the same engine the saved goal + Goals page use
  // (domain/retirementProjection) so the math is consistent everywhere:
  // inflation, fees, and post-retirement returns are all modeled, instead of
  // the old ad-hoc nominal loop.
  const goalInput = useMemo<FinancialGoal>(() => ({
    id: editingGoalId ?? "fire-calc",
    spaceId: "", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    kind: "fire", name: "FIRE", currency: primaryCurrency,
    annualSpending: annualExpense,
    withdrawalRate: swr / 100,
    expectedAnnualReturn: cagr / 100,
    monthlyContribution: annualSavings / 12,
    targetAmount: null,
    startDate: new Date().toISOString().slice(0, 10),
    currentAge, retirementAge: targetAge, planThroughAge: null,
    preRetirementReturn: cagr / 100, postRetirementReturn: null,
    inflationRate: null, annualFee: null, contributionGrowthRate: null,
    spendingItems: [], incomeItems, displayMode: "today", accountShareMap: {},
  }), [editingGoalId, primaryCurrency, annualExpense, swr, cagr, annualSavings, currentAge, targetAge, incomeItems]);

  const scenarios = useMemo(
    () => projectRetirementScenarios({ goal: goalInput, currentValue: currentAssets }),
    [goalInput, currentAssets],
  );

  // Reshape the three scenarios into the series/fields the chart already reads.
  const projection = useMemo(() => {
    const base = scenarios.neutral.projection;
    const bearByAge = new Map(scenarios.pessimistic.projection.series.map((r) => [r.age, r.endBalance]));
    const bullByAge = new Map(scenarios.optimistic.projection.series.map((r) => [r.age, r.endBalance]));
    const series = base.series.map((r) => ({
      age: r.age,
      balance: r.endBalance,
      bearBalance: bearByAge.get(r.age) ?? r.endBalance,
      bullBalance: bullByAge.get(r.age) ?? r.endBalance,
      fireTarget,
    }));
    return {
      series,
      fiAge: base.fiAge,
      bearCagr: cagr - 2.5,
      bullCagr: cagr + 2.5,
      coastFireAmount: base.coastFireAmount,
      onTrack: base.onTrack,
      scenariosOnTrack: scenarios.scenariosOnTrack,
    };
  }, [scenarios, fireTarget, cagr]);

  const yearsToFi = projection.fiAge ? projection.fiAge - currentAge : null;

  const handleSaveGoal = async () => {
    try {
      await upsertGoal.mutateAsync({
        ...(editingGoal ? { id: editingGoal.id } : {}),
        kind: "fire",
        name: editingGoal?.name ?? "FIRE · 財務獨立",
        currency: editingGoal?.currency ?? primaryCurrency,
        annualSpending: annualExpense,
        withdrawalRate: swr / 100,
        expectedAnnualReturn: cagr / 100,
        monthlyContribution: annualSavings / 12,
        targetAmount: fireTarget,
        startDate: editingGoal?.startDate ?? new Date().toISOString().slice(0, 10),
        currentAge,
        retirementAge: targetAge,
        incomeItems,
      });
      toast.success(isEditing ? "已儲存變更" : "成功存為目標！");
      navigate({ to: "/goals" });
    } catch (e) {
      toast.error("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div style={{ padding: "32px 40px 100px", minHeight: "100vh", display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, flexShrink: 0 }}>
        <div>
          <Button variant="ghost" render={<Link to="/goals" />} style={{ marginLeft: -10, marginBottom: 6 }}>
            <CaretLeft size={14} />返回目標
          </Button>
          <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5, color: "var(--ns-fg-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            INTERACTIVE · 即時更新
          </div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 32, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            FIRE Calculator
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button onClick={handleSaveGoal}>
            <Star size={16} weight="bold" /> {isEditing ? "儲存變更" : "存為目標"}
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flex: 1, minHeight: 0 }}>
        {/* Left Sidebar: Sliders */}
        <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingRight: 8 }}>
          
          <SliderSection title="個人設定">
            <SliderRow label="目前年齡" value={`${currentAge} 歲`} min={20} max={65} minLabel="20 歲" maxLabel="65 歲" val={currentAge} setVal={setCurrentAge} />
            <SliderRow label="目標退休年齡" value={`${targetAge} 歲`} min={31} max={75} minLabel="31 歲" maxLabel="75 歲" val={targetAge} setVal={setTargetAge} />
          </SliderSection>

          <SliderSection title="財務狀況">
            {/* Current assets synced from account — display only */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "var(--ns-fg)" }}>目前資產</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>NT${formatNumber(currentAssets)}</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--ns-fg-dim)", background: "var(--ns-surface)", borderRadius: 6, padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <ChartBar size={13} weight="fill" /> 自動同步自帳戶淨值
              </div>
            </div>
            <SliderRow label="年儲蓄/投入" value={`NT$${formatNumber(annualSavings)}`} min={0} max={3000000} minLabel="NT$0" maxLabel="NT$3.00M" val={annualSavings} setVal={setAnnualSavings} />
          </SliderSection>

          <SliderSection title="退休後支出">
            <SliderRow label="年支出 (退休後)" value={`NT$${formatNumber(annualExpense)}`} min={600000} max={5000000} minLabel="NT$600K" maxLabel="NT$5.00M" val={annualExpense} setVal={setAnnualExpense} />
            <SliderRow label="安全提領率 SWR" value={`${swr.toFixed(1)}%`} min={2.0} max={6.0} step={0.1} minLabel="2.0%" maxLabel="6.0%" val={swr} setVal={setSwr} />
          </SliderSection>

          <SliderSection title="投資報酬">
            <SliderRow label="預期年化報酬 (CAGR)" value={`${cagr.toFixed(1)}%`} min={2.0} max={15.0} step={0.1} minLabel="2.0%" maxLabel="15.0%" val={cagr} setVal={setCagr} />
          </SliderSection>

          <RetirementIncomeSection
            items={incomeItems}
            setItems={setIncomeItems}
            defaultStartAge={targetAge}
          />

        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0, overflowY: "auto" }}>
          
          {/* Top 4 Cards */}
          <div style={{ display: "flex", gap: 16 }}>
            <MetricCard title="FIRE 目標" value={`NT$${(fireTarget / 1000000).toFixed(2)}M`} sub={`年支出 × ${Math.round(100/swr)} 倍`} />
            <MetricCard title="達成年份" value={`+${yearsToFi ?? "—"}y · ${projection.fiAge ?? "—"}歲`} sub={yearsToFi ? `預計 ${new Date().getFullYear() + yearsToFi} 年` : "—"} />
            <MetricCard title="COAST-FIRE" value={`NT$${(projection.coastFireAmount / 1000000).toFixed(2)}M`} sub="達到此金額後即使停止儲蓄也能自然成長到 FIRE" />
            <MetricCard title="情境穩健度" value={`${projection.scenariosOnTrack} / 3`} sub="悲觀／中性／樂觀情境下仍能撐到計畫年齡的數量" />
          </div>

          {/* Chart Card */}
          <Card style={{ padding: "24px", flex: 1, minHeight: 350 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", color: "var(--ns-fg-muted)", letterSpacing: 1, marginBottom: 8 }}>PROJECTION · 拖動滑桿即時更新</div>
                <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: -0.5 }}>
                  {yearsToFi ?? "-"} years <span style={{ fontSize: 20, color: "var(--ns-fg-muted)", fontWeight: 400 }}>to FIRE · age {projection.fiAge ?? "-"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ns-fg-dim)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 2, background: "var(--ns-fg-muted)" }}></div> FIRE goal</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 2, borderBottom: "2px dashed var(--ns-neg)" }}></div> Bear {projection.bearCagr.toFixed(1)}%</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 2, background: "var(--ns-accent)" }}></div> Base {cagr.toFixed(1)}%</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 2, borderBottom: "2px dashed var(--ns-pos)" }}></div> Bull {projection.bullCagr.toFixed(1)}%</span>
              </div>
            </div>

            <div style={{ flex: 1, width: "100%", position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection.series} margin={{ top: 20, right: 0, left: 0, bottom: 20 }}>
                  <XAxis dataKey="age" tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}歲`} minTickGap={30} />
                  <YAxis hide domain={[0, "dataMax"]} />
                  
                  <Line type="monotone" dataKey="fireTarget" stroke="var(--ns-border)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bullBalance" stroke="var(--ns-pos)" strokeDasharray="4 4" strokeWidth={1} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bearBalance" stroke="var(--ns-neg)" strokeDasharray="4 4" strokeWidth={1} dot={false} isAnimationActive={false} />
                  
                  <Line type="monotone" dataKey="balance" stroke="var(--ns-accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", bottom: -20, left: 0, fontSize: 11, color: "var(--ns-fg-dim)" }}>
                區間：悲觀 ↔ 樂觀 報酬 ±2.5% · 數值以今日購買力計（已計入通膨與費用）
              </div>
            </div>
          </Card>

          {/* Bottom 2 Cards */}
          <div style={{ display: "flex", gap: 16 }}>
            {/* 3 FIRE Types with explanations */}
            <Card style={{ padding: "20px 24px", flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 20 }}>FIRE 三種型態</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ns-warn)" }}></div> Lean FIRE
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>NT${(fireTarget * 0.7 / 1000000).toFixed(2)}M</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ns-fg-dim)", lineHeight: 1.5 }}>
                    以基本生活支出為基準，僅涵蓋必要開銷，適合願意維持節約生活型態的人。
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--ns-border)", paddingTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ns-accent)" }}></div> Regular FIRE
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>NT${(fireTarget / 1000000).toFixed(2)}M</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ns-fg-dim)", lineHeight: 1.5 }}>
                    以目前的生活水準為基準 (年支出 × {Math.round(100/swr)})，退休後可維持現有的消費習慣。
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--ns-border)", paddingTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--ns-chart-2)" }}></div> Fat FIRE
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>NT${(fireTarget * 1.5 / 1000000).toFixed(2)}M</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ns-fg-dim)", lineHeight: 1.5 }}>
                    以更優渥的生活為目標，涵蓋旅遊、嗜好等額外開銷，適合追求高品質退休生活的人。
                  </div>
                </div>
              </div>
            </Card>

            {/* Sensitivity */}
            <Card style={{ padding: "20px 24px", flex: 1.5 }}>
              <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 20 }}>達成敏感度</div>
              <div style={{ fontSize: 14, marginBottom: 16 }}>儲蓄率每增加 10%，退休提前：</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <div style={{ color: "var(--ns-fg-dim)" }}>目前儲蓄率</div>
                  <div style={{ fontWeight: 500 }}>{savingsRatePct}%</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <div style={{ color: "var(--ns-fg-dim)" }}>多存 10%</div>
                  <div style={{ fontWeight: 500 }}>NT${formatNumber(Math.round(annualSavings * 1.1))}/yr</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <div style={{ color: "var(--ns-fg-dim)" }}>SWR 3% vs 4%</div>
                  <div style={{ fontWeight: 500 }}>NT${(annualExpense / 0.03 / 1000000).toFixed(1)}M target</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <div style={{ color: "var(--ns-fg-dim)" }}>報酬多 1%</div>
                  <div style={{ fontWeight: 500 }}>約提早 2-3 年</div>
                </div>
              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}

function RetirementIncomeSection({
  items,
  setItems,
  defaultStartAge,
}: {
  items: IncomeItem[];
  setItems: (next: IncomeItem[]) => void;
  defaultStartAge: number;
}) {
  const update = (id: string, patch: Partial<IncomeItem>) =>
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const numFromInput = (raw: string) => Number(raw.replace(/[^\d.]/g, "")) || 0;

  return (
    <Card style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--ns-fg-muted)" }}>退休收入（選填）</div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            setItems([
              ...items,
              { id: crypto.randomUUID(), name: "", monthlyAmount: 0, startAge: defaultStartAge, endAge: 90, inflationLinked: false },
            ])
          }
        >
          ＋ 新增
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          勞保年金、企業年金、被動收入等會減少投資組合的提領壓力。新增後可設定金額、適用年齡與是否隨通膨調整。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--ns-border)" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="ns-input"
                  style={{ flex: 1 }}
                  placeholder="名稱（如 勞保年金）"
                  value={item.name}
                  onChange={(e) => update(item.id, { name: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="移除"
                  onClick={() => setItems(items.filter((it) => it.id !== item.id))}
                >
                  <X size={14} />
                </Button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <label className="ns-eyebrow" style={{ display: "block", marginBottom: 4, fontSize: 10 }}>月收入</label>
                  <input
                    className="ns-input mono"
                    style={{ textAlign: "right" }}
                    value={item.monthlyAmount ? item.monthlyAmount.toLocaleString("zh-TW") : ""}
                    placeholder="20,000"
                    onChange={(e) => update(item.id, { monthlyAmount: numFromInput(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="ns-eyebrow" style={{ display: "block", marginBottom: 4, fontSize: 10 }}>起始年齡</label>
                  <input
                    className="ns-input mono"
                    style={{ textAlign: "right" }}
                    value={item.startAge || ""}
                    placeholder="65"
                    onChange={(e) => update(item.id, { startAge: numFromInput(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="ns-eyebrow" style={{ display: "block", marginBottom: 4, fontSize: 10 }}>結束年齡</label>
                  <input
                    className="ns-input mono"
                    style={{ textAlign: "right" }}
                    value={item.endAge || ""}
                    placeholder="90"
                    onChange={(e) => update(item.id, { endAge: numFromInput(e.target.value) })}
                  />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ns-fg-dim)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={item.inflationLinked ?? false}
                  onChange={(e) => update(item.id, { inflationLinked: e.target.checked })}
                />
                隨通膨調整（如完全 COLA 連動的年金；勞保僅部分連動，建議不勾）
              </label>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SliderSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <Card style={{ padding: "20px" }}>
      <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 20 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {children}
      </div>
    </Card>
  );
}

function SliderRow({ label, value, min, max, step = 1, minLabel, maxLabel, val, setVal }: {
  label: string;
  /** Formatted display value, e.g. "NT$300,000" or "45 歲". */
  value: string;
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  val: number;
  setVal: (next: number) => void;
}) {
  const percentage = ((val - min) / (max - min)) * 100;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const startEditing = () => {
    setEditText(String(val));
    setIsEditing(true);
  };

  const commitEdit = () => {
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      setVal(step < 1 ? parseFloat(clamped.toFixed(1)) : Math.round(clamped));
    }
    setIsEditing(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--ns-fg)" }}>{label}</div>
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setIsEditing(false); }}
            style={{
              fontSize: 16, fontWeight: 500, width: 120, textAlign: "right",
              background: "var(--ns-surface)", border: "1px solid var(--ns-accent)",
              borderRadius: 6, padding: "2px 8px", color: "var(--ns-fg)", outline: "none"
            }}
          />
        ) : (
          <div
            onClick={startEditing}
            style={{ fontSize: 16, fontWeight: 500, cursor: "text", padding: "2px 8px", borderRadius: 6, border: "1px solid transparent", transition: "border-color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--ns-border)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
            title="點擊可直接輸入數值"
          >
            {value}
          </div>
        )}
      </div>
      <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 4, background: "var(--ns-surface-strong)", borderRadius: 2 }}></div>
        <div style={{ position: "absolute", left: 0, width: `${percentage}%`, height: 4, background: "var(--ns-accent)", borderRadius: 2 }}></div>
        <input 
          type="range" 
          min={min} max={max} step={step} 
          value={val} 
          onChange={e => setVal(parseFloat(e.target.value))}
          style={{ 
            position: "absolute", width: "100%", opacity: 0, cursor: "pointer", margin: 0 
          }} 
        />
        <div style={{ position: "absolute", left: `calc(${percentage}% - 8px)`, width: 16, height: 16, background: "var(--ns-accent)", border: "2px solid var(--ns-bg)", borderRadius: "50%", pointerEvents: "none" }}></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--ns-fg-muted)" }}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub }: { title: string, value: string, sub: string }) {
  return (
    <Card style={{ padding: "20px", flex: 1 }}>
      <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 500, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ns-fg-dim)" }}>{sub}</div>
    </Card>
  );
}
