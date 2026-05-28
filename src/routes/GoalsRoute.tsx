import { CaretRight, Plus, Calculator, CheckCircle, Target, Drop, Star, GraduationCap, HouseLine, MapTrifold, Keyboard } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, ReferenceDot } from "recharts";
import { useFinanceData } from "../data/hooks";
import { computeNetWorthInCurrency } from "../features/goals/netWorth";
import { projectRetirement, formatMoney, formatNumber } from "../domain";

export function GoalsRoute() {
  const { financialGoals, accounts, assets, quotes, settings, dailyFxRates } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];

  const [activeProjection, setActiveProjection] = useState<"bear" | "base" | "bull">("base");

  const goals = financialGoals.data ?? [];
  
  // Create mock goals if none exist for the demo UI
  const displayGoals = goals.length > 0 ? goals : [
    { id: "1", kind: "custom", name: "緊急預備金", currency: "TWD", targetAmount: 360000, currentAmount: 360000, desc: "6 個月支出 · NTD", status: "達成", icon: Drop, color: "var(--ns-neg)" },
    { id: "2", kind: "fire", name: "FIRE · 財務獨立", currency: "TWD", targetAmount: 35000000, currentAmount: 8452000, desc: "目標 25× 年支出", status: "預估 2042 · 16年後", icon: Star, color: "var(--ns-pos)" },
    { id: "3", kind: "custom", name: "小孩教育金", currency: "TWD", targetAmount: 3000000, currentAmount: 820000, desc: "台大 4 年 + 留學", status: "預估 2034", icon: GraduationCap, color: "var(--ns-warn)" },
    { id: "4", kind: "custom", name: "頭期款 · 信義區", currency: "TWD", targetAmount: 6000000, currentAmount: 2140000, desc: "40% 頭期 / 1500 萬", status: "預估 2030", icon: HouseLine, color: "var(--ns-accent)" },
    { id: "5", kind: "custom", name: "日本旅行", currency: "TWD", targetAmount: 100000, currentAmount: 0, desc: "京都 + 滋賀", status: "2026 秋", icon: MapTrifold, color: "var(--ns-chart-2)" }
  ];

  const fireGoal = goals.find((row) => row.kind === "fire") ?? null;
  const currentValue = useMemo(
    () => fireGoal ? computeNetWorthInCurrency(fireGoal.currency, accountRows, assetRows, quoteRows, appSettings, fxHistory) : 8450000,
    [fireGoal, accountRows, assetRows, quoteRows, appSettings, fxHistory],
  );

  const projection = useMemo(
    () => fireGoal ? projectRetirement({ goal: fireGoal, currentValue }) : null,
    [fireGoal, currentValue],
  );

  // Projection rates for each scenario
  const projectionRates = { bear: 0.05, base: 0.072, bull: 0.10 };
  const activeRate = projectionRates[activeProjection];

  // Generate chart data based on selected scenario
  const chartData = useMemo(() => {
    if (projection) {
      // Use real projection when we have a real FIRE goal
      return projection.series.map(row => ({ age: row.age, portfolio: row.endBalance }));
    }
    // Fallback: simulate with the selected rate
    const startAssets = currentValue;
    const annualSaving = 580000; // fallback
    return Array.from({ length: 30 }).map((_, i) => {
      let bal = startAssets;
      for (let j = 0; j < i; j++) bal = bal * (1 + activeRate) + annualSaving;
      return { age: 30 + i, portfolio: bal };
    });
  }, [projection, currentValue, activeRate]);

  // Compute scenario-specific stats for the left column
  const scenarioStats = useMemo(() => {
    const startAssets = currentValue;
    const annualSaving = 580000;
    const annualSpending = 1400000;
    const swrRate = 0.04;
    const target = annualSpending / swrRate;
    let balance = startAssets;
    let fiAge = null;
    for (let i = 0; i <= 40; i++) {
      if (balance >= target && !fiAge) fiAge = 30 + i;
      balance = balance * (1 + activeRate) + annualSaving;
    }
    const yearsToFi = fiAge ? fiAge - 30 : null;
    return { target, yearsToFi, fiAge, progress: Math.min(100, (startAssets / target) * 100) };
  }, [currentValue, activeRate]);

  const chartColor = activeProjection === "bear" ? "var(--ns-neg)" : activeProjection === "bull" ? "var(--ns-accent)" : "var(--ns-pos)";

  return (
    <div style={{ padding: "32px 40px 100px", overflowY: "auto", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5, color: "var(--ns-fg-muted)", marginBottom: 8 }}>LONG-TERM PROGRESS</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 32, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            Goals & FIRE
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/goals/fire" className="ns-btn ghost" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
            <Calculator size={16} /> FIRE Calculator
          </Link>
          <button className="ns-btn primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
            <Plus size={16} weight="bold" /> 新目標
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Main FIRE Card */}
        <div className="ns-card" style={{ padding: 32, display: "flex", gap: 48 }}>
          {/* Left Column */}
          <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 12, letterSpacing: 0.5 }}>FIRE · 25× 年支出</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>NT${(currentValue / 1000000).toFixed(2)}M</span>
                <span style={{ fontSize: 14, color: "var(--ns-fg-muted)" }}>/ NT${(scenarioStats.target / 1000000).toFixed(0)}M</span>
              </div>
              
              <div style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden", marginBottom: 12, display: "flex" }}>
                <div style={{ width: `${scenarioStats.progress.toFixed(1)}%`, background: "linear-gradient(90deg, var(--ns-accent), var(--ns-pos))", borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 13, color: "var(--ns-fg-dim)" }}>{scenarioStats.progress.toFixed(1)}% · {scenarioStats.yearsToFi ? `預估 ${scenarioStats.yearsToFi} 年後達成 (${new Date().getFullYear() + scenarioStats.yearsToFi})` : "尚無法預估"}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 48 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 4 }}>年儲蓄</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>NT$580K</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 4 }}>假設報酬率</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>{(activeRate * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 4 }}>年支出基準</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>NT$1.4M</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ns-fg-muted)", marginBottom: 4 }}>SWR</div>
                <div style={{ fontSize: 18, fontWeight: 500 }}>4.0%</div>
              </div>
            </div>
          </div>

          {/* Right Column: Chart */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", color: "var(--ns-fg-muted)", letterSpacing: 1 }}>PROJECTION · 28 年</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  onClick={() => setActiveProjection("bear")}
                  style={{ 
                    fontSize: 12, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid",
                    background: activeProjection === "bear" ? "var(--ns-surface-strong)" : "transparent",
                    borderColor: activeProjection === "bear" ? "var(--ns-border)" : "transparent",
                    color: activeProjection === "bear" ? "var(--ns-fg)" : "var(--ns-fg-muted)"
                  }}>保守 5%</button>
                <button 
                  onClick={() => setActiveProjection("base")}
                  style={{ 
                    fontSize: 12, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid",
                    background: activeProjection === "base" ? "var(--ns-surface-strong)" : "transparent",
                    borderColor: activeProjection === "base" ? "var(--ns-border)" : "transparent",
                    color: activeProjection === "base" ? "var(--ns-fg)" : "var(--ns-fg-muted)"
                  }}>基準 7.2%</button>
                <button 
                  onClick={() => setActiveProjection("bull")}
                  style={{ 
                    fontSize: 12, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: "1px solid",
                    background: activeProjection === "bull" ? "var(--ns-surface-strong)" : "transparent",
                    borderColor: activeProjection === "bull" ? "var(--ns-border)" : "transparent",
                    color: activeProjection === "bull" ? "var(--ns-fg)" : "var(--ns-fg-muted)"
                  }}>樂觀 10%</button>
              </div>
            </div>
            
            <div style={{ flex: 1, minHeight: 220, width: "100%", position: "relative" }}>
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
              
              {/* Mock annotations for visual fidelity */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ns-fg-muted)" }}>
                <span>3y</span><span>+4y</span><span>+8y</span><span>+12y</span><span>+16y</span><span>+20y</span><span>+24y</span><span>+28y</span>
              </div>
              <div style={{ position: "absolute", bottom: 20, left: "20%", fontSize: 12, display: "flex", gap: 16 }}>
                <span style={{ color: "var(--ns-warn)", fontWeight: 500 }}>★ FIRE 達成於 +14y · 2042</span>
                <span style={{ color: "var(--ns-fg-dim)" }}>Coast-FIRE 在 +6y 達成 (NT$13M)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Goals List */}
        <div className="ns-card" style={{ padding: "24px 0", overflow: "hidden" }}>
          <div style={{ padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>5 active goals</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 13, padding: "4px 12px", borderRadius: 16, background: "var(--ns-surface-strong)", color: "var(--ns-fg)" }}>All</span>
              <span style={{ fontSize: 13, padding: "4px 12px", color: "var(--ns-fg-muted)" }}>Short-term</span>
              <span style={{ fontSize: 13, padding: "4px 12px", color: "var(--ns-fg-muted)" }}>Mid-term</span>
              <span style={{ fontSize: 13, padding: "4px 12px", color: "var(--ns-fg-muted)" }}>Long-term</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {displayGoals.map((goal: any, i) => {
              const current = goal.currentAmount ?? 0;
              const target = goal.targetAmount ?? 1;
              const progress = Math.min(100, (current / target) * 100);
              const isAchieved = progress >= 100;
              
              const IconComp = goal.icon ?? Target;
              
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "16px 32px", borderBottom: i < displayGoals.length - 1 ? "1px solid var(--ns-border)" : "none", transition: "background 0.2s", cursor: "pointer" }} className="hover:bg-[var(--ns-surface)]">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--ns-surface-strong)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 16 }}>
                    <IconComp size={20} color={goal.color ?? "var(--ns-fg)"} weight={goal.kind === "fire" ? "fill" : "regular"} />
                  </div>
                  
                  <div style={{ flex: "0 0 200px" }}>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{goal.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ns-fg-muted)" }}>{goal.desc ?? "一般目標"}</div>
                  </div>
                  
                  <div style={{ flex: "0 0 180px" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>NT${formatNumber(current)}</div>
                    <div style={{ fontSize: 12, color: "var(--ns-fg-dim)" }}>/ NT${formatNumber(target)}</div>
                  </div>
                  
                  <div style={{ flex: 1, paddingRight: 48, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${progress}%`, background: goal.color ?? "var(--ns-accent)", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ns-fg-dim)", width: 48, textAlign: "right" }}>{progress.toFixed(1)}%</div>
                  </div>
                  
                  <div style={{ flex: "0 0 160px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {isAchieved ? (
                      <span style={{ fontSize: 13, color: "var(--ns-pos)", background: "var(--ns-surface)", padding: "4px 10px", borderRadius: 12, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={14} weight="fill" /> 達成</span>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--ns-fg-dim)" }}>{goal.status ?? "進行中"}</span>
                    )}
                    <CaretRight size={16} color="var(--ns-fg-muted)" />
                  </div>
                </div>
              );
            })}
          </div>
          
          <div style={{ padding: "20px 32px 0" }}>
            <div style={{ display: "flex", alignItems: "center", background: "var(--ns-surface)", borderRadius: 12, padding: "8px 16px", border: "1px solid var(--ns-border)" }}>
              <Plus size={16} color="var(--ns-fg-muted)" style={{ marginRight: 12 }} />
              <input type="text" placeholder="Quick add · 試試「拿鐵 120 信用卡」或「買 2330.TW 5 股 @1000」" style={{ flex: 1, background: "transparent", border: "none", color: "var(--ns-fg)", fontSize: 14, outline: "none" }} />
              <div style={{ display: "flex", gap: 6, marginRight: 12 }}>
                <div style={{ background: "var(--ns-surface-strong)", borderRadius: 4, padding: "2px 6px", display: "flex", alignItems: "center", justifyContent: "center" }}><Keyboard size={12} color="var(--ns-fg-muted)" /></div>
                <div style={{ background: "var(--ns-surface-strong)", borderRadius: 4, padding: "2px 6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--ns-fg-muted)", fontFamily: "var(--ns-font-mono)" }}>N</div>
              </div>
              <button className="ns-btn primary" style={{ padding: "6px 16px", fontSize: 13 }}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
