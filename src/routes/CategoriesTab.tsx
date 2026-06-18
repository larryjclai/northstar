import { Gear, CaretRight } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { SplitLayout } from "../components/coss/layout";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { categoryPeriodSpend, formatNumber, isNeutralLedgerRow, isWithinDateScope, type AppSettings, type LedgerTransaction, type ResolvedDateScope } from "../domain";
import { Glyph } from "../lib/icons";

function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  const name = color.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color;
}

export function CategoriesTab({ dateRange, ledgerRows, appSettings, primaryCurrency, toPrimary, onSettingsClick }: { dateRange: ResolvedDateScope; ledgerRows: LedgerTransaction[]; appSettings: AppSettings | undefined; primaryCurrency: string; toPrimary: (row: LedgerTransaction) => number | null; onSettingsClick: () => void }) {
  // Delegate amount/count aggregation to the shared canonical helper.
  const spend = useMemo(
    () => categoryPeriodSpend(ledgerRows, dateRange, primaryCurrency, toPrimary),
    [ledgerRows, dateRange, primaryCurrency, toPrimary],
  );

  // Separate pass to compute topMerchant per category (over the same filtered rows).
  const merchantMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of ledgerRows) {
      if (!isWithinDateScope(row.date, dateRange)) continue;
      if (row.entryType !== "expense" || row.settlementStatus !== "settled" || isNeutralLedgerRow(row)) continue;
      if (!row.merchant) continue;
      const key = row.category || "";
      const inner = map.get(key) ?? new Map<string, number>();
      const spend = -(toPrimary(row) ?? 0);
      inner.set(row.merchant, (inner.get(row.merchant) ?? 0) + spend);
      map.set(key, inner);
    }
    return map;
  }, [ledgerRows, dateRange, toPrimary]);

  function topMerchantFor(key: string): string {
    const inner = merchantMap.get(key);
    if (!inner || inner.size === 0) return "無";
    return [...inner.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const defaultColors = ["var(--ns-chart-1)","var(--ns-chart-2)","var(--ns-chart-3)","var(--ns-chart-4)","var(--ns-chart-5)","#2dd4bf","#fb923c","#a78bfa","#f472b6","#facc15"];

  const allCategorySpend = spend.categories.map((cat, idx) => {
    const catSetting = appSettings?.categories?.find((c) => c.name === cat.name);
    return {
      name: cat.name,
      amount: cat.amount,
      count: cat.count,
      periodAmount: cat.amount,
      topMerchant: topMerchantFor(cat.name),
      color: catSetting?.color || defaultColors[idx % defaultColors.length],
      icon: catSetting?.iconName || "Tag",
    };
  });

  const [categorySort, setCategorySort] = useState<{ key: "name" | "count" | "amount"; dir: "asc" | "desc" }>({ key: "amount", dir: "desc" });

  const sortedCategories = useMemo(() => {
    const arr = [...allCategorySpend];
    arr.sort((a, b) => {
      if (categorySort.key === "name") {
        return categorySort.dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = categorySort.key === "count" ? a.count : a.periodAmount;
      const bv = categorySort.key === "count" ? b.count : b.periodAmount;
      return categorySort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [allCategorySpend, categorySort]);

  function toggleCategorySort(key: "name" | "count" | "amount") {
    setCategorySort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );
  }

  const uncategorizedAmount = spend.uncategorized.amount;
  const uncategorizedCount = spend.uncategorized.count;

  const totalPeriodSpend = spend.total;
  
  const maxSpendCat = allCategorySpend[0];
  const maxCountCat = [...allCategorySpend].sort((a, b) => b.count - a.count)[0];
  const uncategorizedPct = totalPeriodSpend > 0 ? (uncategorizedAmount / totalPeriodSpend) * 100 : 0;
  const uncategorizedTopMerchantRaw = topMerchantFor("");
  const uncategorizedTopMerchant = uncategorizedTopMerchantRaw === "無" ? "−" : uncategorizedTopMerchantRaw;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>最大支出</div>
          <div className="text-lg" style={{ fontWeight: 500 }}>
            {maxSpendCat ? `${maxSpendCat.name} · ${primaryCurrency} ${formatNumber(maxSpendCat.amount)}` : "無"}
          </div>
        </Card>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>交易最多</div>
          <div className="text-lg" style={{ fontWeight: 500 }}>
            {maxCountCat ? `${maxCountCat.name} · ${maxCountCat.count} 筆` : "無"}
          </div>
        </Card>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>未分類</div>
          <div className="text-lg" style={{ fontWeight: 500 }}>
            {uncategorizedCount} 筆 · {uncategorizedPct.toFixed(1)}%
          </div>
        </Card>
      </div>

      {/* Main Content — donut (fixed-width side) + table (main). SplitLayout
          stacks them on a phone and goes 2-up only when the container is wide
          enough (container query, not a viewport breakpoint). */}
      <SplitLayout sideWidth={300} sidePosition="start">
        {/* Left: Donut Chart */}
        <Card style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>{dateRange.label} 支出</div>
              <div className="num text-[24px]" style={{ fontWeight: 500 }}>{primaryCurrency} {formatNumber(totalPeriodSpend)}</div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onSettingsClick}><Gear size={16} /></Button>
          </div>
          
          <div style={{ height: 220, marginBottom: 24, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allCategorySpend}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="amount"
                  stroke="none"
                >
                  {allCategorySpend.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={resolveColor(entry.color)} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "var(--ns-fg)" }}
                  labelStyle={{ color: "var(--ns-fg)" }}
                  formatter={(v: any) => [`${primaryCurrency} ${formatNumber(v as number)}`, "支出"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {allCategorySpend.map(r => (
              <div key={r.name} className="text-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Glyph name={r.icon} size={14} /> {r.name}</span>
                </div>
                <span className="num muted">{(totalPeriodSpend > 0 ? (r.amount / totalPeriodSpend) * 100 : 0).toFixed(1)}%</span>
              </div>
            ))}
            {uncategorizedAmount > 0 && (
              <div className="text-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ns-muted)" }} />
                  <span>... 其他</span>
                </div>
                <span className="num muted">{uncategorizedPct.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </Card>

        {/* Right: Table */}
        <Card style={{ padding: "var(--ns-pad-card)",  overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Mobile: a 4-column table can't fit a phone — each category is a
              tappable card. The full table returns at sm+. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {allCategorySpend.map((r) => {
              const pct = totalPeriodSpend > 0 ? (r.amount / totalPeriodSpend) * 100 : 0;
              return (
                <Link
                  to="/cash-flow/categories/$categoryName"
                  params={{ categoryName: r.name }}
                  key={`m-${r.name}`}
                  className="flex items-center gap-3 rounded-xl border p-3 no-underline"
                  style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)", color: "inherit" }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--ns-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Glyph name={r.icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="muted truncate text-xs">{r.count} 筆 · {pct.toFixed(1)}%{r.topMerchant ? ` · ${r.topMerchant}` : ""}</div>
                  </div>
                  <div className="num text-sm" style={{ whiteSpace: "nowrap" }}>−{primaryCurrency} {formatNumber(r.periodAmount)}</div>
                </Link>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <div className="hidden sm:contents">
          <div className="text-xs" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", fontWeight: 500, color: "var(--ns-fg-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            <button style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }} onClick={() => toggleCategorySort("name")}>分類{categorySort.key === "name" ? (categorySort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
            <button style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }} onClick={() => toggleCategorySort("count")}>筆數{categorySort.key === "count" ? (categorySort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
            <button style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }} onClick={() => toggleCategorySort("amount")}>期間支出{categorySort.key === "amount" ? (categorySort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
            <div>佔比 / 主要商家</div>
            <div></div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sortedCategories.map((r) => {
              const pct = totalPeriodSpend > 0 ? (r.amount / totalPeriodSpend) * 100 : 0;
              return (
                <Link 
                  to="/cash-flow/categories/$categoryName" 
                  params={{ categoryName: r.name }} 
                  key={r.name} 
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div 
                    className="text-sm"
                    style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", alignItems: "center", cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ns-bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div className="text-base" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ns-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Glyph name={r.icon} size={16} />
                      </div>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                    </div>
                    <div>{r.count} 筆</div>
                    <div className="num">−{primaryCurrency} {formatNumber(r.periodAmount)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="text-caption" style={{ background: "var(--ns-bg-hover)", color: r.color, padding: "2px 6px", borderRadius: 99, fontWeight: 600 }}>
                        {pct.toFixed(1)}%
                      </span>
                      <span className="muted text-body">{r.topMerchant}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <CaretRight size={16} className="muted" />
                    </div>
                  </div>
                </Link>
              );
            })}
            
            {uncategorizedAmount > 0 && (
              <div className="text-sm" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="text-base" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ns-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ns-fg-muted)" }}>
                    ...
                  </div>
                  <span style={{ fontWeight: 500 }}>其他</span>
                </div>
                <div>{uncategorizedCount} 筆</div>
                <div className="num">−{primaryCurrency} {formatNumber(uncategorizedAmount)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-caption" style={{ background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)", padding: "2px 6px", borderRadius: 99, fontWeight: 600 }}>
                    {uncategorizedPct.toFixed(1)}%
                  </span>
                  <span className="muted text-body">{uncategorizedTopMerchant}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <CaretRight size={16} className="muted" />
                </div>
              </div>
            )}
          </div>
          </div>
        </Card>
      </SplitLayout>
    </div>
  );
}
