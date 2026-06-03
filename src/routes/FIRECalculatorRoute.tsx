import { DownloadSimple, Star, Info, ChartLineUp } from "@phosphor-icons/react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, Line, LineChart } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { formatNumber, todayInTimezone } from "../domain";
import { computeNetWorthInCurrency } from "../features/goals/netWorth";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useToast } from "../components/Toast";
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
    if (goal.withdrawalRate) setSwr(goal.withdrawalRate <= 1 ? goal.withdrawalRate * 100 : goal.withdrawalRate);
    if (goal.expectedAnnualReturn) setCagr(goal.expectedAnnualReturn <= 1 ? goal.expectedAnnualReturn * 100 : goal.expectedAnnualReturn);
  }, [editingGoalId, financialGoals.data]);

  const editingGoal = editingGoalId ? (financialGoals.data ?? []).find((g) => g.id === editingGoalId && g.deletedAt === null) ?? null : null;
  const isEditing = Boolean(editingGoal);

  const fireTarget = annualExpense / (swr / 100);
  
  // Calculate Base projection
  const projection = useMemo(() => {
    let balance = currentAssets;
    let age = currentAge;
    const series = [];
    let fiAge: number | null = null;

    // Bear/Bull rates
    const bearCagr = Math.max(cagr - 2.5, 1);
    const bullCagr = cagr + 2.5;
    let bearBal = currentAssets;
    let bullBal = currentAssets;
    
    for (let i = 0; i <= 40; i++) {
      if (balance >= fireTarget && !fiAge) {
        fiAge = age;
      }
      series.push({
        age,
        balance,
        bearBalance: bearBal,
        bullBalance: bullBal,
        fireTarget
      });
      balance = balance * (1 + cagr / 100) + annualSavings;
      bearBal = bearBal * (1 + bearCagr / 100) + annualSavings;
      bullBal = bullBal * (1 + bullCagr / 100) + annualSavings;
      age++;
    }
    return { series, fiAge, bearCagr, bullCagr };
  }, [currentAge, currentAssets, annualSavings, annualExpense, swr, cagr, fireTarget]);

  const yearsToFi = projection.fiAge ? projection.fiAge - currentAge : null;

  const handleSaveGoal = async () => {
    try {
      await upsertGoal.mutateAsync({
        ...(editingGoal ? { id: editingGoal.id } : {}),
        kind: "fire",
        name: editingGoal?.name ?? "FIRE · 財務獨立",
        currency: editingGoal?.currency ?? primaryCurrency,
        annualSpending: annualExpense,
        withdrawalRate: swr,
        expectedAnnualReturn: cagr,
        monthlyContribution: annualSavings / 12,
        targetAmount: fireTarget,
        startDate: editingGoal?.startDate ?? new Date().toISOString().slice(0, 10),
        currentAge,
        retirementAge: targetAge,
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
          <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5, color: "var(--ns-fg-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            INTERACTIVE · 即時更新
          </div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 32, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            FIRE Calculator
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="ns-btn ghost" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
            <DownloadSimple size={16} /> 匯出報告
          </button>
          <button onClick={handleSaveGoal} className="ns-btn primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
            <Star size={16} weight="bold" /> {isEditing ? "儲存變更" : "存為目標"}
          </button>
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
              <div style={{ fontSize: 11, color: "var(--ns-fg-dim)", background: "var(--ns-surface)", borderRadius: 6, padding: "6px 10px" }}>
                📊 自動同步自帳戶淨值
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
          
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0, overflowY: "auto" }}>
          
          {/* Top 4 Cards */}
          <div style={{ display: "flex", gap: 16 }}>
            <MetricCard title="FIRE 目標" value={`NT$${(fireTarget / 1000000).toFixed(2)}M`} sub={`年支出 × ${Math.round(100/swr)} 倍`} />
            <MetricCard title="達成年份" value={`+${yearsToFi ?? "-"}y · ${projection.fiAge ?? "-"}歲`} sub={yearsToFi ? `預計 ${new Date().getFullYear() + yearsToFi} 年` : "-"} />
            <MetricCard title="COAST-FIRE" value="+1y · 31歲" sub="屆時停止儲蓄仍可達成" />
            <MetricCard title="每月需存" value={`NT$${formatNumber(Math.round(annualSavings / 12))}`} sub={`年存 NT$${formatNumber(annualSavings)}`} />
          </div>

          {/* Chart Card */}
          <div className="ns-card" style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column", minHeight: 350 }}>
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
                陰影區間：悲觀 ↔ 樂觀 ±2.5% · Coast-FIRE 達成於 +1y (可停止儲蓄後仍能自然成長到 FIRE)
              </div>
            </div>
          </div>

          {/* Bottom 2 Cards */}
          <div style={{ display: "flex", gap: 16 }}>
            {/* 3 FIRE Types with explanations */}
            <div className="ns-card" style={{ padding: "20px 24px", flex: 1 }}>
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
            </div>

            {/* Sensitivity */}
            <div className="ns-card" style={{ padding: "20px 24px", flex: 1.5 }}>
              <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 20 }}>達成敏感度</div>
              <div style={{ fontSize: 14, marginBottom: 16 }}>儲蓄率每增加 10%，退休提前：</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                  <div style={{ color: "var(--ns-fg-dim)" }}>目前儲蓄率</div>
                  <div style={{ fontWeight: 500 }}>29%</div>
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
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

function SliderSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="ns-card" style={{ padding: "20px" }}>
      <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 20 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {children}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, minLabel, maxLabel, val, setVal }: any) {
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
    <div className="ns-card" style={{ padding: "20px", flex: 1 }}>
      <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 500, marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ns-fg-dim)" }}>{sub}</div>
    </div>
  );
}
