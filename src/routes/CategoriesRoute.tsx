import { Gear, Plus, X } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { DateScopeControl } from "../components/DateScopeControl";
import { Glyph } from "../lib/icons";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { annualBudgetSummary, categoryPeriodSpend, computeRolloverSeries, convertCurrency, formatMoney, formatNumber, isWithinDateScope, makeDefaultDateScope, resolveDateScope } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { useToast } from "../components/Toast";

// Removed Mock Data

export function CategoriesRoute() {
  const { ledger, settings, dailyFxRates, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const fxHistory = dailyFxRates.data ?? [];

  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "month"));
  const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [catRouteSort, setCatRouteSort] = useState<{ key: "name" | "amount" | "usage"; dir: "asc" | "desc" }>({ key: "amount", dir: "desc" });
  // Annual 12-month grid: which category name is expanded (null = none).
  const [annualCategory, setAnnualCategory] = useState<string | null>(null);
  const toast = useToast();

  const navigate = useNavigate();

  const updateSettingsMutation = useRepositoryMutation(
    (repository, input: import("../domain/types").AppSettings) => repository.updateAppSettings(input),
    ["settings"],
  );

  // toPrimary: pass row.amount (positive for refunds, negative for expenses).
  // The helper applies the sign inversion itself (spend = -converted).
  const toPrimaryFn = useMemo(
    () => (row: (typeof ledgerRows)[number]) =>
      convertCurrency(row.amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }),
    [primaryCurrency, appSettings, fxHistory],
  );

  // Pass full ledger — the helper's isWithinDateScope filters by date.
  const periodSpend = useMemo(
    () => categoryPeriodSpend(ledgerRows, dateRange, primaryCurrency, toPrimaryFn),
    [ledgerRows, dateRange, primaryCurrency, toPrimaryFn],
  );

  const missingFxPairs = periodSpend.missingFxPairs;
  const totalExpense = periodSpend.total;

  // Anchor month for the 12-month window: the selected month (month preset) or today.
  const anchorMonth = useMemo(() => {
    if (dateScope.preset === "month" && dateScope.month) return dateScope.month;
    return makeDefaultDateScope(timezone, "month").month;
  }, [dateScope, timezone]);

  // The 12 months (oldest → newest) ending at the anchor month, as YYYY-MM strings.
  const trailingMonths = useMemo(() => {
    const [year, month] = anchorMonth.split("-").map(Number);
    const out: string[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(year, month - 1 - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [anchorMonth]);

  // Per-category × per-month settled spend for the trailing window, all via the
  // canonical categoryPeriodSpend helper (no second spend computation). Map keyed by
  // category name → number[] aligned with trailingMonths (oldest → newest).
  const monthlySpendByCategory = useMemo(() => {
    const map = new Map<string, number[]>();
    trailingMonths.forEach((month, monthIdx) => {
      const scope = resolveDateScope({ preset: "month", month, start: "", end: "" }, timezone);
      const spend = categoryPeriodSpend(ledgerRows, scope, primaryCurrency, toPrimaryFn);
      for (const cat of spend.categories) {
        let series = map.get(cat.name);
        if (!series) {
          series = new Array(trailingMonths.length).fill(0);
          map.set(cat.name, series);
        }
        series[monthIdx] = cat.amount;
      }
    });
    return map;
  }, [trailingMonths, ledgerRows, primaryCurrency, toPrimaryFn, timezone]);

  // For the per-row transaction list (selectedCategory filter): still need expense rows in scope.
  const filteredRows = useMemo(() => {
    return ledgerRows.filter((row) => isWithinDateScope(row.date, dateRange));
  }, [ledgerRows, dateRange]);
  const allExpenseRows = filteredRows.filter((row) => row.entryType === "expense" && !row.counterAccountId);
  const expenseRows = selectedCategory
    ? allExpenseRows.filter((row) => row.category === selectedCategory)
    : allExpenseRows;

  const defaultColors = ["var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)", "var(--ns-chart-4)", "var(--ns-chart-5)", "var(--ns-chart-6)", "var(--ns-chart-7)"];

  const categoryStats = useMemo(() => {
    return periodSpend.categories.map((cat, index) => {
      const catSetting = appSettings?.categories.find((c) => c.name === cat.name);
      const budget = catSetting?.budget || null;
      const color = catSetting?.color || defaultColors[index % defaultColors.length];
      const emoji = catSetting?.iconName || "Tag";

      // Derived rollover carry: when on, accumulate over the trailing window using the
      // canonical per-month spend series, then read this month's carried-in balance
      // (= available − budget at the anchor month).
      const rollover = Boolean(catSetting?.rollover) && budget !== null && budget > 0;
      let carry = 0;
      let available = budget ?? 0;
      if (rollover && budget !== null) {
        const series = monthlySpendByCategory.get(cat.name) ?? new Array(trailingMonths.length).fill(0);
        let startIndex = 0;
        if (catSetting?.rolloverStart) {
          const idx = trailingMonths.indexOf(catSetting.rolloverStart);
          if (idx >= 0) startIndex = idx;
        }
        const result = computeRolloverSeries({ monthlyBudget: budget, rollover: true, monthlySpend: series, startIndex });
        const last = result[result.length - 1];
        if (last) {
          available = last.available;
          carry = available - budget; // carried-in balance for the anchor month
        }
      }

      return {
        name: cat.name,
        amount: cat.amount,
        count: cat.count,
        budget,
        color,
        emoji,
        rollover,
        carry,
        available,
      };
    });
  }, [periodSpend, appSettings, monthlySpendByCategory, trailingMonths]);

  const sortedCategoryStats = useMemo(() => {
    const arr = [...categoryStats];
    arr.sort((a, b) => {
      if (catRouteSort.key === "name") {
        return catRouteSort.dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = catRouteSort.key === "usage" ? (a.budget ? a.amount / a.budget : -1) : a.amount;
      const bv = catRouteSort.key === "usage" ? (b.budget ? b.amount / b.budget : -1) : b.amount;
      return catRouteSort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [categoryStats, catRouteSort]);

  function toggleCatRouteSort(key: "name" | "amount" | "usage") {
    setCatRouteSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );
  }

  // Aggregate stats
  const totalBudget = categoryStats.reduce((sum, cat) => sum + (cat.budget || cat.amount), 0);
  const usagePercent = totalBudget > 0 ? (totalExpense / totalBudget) * 100 : 0;
  
  const overSpentCats = categoryStats.filter(cat => cat.budget && cat.amount > cat.budget);

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[320px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <h3 className="text-[17px] font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>
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
    <div style={{ padding: "32px 40px 100px", overflowY: "auto", minHeight: "100vh" }}>
      {/* Header Area */}
      <div className="flex justify-between" style={{ alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <div className="text-caption muted mb-2" style={{ fontFamily: "var(--ns-font-mono)", letterSpacing: 1.5 }}>
            {dateRange.label} · {categoryStats.length} 個分類
          </div>
          <h1 className="text-[32px] font-semibold" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.5 }}>
            分類
          </h1>
        </div>
        
        <div className="flex items-center gap-2.5">
          <DateScopeControl value={dateScope} onChange={setDateScope} />
          <Button onClick={() => setCategoryDrawerOpen(true)}>
            <Plus size={14} weight="bold" /> 管理分類
          </Button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="ns-cat-summary-grid">
        <SummaryCard label="已消費" value={formatMoney(totalExpense, primaryCurrency)} />
        <SummaryCard label="預算合計" value={formatMoney(totalBudget, primaryCurrency)} />
        <SummaryCard label="預算使用率" value={`${usagePercent.toFixed(1)}%`} />
        <SummaryCard 
          label="超支分類" 
          value={overSpentCats.length > 0 ? `${overSpentCats.length} (${overSpentCats[0].name})` : "0"} 
        />
      </div>
      {missingFxPairs.length ? <div className="ns-surface text-body mb-4" style={{ padding: "10px 14px" }}>總額不完整：缺少 {missingFxPairs.join("、")} 匯率。</div> : null}

      <div className="flex gap-6">
        {/* Left: Donut Chart */}
        <Card className="flex flex-col items-center" style={{ flex: "0 0 340px", padding: 32 }}>
          {categoryStats.length > 0 ? (
            <>
              <div className="w-full mb-6" style={{ height: 260, position: "relative" }}>
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
                        if (data && data.name != null) {
                          const clicked = String(data.name);
                          setSelectedCategory(prev => prev === clicked ? null : clicked);
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
                      formatter={(value) => [`${formatNumber(Number(value))} ${primaryCurrency}`, "金額"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend Grid */}
              {selectedCategory && (
                <Button variant="ghost" className="text-caption mb-2" style={{ alignSelf: 'center' }} onClick={() => setSelectedCategory(null)}>
                  <X size={10} weight="bold" />清除篩選: {selectedCategory}
                </Button>
              )}
              <div className="w-full" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                {categoryStats.map(cat => (
                  <div
                    key={cat.name}
                    className="text-body flex items-center gap-2"
                    onClick={() => setSelectedCategory(prev => prev === cat.name ? null : cat.name)}
                    style={{
                      cursor: "pointer", padding: "4px 6px", borderRadius: "var(--ns-r-xs)",
                      background: selectedCategory === cat.name ? "var(--ns-bg-hover)" : "transparent",
                      opacity: !selectedCategory || selectedCategory === cat.name ? 1 : 0.45,
                      transition: "background 150ms var(--ns-ease), opacity 150ms var(--ns-ease)",
                    }}
                  >
                    <Glyph name={cat.emoji} size={16} />
                    <span className="font-medium truncate">{cat.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 300, justifyContent: "center" }} className="muted flex items-center">
              沒有足夠的支出資料
            </div>
          )}
        </Card>

        {/* Right: Categories List */}
        <Card className="flex-1" style={{ padding: "24px 0" }}>
          {/* List Header */}
          <div className="text-caption muted flex" style={{ padding: "0 32px 12px", borderBottom: "1px solid var(--ns-border)", fontFamily: "var(--ns-font-mono)", letterSpacing: 1 }}>
            <button style={{ flex: "0 0 160px", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", letterSpacing: 1 }} onClick={() => toggleCatRouteSort("name")}>分類{catRouteSort.key === "name" ? (catRouteSort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
            <button className="text-right" style={{ flex: 1, background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", letterSpacing: 1 }} onClick={() => toggleCatRouteSort("amount")}>已消費{catRouteSort.key === "amount" ? (catRouteSort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
            <div className="text-right" style={{ flex: "0 0 240px" }}>預算</div>
            <button className="text-center" style={{ flex: "0 0 120px", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", letterSpacing: 1 }} onClick={() => toggleCatRouteSort("usage")}>使用率{catRouteSort.key === "usage" ? (catRouteSort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
            <div style={{ width: 40 }}></div>
          </div>

          {/* List Items */}
          <div className="flex flex-col">
            {sortedCategoryStats.map((cat, index) => {
              const hasBudget = cat.budget !== null;
              const percent = hasBudget ? (cat.amount / cat.budget!) * 100 : 0;
              const isOver = hasBudget && percent > 100;
              
              // Progress bar styling
              const barColor = isOver ? "var(--ns-neg)" : (hasBudget ? cat.color : "var(--ns-border)");
              const displayPercent = hasBudget ? Math.min(100, percent) : 0;

              return (
                <div key={cat.name}>
                <div
                  onClick={() => setSelectedCategory(prev => prev === cat.name ? null : cat.name)}
                  style={{
                    padding: "16px 32px",
                    borderBottom: index < categoryStats.length - 1 ? "1px solid var(--ns-border)" : "none",
                    transition: "background 0.2s", cursor: "pointer",
                    opacity: !selectedCategory || selectedCategory === cat.name ? 1 : 0.5,
                    background: selectedCategory === cat.name ? "var(--ns-bg-hover)" : "transparent",
                  }}
                  className="hover:bg-[var(--ns-surface)] flex items-center"
                >
                  
                  {/* Category Info */}
                  <div className="flex items-center gap-4" style={{ flex: "0 0 160px" }}>
                    <div className="text-xl flex items-center" style={{ width: 36, height: 36, borderRadius: 10, background: (cat.color || 'var(--ns-surface-strong)') + '18', justifyContent: "center" }}>
                      <Glyph name={cat.emoji} size={20} />
                    </div>
                    <div>
                      <div className="text-[15px] font-medium" style={{ marginBottom: 2 }}>{cat.name}</div>
                      <div className="text-xs muted">{cat.count} 筆</div>
                    </div>
                  </div>
                  
                  {/* Spent */}
                  <div className="text-[15px] flex-1 text-right font-medium">
                    {formatMoney(cat.amount, primaryCurrency)}
                  </div>
                  
                  {/* Budget */}
                  <div style={{ flex: "0 0 240px", paddingLeft: 48 }}>
                    <div className="text-sm font-medium mb-1">
                      {hasBudget ? formatMoney(cat.budget!, primaryCurrency) : "—"}
                    </div>
                    <div className="text-caption muted">
                      {hasBudget ? (
                        isOver ? (
                          <span className="neg">{percent.toFixed(0)}% · 超支 {formatMoney(cat.amount - cat.budget!, primaryCurrency)}</span>
                        ) : (
                          <span>{percent.toFixed(0)}%</span>
                        )
                      ) : (
                        <span>無上限</span>
                      )}
                    </div>
                    {cat.rollover && cat.carry !== 0 && (
                      <div className="text-caption" style={{ marginTop: 2, color: cat.carry > 0 ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                        {cat.carry > 0 ? "結轉 +" : "結轉 "}{formatMoney(cat.carry, primaryCurrency)} · 可用 {formatMoney(cat.available, primaryCurrency)}
                      </div>
                    )}
                  </div>
                  
                  {/* Usage Bar */}
                  <div className="flex items-center" style={{ flex: "0 0 120px" }}>
                    <div className="w-full" style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
                      {hasBudget && (
                        <div style={{ height: "100%", background: barColor, width: `${displayPercent}%`, borderRadius: 3 }} />
                      )}
                    </div>
                  </div>
                  
                  {/* Settings */}
                  <div className="muted flex items-center gap-2" style={{ width: 40, justifyContent: "flex-end" }}>
                    <button
                      className="text-caption"
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: annualCategory === cat.name ? "var(--ns-fg)" : "var(--ns-fg-muted)", fontFamily: "var(--ns-font-mono)" }}
                      title="年度檢視"
                      onClick={(e) => { e.stopPropagation(); setAnnualCategory(prev => prev === cat.name ? null : cat.name); }}
                    >
                      年
                    </button>
                    <Gear size={16} style={{ cursor: "pointer" }} className="hover:text-[var(--ns-fg)] transition-colors" onClick={(e) => { e.stopPropagation(); setCategoryDrawerOpen(true); }} />
                  </div>
                </div>
                {annualCategory === cat.name && (
                  <AnnualGrid
                    months={trailingMonths}
                    series={monthlySpendByCategory.get(cat.name) ?? new Array(trailingMonths.length).fill(0)}
                    monthlyBudget={cat.budget ?? 0}
                    rollover={cat.rollover}
                    primaryCurrency={primaryCurrency}
                  />
                )}
                </div>
              );
            })}
            
            {categoryStats.length === 0 && (
              <div className="muted text-center" style={{ padding: "40px 0" }}>沒有分類資料</div>
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

function AnnualGrid({ months, series, monthlyBudget, rollover, primaryCurrency }: {
  months: string[];
  series: number[];
  monthlyBudget: number;
  rollover: boolean;
  primaryCurrency: string;
}) {
  const summary = annualBudgetSummary({ monthlyBudget, rollover, monthlySpend: series });
  return (
    <div className="ns-surface" style={{ margin: "0 32px 16px", padding: "16px 20px", borderRadius: "var(--ns-r-sm)" }}>
      <div className="text-caption muted flex justify-between mb-3" style={{ fontFamily: "var(--ns-font-mono)", letterSpacing: 1 }}>
        <span>近 12 個月</span>
        <span>年度支出 {formatMoney(summary.annualSpend, primaryCurrency)} / 年度預算 {formatMoney(summary.annualBudget, primaryCurrency)}（月預算 ×12）</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
        {summary.months.map((m, i) => {
          const over = monthlyBudget > 0 && m.spend > m.available;
          const pct = m.available > 0 ? Math.min(100, (m.spend / m.available) * 100) : 0;
          return (
            <div key={months[i]} title={`${months[i]} · 支出 ${formatMoney(m.spend, primaryCurrency)}${rollover ? ` · 可用 ${formatMoney(m.available, primaryCurrency)}` : ""}`} className="flex flex-col gap-1">
              <div style={{ height: 48, display: "flex", flexDirection: "column-reverse", background: "var(--ns-bg-hover)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: `${pct}%`, background: over ? "var(--ns-neg)" : "var(--ns-accent)" }} />
              </div>
              <div className="text-micro muted text-center" style={{ fontFamily: "var(--ns-font-mono)" }}>{months[i].slice(5)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string, value: string }) {
  return (
    <Card className="p-6 flex flex-col gap-3">
      <div className="text-xs muted">{label}</div>
      <div className="text-[24px] font-medium">{value}</div>
    </Card>
  );
}
