import { CaretRight } from "@phosphor-icons/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "../components/coss/card";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties } from "react";
import {
  formatNumber,
  formatCompactMoney,
  isWithinDateScope,
  type LedgerTransaction,
  type ResolvedDateScope,
} from "../domain";
import { readableTextColor } from "../lib/color";

export function MerchantsTab({
  dateRange,
  ledgerRows,
  primaryCurrency,
  toPrimary,
}: {
  dateRange: ResolvedDateScope;
  ledgerRows: LedgerTransaction[];
  primaryCurrency: string;
  toPrimary: (row: LedgerTransaction) => number | null;
}) {
  const navigate = useNavigate();

  const periodRows = useMemo(
    () =>
      ledgerRows.filter(
        (r) =>
          isWithinDateScope(r.date, dateRange) &&
          r.entryType === "expense" &&
          r.settlementStatus === "settled" &&
          !r.counterAccountId &&
          r.merchant,
      ),
    [ledgerRows, dateRange],
  );

  const periodMap = new Map<
    string,
    { amount: number; visits: number; category: string; lastVisit: string }
  >();

  for (const row of periodRows) {
    const key = row.merchant;
    if (!key) continue;

    const curr = periodMap.get(key) ?? {
      amount: 0,
      visits: 0,
      category: row.category || "未分類",
      lastVisit: row.date,
    };
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

  const [merchantSort, setMerchantSort] = useState<{
    key: "name" | "visits" | "amount";
    dir: "asc" | "desc";
  }>({ key: "amount", dir: "desc" });

  const sortedMerchants = useMemo(() => {
    const arr = [...allMerchantSpend];
    arr.sort((a, b) => {
      if (merchantSort.key === "name") {
        return merchantSort.dir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      const av = merchantSort.key === "visits" ? a.visits : a.amount;
      const bv = merchantSort.key === "visits" ? b.visits : b.amount;
      return merchantSort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [allMerchantSpend, merchantSort]);

  function toggleMerchantSort(key: "name" | "visits" | "amount") {
    setMerchantSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  const maxSpendMerchant = allMerchantSpend[0];
  const maxVisitsMerchant = [...allMerchantSpend].sort((a, b) => b.visits - a.visits)[0];
  const totalSpend = allMerchantSpend.reduce((sum, m) => sum + m.amount, 0);

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const defaultColors = [
    "var(--ns-chart-1)",
    "var(--ns-chart-2)",
    "var(--ns-chart-3)",
    "var(--ns-chart-4)",
    "var(--ns-chart-5)",
    "var(--ns-chart-6)",
    "var(--ns-chart-7)",
  ];

  // Top-5 spend merchants for the pie, with the remainder folded into 其他 (B22).
  const top5Pie = useMemo(() => {
    const top = allMerchantSpend.slice(0, 5).map((m, i) => ({
      name: m.name,
      value: m.amount,
      color: defaultColors[i % defaultColors.length],
    }));
    const rest = allMerchantSpend.slice(5).reduce((sum, m) => sum + m.amount, 0);
    return rest > 0 ? [...top, { name: "其他", value: rest, color: "var(--ns-border)" }] : top;
  }, [allMerchantSpend]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Cards */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
      >
        <Card className="py-5 px-6">
          <div className="text-xs muted mb-2 font-medium">最高支出商家</div>
          <div className="text-lg font-medium">
            {maxSpendMerchant
              ? `${maxSpendMerchant.name} · ${primaryCurrency} ${formatNumber(maxSpendMerchant.amount)}`
              : "無"}
          </div>
        </Card>
        <Card className="py-5 px-6">
          <div className="text-xs muted mb-2 font-medium">最常消費</div>
          <div className="text-lg font-medium">
            {maxVisitsMerchant
              ? `${maxVisitsMerchant.name} · ${maxVisitsMerchant.visits} 次`
              : "無"}
          </div>
        </Card>
        <Card className="py-5 px-6">
          <div className="text-xs muted mb-2 font-medium">{dateRange.label} 總支出</div>
          <div className="text-lg font-medium">
            {primaryCurrency} {formatNumber(totalSpend)} · {allMerchantSpend.length} 個商家
          </div>
        </Card>
      </div>

      {/* Top 5 spend merchants pie (B22) */}
      {top5Pie.length > 0 ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <div className="text-xs muted mb-3 font-medium">Top 5 支出商家 · {dateRange.label}</div>
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <div style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={top5Pie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    stroke="none"
                    paddingAngle={2}
                    style={{ cursor: "pointer" }}
                    onClick={(d: { name?: string }) => {
                      if (d?.name && d.name !== "其他") {
                        void navigate({
                          to: "/cash-flow/merchants/$merchantName",
                          params: { merchantName: d.name },
                        });
                      }
                    }}
                  >
                    {top5Pie.map((m) => (
                      <Cell key={m.name} fill={m.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => [
                      `${primaryCurrency} ${formatNumber(v as number)}`,
                      "支出",
                    ]}
                    contentStyle={{
                      background: "var(--ns-surface)",
                      border: "1px solid var(--ns-border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    itemStyle={{ color: "var(--ns-fg)" }}
                    labelStyle={{ color: "var(--ns-fg)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2">
              {top5Pie.map((m) => {
                const rowContent = (
                  <>
                    <span
                      className="shrink-0"
                      style={{ width: 10, height: 10, borderRadius: 3, background: m.color }}
                    />
                    <span
                      className="flex-1 min-w-0"
                      style={{ lineHeight: 1.25, wordBreak: "break-word" }}
                    >
                      {m.name}
                    </span>
                    <span className="num muted text-xs shrink-0">
                      {formatCompactMoney(m.value, primaryCurrency)}
                    </span>
                    <span className="num text-right shrink-0" style={{ minWidth: 44 }}>
                      {totalSpend > 0 ? ((m.value / totalSpend) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </>
                );
                const rowStyle: CSSProperties = {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid var(--ns-border)",
                  paddingBottom: 6,
                };
                return m.name === "其他" ? (
                  <div key={m.name} className="text-body" style={rowStyle}>
                    {rowContent}
                  </div>
                ) : (
                  <Link
                    key={m.name}
                    to="/cash-flow/merchants/$merchantName"
                    params={{ merchantName: m.name }}
                    className="text-body"
                    style={{
                      ...rowStyle,
                      textDecoration: "none",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {rowContent}
                  </Link>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Main Content */}
      <Card className="flex flex-col" style={{ padding: "var(--ns-pad-card)", overflow: "hidden" }}>
        {/* Mobile: a 4-column table can't fit a phone, so each merchant is a
            tappable card (avatar, name, category · visits, period spend). The full
            table returns at sm+. */}
        <div className="flex flex-col gap-2 sm:hidden">
          {allMerchantSpend.length === 0 ? (
            <div className="muted text-body p-6 text-center">無商家紀錄</div>
          ) : (
            allMerchantSpend.map((r, idx) => {
              const bg = defaultColors[idx % defaultColors.length];
              return (
                <Link
                  to="/cash-flow/merchants/$merchantName"
                  params={{ merchantName: r.name }}
                  key={`m-${r.name}`}
                  className="flex items-center gap-3 rounded-xl border p-3 no-underline"
                  style={{
                    borderColor: "var(--ns-border)",
                    background: "var(--ns-surface)",
                    color: "inherit",
                  }}
                >
                  <div
                    className="text-[15px] flex items-center justify-center font-semibold shrink-0"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: bg,
                      color: readableTextColor(bg),
                    }}
                  >
                    {getInitials(r.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="muted truncate text-xs">
                      {r.category} · {r.visits} 次
                    </div>
                  </div>
                  <div className="num text-sm" style={{ whiteSpace: "nowrap" }}>
                    −{primaryCurrency} {formatNumber(r.amount)}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:contents">
          <div
            className="text-xs py-4 px-6 font-medium muted"
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px",
              borderBottom: "1px solid var(--ns-border)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            <button
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
              onClick={() => toggleMerchantSort("name")}
            >
              商家{merchantSort.key === "name" ? (merchantSort.dir === "asc" ? " ▲" : " ▼") : ""}
            </button>
            <div>分類</div>
            <button
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
              onClick={() => toggleMerchantSort("visits")}
            >
              期間次數
              {merchantSort.key === "visits" ? (merchantSort.dir === "asc" ? " ▲" : " ▼") : ""}
            </button>
            <button
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
              onClick={() => toggleMerchantSort("amount")}
            >
              期間支出
              {merchantSort.key === "amount" ? (merchantSort.dir === "asc" ? " ▲" : " ▼") : ""}
            </button>
            <div></div>
          </div>

          <div className="flex-1" style={{ overflowY: "auto" }}>
            {allMerchantSpend.length === 0 ? (
              <div className="muted text-body text-center" style={{ padding: "40px" }}>
                無商家紀錄
              </div>
            ) : (
              sortedMerchants.map((r, idx) => {
                const bg = defaultColors[idx % defaultColors.length];
                return (
                  <Link
                    to="/cash-flow/merchants/$merchantName"
                    params={{ merchantName: r.name }}
                    key={r.name}
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      className="text-sm py-4 px-6 items-center"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.5fr 1fr 1fr 1fr 40px",
                        borderBottom: "1px solid var(--ns-border)",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--ns-bg-hover)")
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="text-base flex items-center justify-center font-semibold"
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: bg,
                            color: readableTextColor(bg),
                          }}
                        >
                          {getInitials(r.name)}
                        </div>
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="muted text-xs">最近：{r.lastVisit}</div>
                        </div>
                      </div>
                      <div>{r.category}</div>
                      <div>{r.visits} 次</div>
                      <div className="num">
                        −{primaryCurrency} {formatNumber(r.amount)}
                      </div>
                      <div className="flex" style={{ justifyContent: "flex-end" }}>
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
