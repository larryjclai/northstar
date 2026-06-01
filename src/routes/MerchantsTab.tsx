import { CaretRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { formatNumber, type LedgerTransaction } from "../domain";

export function MerchantsTab({ filterMonth, ledgerRows, primaryCurrency, toPrimary }: { filterMonth: string; ledgerRows: LedgerTransaction[]; primaryCurrency: string; toPrimary: (row: LedgerTransaction) => number | null }) {
  const currentYear = filterMonth.slice(0, 4);
  
  const ytdRows = useMemo(() => ledgerRows.filter(r => r.date.startsWith(currentYear) && r.date <= filterMonth + "-31" && r.entryType === "expense" && r.settlementStatus === "settled" && r.merchant), [ledgerRows, currentYear, filterMonth]);
  
  const ytdMap = new Map<string, { amount: number, visits: number, category: string, lastVisit: string }>();
  
  for (const row of ytdRows) {
    const key = row.merchant;
    if (!key) continue;
    
    const curr = ytdMap.get(key) ?? { amount: 0, visits: 0, category: row.category || "未分類", lastVisit: row.date };
    curr.amount += Math.abs(toPrimary(row) ?? 0);
    curr.visits += 1;
    if (row.date > curr.lastVisit) {
      curr.lastVisit = row.date;
      curr.category = row.category || curr.category;
    }
    ytdMap.set(key, curr);
  }
  
  const allMerchantSpend = [...ytdMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.amount - a.amount);
    
  const maxSpendMerchant = allMerchantSpend[0];
  const maxVisitsMerchant = [...allMerchantSpend].sort((a, b) => b.visits - a.visits)[0];
  const totalSpend = allMerchantSpend.reduce((sum, m) => sum + m.amount, 0);

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };
  
  const defaultColors = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#2dd4bf", "#60a5fa", "#a78bfa", "#f472b6"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <div className="ns-card" style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Top Merchant</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {maxSpendMerchant ? `${maxSpendMerchant.name} · ${primaryCurrency} ${formatNumber(maxSpendMerchant.amount)}` : "無"}
          </div>
        </div>
        <div className="ns-card" style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Most Frequent</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {maxVisitsMerchant ? `${maxVisitsMerchant.name} · ${maxVisitsMerchant.visits} 次` : "無"}
          </div>
        </div>
        <div className="ns-card" style={{ padding: "20px 24px" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Total Spending YTD</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            {primaryCurrency} {formatNumber(totalSpend)} · {allMerchantSpend.length} merchants
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ns-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px", padding: "16px 24px", borderBottom: "1px solid var(--ns-border)", fontSize: 12, fontWeight: 500, color: "var(--ns-fg-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          <div>Merchant</div>
          <div>Category</div>
          <div>Visits YTD</div>
          <div>Spending YTD</div>
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
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>
                        {getInitials(r.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{r.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>Last: {r.lastVisit}</div>
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
    </div>
  );
}
