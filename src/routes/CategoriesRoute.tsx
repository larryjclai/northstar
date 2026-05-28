import { ForkKnife, Car, GameController, MonitorPlay, House, Pill, GraduationCap, DotsThree, Gear, Plus, Tag } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useFinanceData } from "../data/hooks";
import { formatNumber, todayInTimezone } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

// Removed Mock Data

export function CategoriesRoute() {
  const { ledger, settings } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";

  const [filterMonth, setFilterMonth] = useState(() => todayInTimezone(timezone).slice(0, 7));
  const [timeRange, setTimeRange] = useState<"month" | "ytd" | "custom">("month");

  const navigate = useNavigate();

  const filteredRows = useMemo(() => {
    const today = todayInTimezone(timezone);
    if (timeRange === "month") {
      const monthPrefix = filterMonth;
      return ledgerRows.filter((row) => row.date.startsWith(monthPrefix));
    } else if (timeRange === "ytd") {
      const yearPrefix = filterMonth.slice(0, 4);
      return ledgerRows.filter((row) => row.date.startsWith(yearPrefix) && row.date <= today);
    } else {
      // custom: for now just return all
      return ledgerRows;
    }
  }, [ledgerRows, filterMonth, timeRange, timezone]);

  const expenseRows = filteredRows.filter((row) => row.entryType === "expense");
  const totalExpense = expenseRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  
  const categoryStats = useMemo(() => {
    const map = new Map<string, { amount: number, count: number }>();
    for (const row of expenseRows) {
      if (!row.category) continue;
      const current = map.get(row.category) ?? { amount: 0, count: 0 };
      map.set(row.category, { 
        amount: current.amount + Math.abs(row.amount),
        count: current.count + 1
      });
    }
    
    const defaultColors = ["var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)", "var(--ns-chart-4)", "var(--ns-chart-5)", "#2dd4bf", "#fb923c"];
    
    return [...map.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, stats], index) => {
        const catSetting = appSettings?.categories.find(c => c.name === name);
        const budget = catSetting?.budget || null;
        const color = catSetting?.color || defaultColors[index % defaultColors.length];
        const icon = Tag; // Using generic icon
        
        return {
          name,
          amount: stats.amount,
          count: stats.count,
          budget,
          color,
          icon
        };
      });
  }, [expenseRows, appSettings]);

  // Aggregate stats
  const totalBudget = categoryStats.reduce((sum, cat) => sum + (cat.budget || cat.amount), 0);
  const usagePercent = totalBudget > 0 ? (totalExpense / totalBudget) * 100 : 0;
  
  const overSpentCats = categoryStats.filter(cat => cat.budget && cat.amount > cat.budget);

  // Format date for display
  const displayDate = useMemo(() => {
    const d = new Date(filterMonth + "-01");
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
  }, [filterMonth]);

  return (
    <div style={{ padding: "32px 40px 100px", overflowY: "auto", minHeight: "100vh" }}>
      {/* Header Area */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5, color: "var(--ns-fg-muted)", marginBottom: 8 }}>
            {displayDate} · {categoryStats.length} CATEGORIES
          </div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 32, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            Categories
          </h1>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="ns-seg">
            {(["month", "ytd", "custom"] as const).map(mode => (
              <button
                key={mode}
                aria-selected={timeRange === mode}
                onClick={() => setTimeRange(mode)}
              >
                {mode === "month" ? "本月" : mode === "ytd" ? "YTD" : "自訂"}
              </button>
            ))}
          </div>
          <button className="ns-btn primary" onClick={() => navigate({ to: "/settings" })}>
            <Plus size={14} weight="bold" /> 新增分類
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <SummaryCard label="已消費" value={`NT$${formatNumber(totalExpense)}`} />
        <SummaryCard label="預算合計" value={`NT$${formatNumber(totalBudget)}`} />
        <SummaryCard label="預算使用率" value={`${usagePercent.toFixed(1)}%`} />
        <SummaryCard 
          label="超支分類" 
          value={overSpentCats.length > 0 ? `${overSpentCats.length} (${overSpentCats[0].name})` : "0"} 
        />
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        {/* Left: Donut Chart */}
        <div className="ns-card" style={{ flex: "0 0 340px", padding: 32, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {categoryStats.length > 0 ? (
            <>
              <div style={{ width: "100%", height: 260, position: "relative", marginBottom: 24 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      stroke="none"
                      paddingAngle={2}
                    >
                      {categoryStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`${formatNumber(value)} ${primaryCurrency}`, "金額"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", width: "100%" }}>
                {categoryStats.map(cat => (
                  <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }} className="muted">
              沒有足夠的支出資料
            </div>
          )}
        </div>

        {/* Right: Categories List */}
        <div className="ns-card" style={{ flex: 1, padding: "24px 0" }}>
          {/* List Header */}
          <div style={{ display: "flex", padding: "0 32px 12px", borderBottom: "1px solid var(--ns-border)", fontSize: 11, fontFamily: "var(--ns-font-mono)", color: "var(--ns-fg-muted)", letterSpacing: 1 }}>
            <div style={{ flex: "0 0 160px" }}>CATEGORY</div>
            <div style={{ flex: 1, textAlign: "right" }}>SPENT</div>
            <div style={{ flex: "0 0 240px", textAlign: "right" }}>BUDGET</div>
            <div style={{ flex: "0 0 120px", textAlign: "center" }}>USAGE</div>
            <div style={{ width: 40 }}></div>
          </div>

          {/* List Items */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {categoryStats.map((cat, index) => {
              const IconComp = cat.icon;
              const hasBudget = cat.budget !== null;
              const percent = hasBudget ? (cat.amount / cat.budget!) * 100 : 0;
              const isOver = hasBudget && percent > 100;
              
              // Progress bar styling
              const barColor = isOver ? "var(--ns-neg)" : (hasBudget ? cat.color : "var(--ns-border)");
              const displayPercent = hasBudget ? Math.min(100, percent) : 0;

              return (
                <div key={cat.name} style={{ display: "flex", alignItems: "center", padding: "16px 32px", borderBottom: index < categoryStats.length - 1 ? "1px solid var(--ns-border)" : "none", transition: "background 0.2s" }} className="hover:bg-[var(--ns-surface)]">
                  
                  {/* Category Info */}
                  <div style={{ flex: "0 0 160px", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ns-surface-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <IconComp size={18} color={cat.color} weight="fill" />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{cat.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ns-fg-muted)" }}>{cat.count} 筆</div>
                    </div>
                  </div>
                  
                  {/* Spent */}
                  <div style={{ flex: 1, textAlign: "right", fontSize: 15, fontWeight: 500 }}>
                    NT${formatNumber(cat.amount)}
                  </div>
                  
                  {/* Budget */}
                  <div style={{ flex: "0 0 240px", paddingLeft: 48 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      {hasBudget ? `NT$${formatNumber(cat.budget!)}` : "-"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ns-fg-muted)" }}>
                      {hasBudget ? (
                        isOver ? (
                          <span style={{ color: "var(--ns-neg)" }}>{percent.toFixed(0)}% · 超支 NT${formatNumber(cat.amount - cat.budget!)}</span>
                        ) : (
                          <span>{percent.toFixed(0)}%</span>
                        )
                      ) : (
                        <span>無上限</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Usage Bar */}
                  <div style={{ flex: "0 0 120px", display: "flex", alignItems: "center" }}>
                    <div style={{ width: "100%", height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
                      {hasBudget && (
                        <div style={{ height: "100%", background: barColor, width: `${displayPercent}%`, borderRadius: 3 }} />
                      )}
                    </div>
                  </div>
                  
                  {/* Settings */}
                  <div style={{ width: 40, display: "flex", justifyContent: "flex-end", color: "var(--ns-fg-muted)" }}>
                    <Gear size={16} style={{ cursor: "pointer" }} className="hover:text-[var(--ns-fg)] transition-colors" onClick={() => navigate({ to: "/settings" })} />
                  </div>
                </div>
              );
            })}
            
            {categoryStats.length === 0 && (
              <div className="muted" style={{ textAlign: "center", padding: "40px 0" }}>沒有分類資料</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="ns-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "var(--ns-fg-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
