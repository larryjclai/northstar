import { Gear, CaretRight } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { SplitLayout } from "../components/coss/layout";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, type LedgerTransaction } from "../domain";
import { Glyph } from "../lib/icons";

function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  const name = color.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || color;
}

export function CategoriesTab({ filterMonth, ledgerRows, appSettings, primaryCurrency, toPrimary, onSettingsClick }: { filterMonth: string; ledgerRows: LedgerTransaction[]; appSettings: any; primaryCurrency: string; toPrimary: (row: LedgerTransaction) => number | null; onSettingsClick: () => void }) {
  const currentYear = filterMonth.slice(0, 4);
  
  const monthRows = useMemo(() => ledgerRows.filter(r => r.date.startsWith(filterMonth) && r.entryType === "expense" && r.settlementStatus === "settled"), [ledgerRows, filterMonth]);
  const ytdRows = useMemo(() => ledgerRows.filter(r => r.date.startsWith(currentYear) && r.date <= filterMonth + "-31" && r.entryType === "expense" && r.settlementStatus === "settled"), [ledgerRows, currentYear, filterMonth]);
  
  const monthMap = new Map<string, { amount: number, count: number }>();
  let uncategorizedAmount = 0;
  let uncategorizedCount = 0;
  
  for (const row of monthRows) {
    const key = row.category;
    if (!key) {
      uncategorizedAmount += Math.abs(toPrimary(row) ?? 0);
      uncategorizedCount++;
      continue;
    }
    const curr = monthMap.get(key) ?? { amount: 0, count: 0 };
    monthMap.set(key, { amount: curr.amount + Math.abs(toPrimary(row) ?? 0), count: curr.count + 1 });
  }

  const ytdMap = new Map<string, { amount: number, merchants: Map<string, number> }>();
  for (const row of ytdRows) {
    const key = row.category || "未分類";
    const curr = ytdMap.get(key) ?? { amount: 0, merchants: new Map() };
    curr.amount += Math.abs(toPrimary(row) ?? 0);
    if (row.merchant) {
      curr.merchants.set(row.merchant, (curr.merchants.get(row.merchant) ?? 0) + Math.abs(toPrimary(row) ?? 0));
    }
    ytdMap.set(key, curr);
  }
  
  const defaultColors = ["var(--ns-chart-1)","var(--ns-chart-2)","var(--ns-chart-3)","var(--ns-chart-4)","var(--ns-chart-5)","#2dd4bf","#fb923c","#a78bfa","#f472b6","#facc15"];
  
  const allCategorySpend = [...monthMap.entries()]
    .map(([name, stats], idx) => {
      const catSetting = appSettings?.categories?.find((c: any) => c.name === name);
      const ytdStats = ytdMap.get(name);
      
      let topMerchant = "無";
      if (ytdStats && ytdStats.merchants.size > 0) {
        topMerchant = [...ytdStats.merchants.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      
      return { 
        name, 
        amount: stats.amount, 
        count: stats.count,
        ytdAmount: ytdStats?.amount ?? 0,
        topMerchant,
        color: catSetting?.color || defaultColors[idx % defaultColors.length], 
        icon: catSetting?.iconName || 'Tag'
      };
    })
    .sort((a, b) => b.amount - a.amount);
    
  const totalMonthSpend = allCategorySpend.reduce((s, c) => s + c.amount, 0) + uncategorizedAmount;
  
  const maxSpendCat = allCategorySpend[0];
  const maxCountCat = [...allCategorySpend].sort((a, b) => b.count - a.count)[0];
  const uncategorizedPct = totalMonthSpend > 0 ? (uncategorizedAmount / totalMonthSpend) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>最大支出</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {maxSpendCat ? `${maxSpendCat.name} · ${primaryCurrency} ${formatNumber(maxSpendCat.amount)}` : "無"}
          </div>
        </Card>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>交易最多</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {maxCountCat ? `${maxCountCat.name} · ${maxCountCat.count} 筆` : "無"}
          </div>
        </Card>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>未分類</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
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
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>{parseInt(filterMonth.split("-")[1], 10)} 月支出</div>
              <div className="num" style={{ fontSize: 24, fontWeight: 500 }}>{primaryCurrency} {formatNumber(totalMonthSpend)}</div>
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
              <div key={r.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Glyph name={r.icon} size={14} /> {r.name}</span>
                </div>
                <span className="num muted">{(totalMonthSpend > 0 ? (r.amount / totalMonthSpend) * 100 : 0).toFixed(1)}%</span>
              </div>
            ))}
            {uncategorizedAmount > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
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
              const pct = totalMonthSpend > 0 ? (r.amount / totalMonthSpend) * 100 : 0;
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
                    <div className="muted truncate" style={{ fontSize: 12 }}>{r.count} 筆 · {pct.toFixed(1)}%{r.topMerchant ? ` · ${r.topMerchant}` : ""}</div>
                  </div>
                  <div className="num" style={{ whiteSpace: "nowrap", fontSize: 14 }}>−{primaryCurrency} {formatNumber(r.ytdAmount)}</div>
                </Link>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <div className="hidden sm:contents">
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", fontSize: 12, fontWeight: 500, color: "var(--ns-fg-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            <div>分類</div>
            <div>筆數</div>
            <div>YTD 支出</div>
            <div>佔比 TOP MERCHANT</div>
            <div></div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {allCategorySpend.map((r) => {
              const pct = totalMonthSpend > 0 ? (r.amount / totalMonthSpend) * 100 : 0;
              return (
                <Link 
                  to="/cash-flow/categories/$categoryName" 
                  params={{ categoryName: r.name }} 
                  key={r.name} 
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div 
                    style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", alignItems: "center", fontSize: 14, cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ns-bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ns-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                        <Glyph name={r.icon} size={16} />
                      </div>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                    </div>
                    <div>{r.count} 筆</div>
                    <div className="num">−{primaryCurrency} {formatNumber(r.ytdAmount)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: "var(--ns-bg-hover)", color: r.color, padding: "2px 6px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                        {pct.toFixed(1)}%
                      </span>
                      <span className="muted" style={{ fontSize: 13 }}>{r.topMerchant}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <CaretRight size={16} className="muted" />
                    </div>
                  </div>
                </Link>
              );
            })}
            
            {uncategorizedAmount > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", alignItems: "center", fontSize: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ns-bg-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--ns-fg-muted)" }}>
                    ...
                  </div>
                  <span style={{ fontWeight: 500 }}>其他</span>
                </div>
                <div>{uncategorizedCount} 筆</div>
                <div className="num">−{primaryCurrency} {formatNumber(ytdMap.get("未分類")?.amount ?? 0)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)", padding: "2px 6px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                    {uncategorizedPct.toFixed(1)}%
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>−</span>
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
