import { CaretLeft, Trash } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useFinanceData } from "../data/hooks";
import { convertCurrency, formatMoney, type LedgerTransaction } from "../domain";
import { Glyph } from "../lib/icons";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";

export function CategoryDetailRoute() {
  const { categoryName } = useParams({ strict: false }) as { categoryName: string };
  const { ledger, settings, accounts, dailyFxRates } = useFinanceData();
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);

  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const fxHistory = dailyFxRates.data ?? [];
  const accountRows = accounts.data ?? [];
  
  const accountName = (id: string) => accountRows.find(a => a.id === id)?.name ?? id;

  const category = appSettings?.categories?.find((c) => c.name === categoryName);
  const color = category?.color ?? "var(--ns-accent)";
  const icon = category?.iconName ?? "Tag";

  function resolveColor(c: string): string {
    if (!c.startsWith("var(")) return c;
    const name = c.slice(4, -1).trim();
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || c;
  }

  const rows = useMemo(
    () =>
      ledgerRows
        .filter((r) => r.category === categoryName && r.entryType === "expense" && r.settlementStatus === "settled")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows, categoryName]
  );

  const convertedAmount = (row: LedgerTransaction) => convertCurrency(Math.abs(row.amount), row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date });
  const missingFxPairs = [...new Set(rows.filter((row) => convertedAmount(row) === null).map((row) => `${row.currency}/${primaryCurrency}`))];
  const totalSpent = rows.reduce((s, r) => s + (convertedAmount(r) ?? 0), 0);

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      map.set(m, (map.get(m) ?? 0) + (convertedAmount(r) ?? 0));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount }));
  }, [rows, appSettings, fxHistory, primaryCurrency]);

  return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Link to="/cash-flow" className="ns-btn ghost" style={{ padding: "6px 0", fontSize: 13, marginBottom: 8 }}>
          <CaretLeft size={14} /> 返回記帳
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Glyph name={icon} size={32} color={resolveColor(color)} />
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
              {formatMoney(totalSpent, primaryCurrency)}
            </div>
            {missingFxPairs.length ? <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>總額不完整：缺少 {missingFxPairs.join("、")} 匯率。<Link to="/settings">前往更新</Link></div> : null}
            
            {monthlyData.length > 0 && (
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" hide />
                    <Tooltip
                      cursor={{ fill: resolveColor("var(--ns-bg-hover)") }}
                      contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                      formatter={(v: any) => [formatMoney(v as number, primaryCurrency), "支出"]}
                      labelFormatter={(v) => String(v).replace("-", " / ")}
                    />
                    <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                      {monthlyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={resolveColor(color)} />
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
                      {formatMoney(Math.abs(row.amount), row.currency)}
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
