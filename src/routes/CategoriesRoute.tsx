import { Gear, Plus, X } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { DateScopeControl } from "../components/DateScopeControl";
import { Glyph } from "../lib/icons";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { convertCurrency, formatMoney, formatNumber, isWithinDateScope, makeDefaultDateScope, resolveDateScope } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { useToast } from "../components/Toast";

// Removed Mock Data

export function CategoriesRoute() {
  const { ledger, settings, dailyFxRates } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const fxHistory = dailyFxRates.data ?? [];

  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "month"));
  const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const toast = useToast();

  const navigate = useNavigate();

  const updateSettingsMutation = useRepositoryMutation(
    (repository, input: import("../domain/types").AppSettings) => repository.updateAppSettings(input),
    ["settings"],
  );

  const filteredRows = useMemo(() => {
    return ledgerRows.filter((row) => isWithinDateScope(row.date, dateRange));
  }, [ledgerRows, dateRange]);

  const allExpenseRows = filteredRows.filter((row) => row.entryType === "expense" && !row.counterAccountId);
  // Signed spend (−amount): refunds (positive-amount expenses) net out.
  const convertedAmount = (row: (typeof allExpenseRows)[number]) => convertCurrency(-row.amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date });
  const missingFxPairs = [...new Set(allExpenseRows.filter((row) => convertedAmount(row) === null).map((row) => `${row.currency}/${primaryCurrency}`))];
  const totalExpense = allExpenseRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const expenseRows = selectedCategory
    ? allExpenseRows.filter((row) => row.category === selectedCategory)
    : allExpenseRows;
  
  const categoryStats = useMemo(() => {
    const map = new Map<string, { amount: number, count: number }>();
    for (const row of allExpenseRows) {
      if (!row.category) continue;
      const current = map.get(row.category) ?? { amount: 0, count: 0 };
      map.set(row.category, { 
        amount: current.amount + (convertedAmount(row) ?? 0),
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
        const emoji = catSetting?.iconName || 'Tag';
        
        return {
          name,
          amount: stats.amount,
          count: stats.count,
          budget,
          color,
          emoji
        };
      });
  }, [allExpenseRows, appSettings, fxHistory, primaryCurrency]);

  // Aggregate stats
  const totalBudget = categoryStats.reduce((sum, cat) => sum + (cat.budget || cat.amount), 0);
  const usagePercent = totalBudget > 0 ? (totalExpense / totalBudget) * 100 : 0;
  
  const overSpentCats = categoryStats.filter(cat => cat.budget && cat.amount > cat.budget);

  return (
    <div style={{ padding: "32px 40px 100px", overflowY: "auto", minHeight: "100vh" }}>
      {/* Header Area */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div className="text-caption" style={{ fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5, color: "var(--ns-fg-muted)", marginBottom: 8 }}>
            {dateRange.label} · {categoryStats.length} 個分類
          </div>
          <h1 className="text-[32px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            分類
          </h1>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DateScopeControl value={dateScope} onChange={setDateScope} />
          <Button onClick={() => setCategoryDrawerOpen(true)}>
            <Plus size={14} weight="bold" /> 管理分類
          </Button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <SummaryCard label="已消費" value={formatMoney(totalExpense, primaryCurrency)} />
        <SummaryCard label="預算合計" value={formatMoney(totalBudget, primaryCurrency)} />
        <SummaryCard label="預算使用率" value={`${usagePercent.toFixed(1)}%`} />
        <SummaryCard 
          label="超支分類" 
          value={overSpentCats.length > 0 ? `${overSpentCats.length} (${overSpentCats[0].name})` : "0"} 
        />
      </div>
      {missingFxPairs.length ? <div className="ns-surface text-body" style={{ padding: "10px 14px", marginBottom: 16 }}>總額不完整：缺少 {missingFxPairs.join("、")} 匯率。</div> : null}

      <div style={{ display: "flex", gap: 24 }}>
        {/* Left: Donut Chart */}
        <Card style={{ flex: "0 0 340px", padding: 32, display: "flex", flexDirection: "column", alignItems: "center" }}>
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
                      onClick={(data) => {
                        if (data && data.name) {
                          setSelectedCategory(prev => prev === data.name ? null : data.name);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {categoryStats.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          opacity={!selectedCategory || selectedCategory === entry.name ? 1 : 0.3}
                          stroke={selectedCategory === entry.name ? "var(--ns-fg)" : "none"}
                          strokeWidth={selectedCategory === entry.name ? 2 : 0}
                        />
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
              {selectedCategory && (
                <Button variant="ghost" className="text-caption" style={{ marginBottom: 8, alignSelf: 'center' }} onClick={() => setSelectedCategory(null)}>
                  <X size={10} weight="bold" />清除篩選: {selectedCategory}
                </Button>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", width: "100%" }}>
                {categoryStats.map(cat => (
                  <div
                    key={cat.name}
                    className="text-body"
                    onClick={() => setSelectedCategory(prev => prev === cat.name ? null : cat.name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: "pointer", padding: "4px 6px", borderRadius: "var(--ns-r-xs)",
                      background: selectedCategory === cat.name ? "var(--ns-bg-hover)" : "transparent",
                      opacity: !selectedCategory || selectedCategory === cat.name ? 1 : 0.45,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Glyph name={cat.emoji} size={16} />
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
        </Card>

        {/* Right: Categories List */}
        <Card style={{ flex: 1, padding: "24px 0" }}>
          {/* List Header */}
          <div className="text-caption" style={{ display: "flex", padding: "0 32px 12px", borderBottom: "1px solid var(--ns-border)", fontFamily: "var(--ns-font-mono)", color: "var(--ns-fg-muted)", letterSpacing: 1 }}>
            <div style={{ flex: "0 0 160px" }}>分類</div>
            <div style={{ flex: 1, textAlign: "right" }}>已消費</div>
            <div style={{ flex: "0 0 240px", textAlign: "right" }}>預算</div>
            <div style={{ flex: "0 0 120px", textAlign: "center" }}>使用率</div>
            <div style={{ width: 40 }}></div>
          </div>

          {/* List Items */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {categoryStats.map((cat, index) => {
              const hasBudget = cat.budget !== null;
              const percent = hasBudget ? (cat.amount / cat.budget!) * 100 : 0;
              const isOver = hasBudget && percent > 100;
              
              // Progress bar styling
              const barColor = isOver ? "var(--ns-neg)" : (hasBudget ? cat.color : "var(--ns-border)");
              const displayPercent = hasBudget ? Math.min(100, percent) : 0;

              return (
                <div
                  key={cat.name}
                  onClick={() => setSelectedCategory(prev => prev === cat.name ? null : cat.name)}
                  style={{
                    display: "flex", alignItems: "center", padding: "16px 32px",
                    borderBottom: index < categoryStats.length - 1 ? "1px solid var(--ns-border)" : "none",
                    transition: "background 0.2s", cursor: "pointer",
                    opacity: !selectedCategory || selectedCategory === cat.name ? 1 : 0.5,
                    background: selectedCategory === cat.name ? "var(--ns-bg-hover)" : "transparent",
                  }}
                  className="hover:bg-[var(--ns-surface)]"
                >
                  
                  {/* Category Info */}
                  <div style={{ flex: "0 0 160px", display: "flex", alignItems: "center", gap: 16 }}>
                    <div className="text-xl" style={{ width: 36, height: 36, borderRadius: 10, background: (cat.color || 'var(--ns-surface-strong)') + '18', display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Glyph name={cat.emoji} size={20} />
                    </div>
                    <div>
                      <div className="text-[15px]" style={{ fontWeight: 500, marginBottom: 2 }}>{cat.name}</div>
                      <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>{cat.count} 筆</div>
                    </div>
                  </div>
                  
                  {/* Spent */}
                  <div className="text-[15px]" style={{ flex: 1, textAlign: "right", fontWeight: 500 }}>
                    {formatMoney(cat.amount, primaryCurrency)}
                  </div>
                  
                  {/* Budget */}
                  <div style={{ flex: "0 0 240px", paddingLeft: 48 }}>
                    <div className="text-sm" style={{ fontWeight: 500, marginBottom: 4 }}>
                      {hasBudget ? formatMoney(cat.budget!, primaryCurrency) : "—"}
                    </div>
                    <div className="text-caption" style={{ color: "var(--ns-fg-muted)" }}>
                      {hasBudget ? (
                        isOver ? (
                          <span style={{ color: "var(--ns-neg)" }}>{percent.toFixed(0)}% · 超支 {formatMoney(cat.amount - cat.budget!, primaryCurrency)}</span>
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
                    <Gear size={16} style={{ cursor: "pointer" }} className="hover:text-[var(--ns-fg)] transition-colors" onClick={(e) => { e.stopPropagation(); setCategoryDrawerOpen(true); }} />
                  </div>
                </div>
              );
            })}
            
            {categoryStats.length === 0 && (
              <div className="muted" style={{ textAlign: "center", padding: "40px 0" }}>沒有分類資料</div>
            )}
          </div>
        </Card>
      </div>

      <CategoryManagementDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={appSettings?.categories || []}
        onSave={async (cats) => {
          if (!appSettings) return;
          await updateSettingsMutation.mutateAsync({ ...appSettings, categories: cats });
          toast.success("已更新分類設定");
        }}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string, value: string }) {
  return (
    <Card style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>{label}</div>
      <div className="text-[24px]" style={{ fontWeight: 500 }}>{value}</div>
    </Card>
  );
}
