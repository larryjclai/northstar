import { CaretRight } from "@phosphor-icons/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "../components/coss/card";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { formatNumber, formatCompactMoney, isWithinDateScope, type LedgerTransaction, type ResolvedDateScope } from "../domain";
import { readableTextColor } from "../lib/color";

export function MerchantsTab({ dateRange, ledgerRows, primaryCurrency, toPrimary }: { dateRange: ResolvedDateScope; ledgerRows: LedgerTransaction[]; primaryCurrency: string; toPrimary: (row: LedgerTransaction) => number | null }) {
  
  const periodRows = useMemo(() => ledgerRows.filter(r => isWithinDateScope(r.date, dateRange) && r.entryType === "expense" && r.settlementStatus === "settled" && !r.counterAccountId && r.merchant), [ledgerRows, dateRange]);
  
  const periodMap = new Map<string, { amount: number, visits: number, category: string, lastVisit: string }>();
  
  for (const row of periodRows) {
    const key = row.merchant;
    if (!key) continue;
    
    const curr = periodMap.get(key) ?? { amount: 0, visits: 0, category: row.category || "未分類", lastVisit: row.date };
    curr.amount += Math.abs(toPrimary(row) ?? 0);
    curr.visits += 1;
    if (row.date > curr.lastVisit) {
      curr.lastVisit = row.date;
      curr.category = row.category || curr.category;
    }
    periodMap.set(key, curr);
  }
  
  const allMerchantSpend = [...periodMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.amount - a.amount);
    
  const maxSpendMerchant = allMerchantSpend[0];
  const maxVisitsMerchant = [...allMerchantSpend].sort((a, b) => b.visits - a.visits)[0];
  const totalSpend = allMerchantSpend.reduce((sum, m) => sum + m.amount, 0);

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };
  
  const defaultColors = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#60a5fa", "#a78bfa", "#f472b6"];

  // Top-5 spend merchants for the pie, with the remainder folded into 其他 (B22).
  const top5Pie = useMemo(() => {
    const top = allMerchantSpend.slice(0, 5).map((m, i) => ({ name: m.name, value: m.amount, color: defaultColors[i % defaultColors.length] }));
    const rest = allMerchantSpend.slice(5).reduce((sum, m) => sum + m.amount, 0);
    return rest > 0 ? [...top, { name: "其他", value: rest, color: "var(--ns-border)" }] : top;
  }, [allMerchantSpend]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 20 }}>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>最高支出商家</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {maxSpendMerchant ? `${maxSpendMerchant.name} · ${primaryCurrency} ${formatNumber(maxSpendMerchant.amount)}` : "無"}
          </div>
        </Card>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>最常消費</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {maxVisitsMerchant ? `${maxVisitsMerchant.name} · ${maxVisitsMerchant.visits} 次` : "無"}
          </div>
        </Card>
        <Card style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{dateRange.label} 總支出</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {primaryCurrency} {formatNumber(totalSpend)} · {allMerchantSpend.length} 個商家
          </div>
        </Card>
      </div>

      {/* Top 5 spend merchants pie (B22) */}
      {top5Pie.length > 0 ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 12 }}>Top 5 支出商家 · {dateRange.label}</div>
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <div style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={top5Pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} stroke="none" paddingAngle={2}>
                    {top5Pie.map((m) => <Cell key={m.name} fill={m.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => [`${primaryCurrency} ${formatNumber(v as number)}`, "支出"]}
                    contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                    itemStyle={{ color: "var(--ns-fg)" }}
                    labelStyle={{ color: "var(--ns-fg)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {top5Pie.map((m) => (
                <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, borderBottom: "1px solid var(--ns-border)", paddingBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25, wordBreak: "break-word" }}>{m.name}</span>
                  <span className="num muted" style={{ fontSize: 12, flexShrink: 0 }}>{formatCompactMoney(m.value, primaryCurrency)}</span>
                  <span className="num" style={{ minWidth: 44, textAlign: "right", flexShrink: 0 }}>{totalSpend > 0 ? ((m.value / totalSpend) * 100).toFixed(1) : "0.0"}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Main Content */}
      <Card style={{ padding: "var(--ns-pad-card)",  overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Mobile: a 4-column table can't fit a phone, so each merchant is a
            tappable card (avatar, name, category · visits, period spend). The full
            table returns at sm+. */}
        <div className="flex flex-col gap-2 sm:hidden">
          {allMerchantSpend.length === 0 ? (
            <div className="muted" style={{ padding: 24, textAlign: "center", fontSize: 13 }}>無商家紀錄</div>
          ) : allMerchantSpend.map((r, idx) => {
            const bg = defaultColors[idx % defaultColors.length];
            return (
              <Link
                to="/cash-flow/merchants/$merchantName"
                params={{ merchantName: r.name }}
                key={`m-${r.name}`}
                className="flex items-center gap-3 rounded-xl border p-3 no-underline"
                style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)", color: "inherit" }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, color: readableTextColor(bg), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{getInitials(r.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontWeight: 500 }}>{r.name}</div>
                  <div className="muted truncate" style={{ fontSize: 12 }}>{r.category} · {r.visits} 次</div>
                </div>
                <div className="num" style={{ whiteSpace: "nowrap", fontSize: 14 }}>−{primaryCurrency} {formatNumber(r.amount)}</div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:contents">
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", fontSize: 12, fontWeight: 500, color: "var(--ns-fg-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          <div>商家</div>
          <div>分類</div>
          <div>期間次數</div>
          <div>期間支出</div>
          <div></div>
        </div>
        
        <div style={{ flex: 1, overflowY: "auto" }}>
          {allMerchantSpend.length === 0 ? (
            <div className="muted" style={{ padding: "40px", textAlign: "center", fontSize: 13 }}>無商家紀錄</div>
          ) : (
            allMerchantSpend.map((r, idx) => {
              const bg = defaultColors[idx % defaultColors.length];
              return (
                <Link 
                  to="/cash-flow/merchants/$merchantName" 
                  params={{ merchantName: r.name }} 
                  key={r.name} 
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", alignItems: "center", fontSize: 14, cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ns-bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color: readableTextColor(bg), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>
                        {getInitials(r.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{r.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>最近：{r.lastVisit}</div>
                      </div>
                    </div>
                    <div>{r.category}</div>
                    <div>{r.visits} 次</div>
                    <div className="num">−{primaryCurrency} {formatNumber(r.amount)}</div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <CaretRight size={16} className="muted" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
        </div>
      </Card>
    </div>
  );
}
