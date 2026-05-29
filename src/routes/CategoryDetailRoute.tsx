import { CaretLeft, Trash } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useFinanceData } from "../data/hooks";
import { formatNumber, type LedgerTransaction } from "../domain";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";

export function CategoryDetailRoute() {
  const { categoryName } = useParams({ strict: false }) as { categoryName: string };
  const { ledger, settings, accounts } = useFinanceData();
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);

  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const accountRows = accounts.data ?? [];
  
  const accountName = (id: string) => accountRows.find(a => a.id === id)?.name ?? id;

  const category = appSettings?.categories?.find((c) => c.name === categoryName);
  const color = category?.color ?? "var(--ns-accent)";
  const icon = category?.iconName ?? "📦";

  const rows = useMemo(
    () =>
      ledgerRows
        .filter((r) => r.category === categoryName && r.entryType === "expense" && r.settlementStatus === "settled")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows, categoryName]
  );

  const totalSpent = rows.reduce((s, r) => s + Math.abs(r.amount), 0);

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      map.set(m, (map.get(m) ?? 0) + Math.abs(r.amount));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount }));
  }, [rows]);

  return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Link to="/cash-flow" className="ns-btn ghost" style={{ padding: "6px 0", fontSize: 13, marginBottom: 8 }}>
          <CaretLeft size={14} /> 返回記帳
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 32 }}>{icon}</span>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, fontWeight: 600 }}>
            {categoryName}
          </h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="ns-card" style={{ padding: 24 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>總支出</div>
            <div className="num" style={{ fontSize: 28, fontWeight: 500, marginBottom: 20 }}>
              NT${formatNumber(totalSpent)}
            </div>
            
            {monthlyData.length > 0 && (
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <Tooltip 
                      cursor={{ fill: "var(--ns-bg-hover)" }}
                      contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                      formatter={(v: any) => [`NT$${formatNumber(v as number)}`, "支出"]}
                      labelFormatter={(v) => String(v).replace("-", " / ")}
                    />
                    <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                      {monthlyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="ns-card">
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ns-border)", fontWeight: 600 }}>
              交易紀錄
            </div>
            {rows.length === 0 ? (
              <div className="muted" style={{ padding: "40px", textAlign: "center", fontSize: 13 }}>
                無交易紀錄
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {rows.map((row) => (
                  <div
                    key={row.id}
                    onClick={() => setDetailRow(row)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 24px",
                      borderBottom: "1px solid var(--ns-border)",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ns-bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500 }}>{row.name || row.merchant}</span>
                        {row.note && <span className="muted" style={{ fontSize: 11 }}>{row.note}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.date} · {accountName(row.accountId)} {row.merchant ? `· ${row.merchant}` : ""}
                      </div>
                    </div>
                    <div className="num" style={{ fontWeight: 500 }}>
                      NT${formatNumber(Math.abs(row.amount))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div></div>
      </div>
      
      <TransactionDetailPanel
        row={detailRow}
        onClose={() => setDetailRow(null)}
        accountName={accountName}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
