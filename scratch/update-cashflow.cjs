const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, "..", "src/routes/CashFlowRoute.tsx");
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Imports
content = content.replace(
`import {
  ArrowsLeftRight,
  CalendarBlank,
  Check,
  DownloadSimple,
  Plus,
  Receipt,
  Tag,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";`,
`import {
  ArrowsLeftRight,
  CalendarBlank,
  Check,
  DownloadSimple,
  Plus,
  Receipt,
  Tag,
  Trash,
  UploadSimple,
  X,
  Funnel,
  CaretDown
} from "@phosphor-icons/react";
import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { useToast } from "../components/Toast";`);

// 2. States
content = content.replace(
`  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");

  const appSettings = settings.data;`,
`  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");
  const toast = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => todayInTimezone(timezone).slice(0, 7));
  const [selectedAccount, setSelectedAccount] = useState("all");

  const appSettings = settings.data;`);

// 3. monthRows calculation
content = content.replace(
`  const monthKey = todayInTimezone(timezone).slice(0, 7);
  const monthRows = useMemo(() => ledgerRows.filter((row) => row.date.startsWith(monthKey)), [ledgerRows, monthKey]);`,
`  const monthKey = selectedMonth;
  const monthRows = useMemo(() => ledgerRows.filter((row) => {
    if (!row.date.startsWith(monthKey)) return false;
    if (selectedAccount !== "all" && row.accountId !== selectedAccount) return false;
    return true;
  }), [ledgerRows, monthKey, selectedAccount]);`);

// 4. Rankings and Chart Data
content = content.replace(
`    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [monthRows]);

  const sortedRows = useMemo(`,
`    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [monthRows]);

  const topMerchantSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of monthRows) {
      if (row.entryType !== "expense" || row.settlementStatus !== "settled" || !row.merchant) continue;
      map.set(row.merchant, (map.get(row.merchant) ?? 0) + Math.abs(row.amount));
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [monthRows]);

  const dailyNetData = useMemo(() => {
    const [year, month] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = \`\${monthKey}-\${i.toString().padStart(2, "0")}\`;
      let net = 0;
      for (const row of monthRows) {
        if (row.date.startsWith(dateStr) && row.entryType !== "transfer" && row.settlementStatus === "settled") {
          net += row.amount;
        }
      }
      data.push({ date: i, net });
    }
    return data;
  }, [monthRows, monthKey]);

  const sortedRows = useMemo(`);

// 5. Submit handlers
content = content.replace(
`      if (editingId) await updateLedger.mutateAsync({ ...payload, id: editingId });
      else await createLedger.mutateAsync(payload);
      await rememberCategories.mutateAsync([{ category: payload.category, subcategory: payload.subcategory }]);
      rememberMerchantNames([payload.merchant]);
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "收支儲存失敗。");
    }`,
`      if (editingId) {
        await updateLedger.mutateAsync({ ...payload, id: editingId });
        toast.success("已更新交易");
      } else {
        await createLedger.mutateAsync(payload);
        toast.success("已新增交易");
      }
      await rememberCategories.mutateAsync([{ category: payload.category, subcategory: payload.subcategory }]);
      rememberMerchantNames([payload.merchant]);
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "收支儲存失敗。");
    }`);

content = content.replace(
`      await createTransfer.mutateAsync(transferForm);
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轉帳儲存失敗。");
    }`,
`      await createTransfer.mutateAsync(transferForm);
      toast.success("已建立轉帳");
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轉帳儲存失敗。");
    }`);

content = content.replace(
`  async function markSettled(row: LedgerTransaction) {
    await updateLedger.mutateAsync({`,
`  async function handleDelete(id: string) {
    try {
      await deleteLedger.mutateAsync(id);
      toast.success("已刪除交易");
    } catch (e) {
      toast.error("刪除失敗");
    }
  }

  async function markSettled(row: LedgerTransaction) {
    await updateLedger.mutateAsync({`);

content = content.replace(
`onDelete={() => deleteLedger.mutate(row.id)}`,
`onDelete={() => handleDelete(row.id)}`);

// 6. JSX Replacement
const originalJsx = `return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{monthLabel} · {monthRows.length} 筆</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
            記帳
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn" onClick={() => downloadCsv("northstar-ledger.csv", exportLedgerCsv(ledgerRows, accountName))}>
            <DownloadSimple size={14} />匯出
          </button>
          <label>
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={handleCsv} />
            <span className="ns-btn" style={{ cursor: "pointer" }}><UploadSimple size={14} />匯入</span>
          </label>
          <button className="ns-btn primary" onClick={() => openCreate("expense")}>
            <Plus size={14} weight="bold" />新增交易
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="本月收入" value={\`NT\$\${formatNumber(monthIncome)}\`} tone="pos" />
        <StatCard label="本月支出" value={\`NT\$\${formatNumber(monthExpense)}\`} tone="neg" />
        <StatCard label="本月淨額" value={\`\${monthNet < 0 ? "−" : ""}NT\$\${formatNumber(Math.abs(monthNet))}\`} tone={monthNet >= 0 ? "pos" : "neg"} />
        <StatCard label="本月轉帳筆數" value={\`\${monthTransferCount} 筆\`} tone="muted" />
      </div>

      {message ? (
        <div className="ns-card" style={{ marginBottom: 16, padding: "10px 16px", color: "var(--ns-neg)", fontSize: 13 }}>{message}</div>
      ) : null}

      {preview ? (
        <div className="ns-card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
          </div>
          {preview.invalid.map((item) => (
            <div key={item.row} style={{ fontSize: 13, color: "var(--ns-neg)" }}>Row {item.row}: {item.reason}</div>
          ))}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              className="ns-btn primary"
              onClick={async () => {
                const rows = preview.valid.map((item) => item.value);
                await importLedger.mutateAsync(rows);
                rememberMerchantNames(rows.map((row) => row.merchant));
                setPreview(null);
              }}
            >
              確認匯入
            </button>
            <button className="ns-btn" onClick={() => setPreview(null)}>取消</button>
          </div>
        </div>
      ) : null}

      {/* Main: ledger list + side rankings */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
        {/* 流水帳 */}
        <div className="ns-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--ns-border)" }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>流水帳</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="ns-btn ghost" style={{ fontSize: 12.5 }} onClick={() => openCreate("income")}>收入</button>
              <button className="ns-btn ghost" style={{ fontSize: 12.5 }} onClick={() => openCreate("expense")}>支出</button>
              <button className="ns-btn ghost" style={{ fontSize: 12.5 }} onClick={() => openCreate("transfer")}>轉帳</button>
            </div>
          </div>

          {dayGroups.length === 0 ? (
            <div style={{ padding: "56px 20px", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Receipt size={24} weight="duotone" />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒有記帳資料</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>新增一筆收入 / 支出 / 轉帳，或匯入 CSV。</div>
              <button className="ns-btn primary" onClick={() => openCreate("expense")}><Plus size={14} weight="bold" />新增交易</button>
            </div>
          ) : (
            dayGroups.map((group) => (
              <div key={group.date}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 20px", background: "var(--ns-bg-elev)", borderBottom: "1px solid var(--ns-border)" }}>
                  <span className="ns-eyebrow">{group.date}</span>
                  <span className="num muted" style={{ fontSize: 12 }}>
                    {group.net < 0 ? "−" : "+"}NT\${formatNumber(Math.abs(group.net))}
                  </span>
                </div>
                {group.rows.map((row) => (
                  <LedgerRow
                    key={row.id}
                    row={row}
                    accountName={accountName}
                    onEdit={() => startEdit(row)}
                    onDelete={() => deleteLedger.mutate(row.id)}
                    onSettle={() => markSettled(row)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Side rankings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <RankingCard title="類別花費排行" rows={topCategorySpend} emptyText="本月尚無支出分類" />
          <UpcomingPayments recurringRows={recurringRows} accountName={accountName} />
        </div>
      </div>`;

const newJsx = `return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{monthLabel}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
            Cash Flow
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn" onClick={() => toast.info("即將支援全螢幕分類管理")}><Tag size={14}/>分類</button>
          
          <div style={{ position: "relative" }}>
            <input 
              type="month" 
              className="ns-input" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
              style={{ padding: "6px 10px", fontSize: 13, minWidth: 120, height: "100%" }}
            />
          </div>

          <div style={{ position: "relative" }}>
            <select
              className="ns-input"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ appearance: "none", paddingRight: 28, height: "100%", fontSize: 13 }}
            >
              <option value="all">All accounts · All cats</option>
              {accountRows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <CaretDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ns-muted)" }} />
          </div>

          <button className="ns-btn primary" onClick={() => openCreate("expense")}>
            <Plus size={14} weight="bold" />記一筆
          </button>
        </div>
      </div>

      {/* Top summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="ns-card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Net this month</div>
              <div className={"ns-num-lg " + (monthNet >= 0 ? "pos" : "neg")}>
                {monthNet >= 0 ? "+" : "−"}NT\${formatNumber(Math.abs(monthNet))}
              </div>
            </div>
            <div style={{ flex: 1 }}/>
            <div style={{ display: "flex", gap: 18, fontSize: 12 }}>
              <div>
                <div className="muted">Income</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT\${formatNumber(monthIncome)}</div>
              </div>
              <div>
                <div className="muted">Spending</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT\${formatNumber(monthExpense)}</div>
              </div>
              <div>
                <div className="muted">Savings rate</div>
                <div className={"num " + (monthIncome > 0 ? "pos" : "muted")} style={{ fontSize: 18, fontWeight: 500 }}>
                  {monthIncome > 0 ? ((monthNet / monthIncome) * 100).toFixed(1) + "%" : "0%"}
                </div>
              </div>
            </div>
          </div>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyNetData}>
                <Tooltip 
                  cursor={{ fill: "var(--ns-bg-hover)" }}
                  contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any) => [\`NT\$\${formatNumber(Math.abs(v as number))}\`, "Net"]}
                  labelFormatter={(v) => \`\${monthLabel} / \${v}\`}
                />
                <Bar dataKey="net" radius={[2, 2, 2, 2]}>
                  {dailyNetData.map((entry, index) => (
                    <Cell key={\`cell-\${index}\`} fill={entry.net >= 0 ? "var(--ns-pos)" : "var(--ns-neg)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="dim mono" style={{ fontSize: 10.5, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span>1號</span><span>15號</span><span>月底</span>
          </div>
        </div>

        <div className="ns-card flex flex-col justify-between">
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="ns-eyebrow">By category · {monthLabel}</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {topCategorySpend.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>本月尚無支出分類</div>
              ) : (
                topCategorySpend.map((r, idx) => {
                  const max = topCategorySpend[0].amount;
                  const ratio = r.amount / max;
                  const colors = ["var(--ns-chart-3)", "var(--ns-chart-4)", "var(--ns-chart-5)", "var(--ns-chart-2)", "var(--ns-fg-dim)"];
                  const color = colors[idx % colors.length];
                  return (
                    <div key={r.name} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px", gap: 10, alignItems: "center", fontSize: 12.5 }}>
                      <span className="truncate">{r.name}</span>
                      <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                        <div style={{ width: (ratio * 100) + "%", height: "100%", background: color, borderRadius: 99 }}/>
                      </div>
                      <span className="num" style={{ textAlign: "right" }}>NT\${formatNumber(r.amount)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {/* Export / Import utility moved here */}
          <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: "var(--ns-border)" }}>
             <button className="ns-btn w-full justify-center" onClick={() => downloadCsv("northstar-ledger.csv", exportLedgerCsv(ledgerRows, accountName))}>
               <DownloadSimple size={14} />匯出
             </button>
             <label className="w-full">
               <input className="hidden" type="file" accept=".csv,text/csv" onChange={handleCsv} />
               <span className="ns-btn w-full justify-center" style={{ cursor: "pointer" }}><UploadSimple size={14} />匯入</span>
             </label>
          </div>
        </div>
      </div>

      {preview ? (
        <div className="ns-card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid
          </div>
          {preview.invalid.map((item) => (
            <div key={item.row} style={{ fontSize: 13, color: "var(--ns-neg)" }}>Row {item.row}: {item.reason}</div>
          ))}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              className="ns-btn primary"
              onClick={async () => {
                const rows = preview.valid.map((item) => item.value);
                await importLedger.mutateAsync(rows);
                rememberMerchantNames(rows.map((row) => row.merchant));
                setPreview(null);
                toast.success(\`成功匯入 \${rows.length} 筆資料\`);
              }}
            >
              確認匯入
            </button>
            <button className="ns-btn" onClick={() => setPreview(null)}>取消</button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
        {/* Transactions grouped by day */}
        <div className="ns-card" style={{ padding: 0 }}>
           <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--ns-border)" }}>
             <span style={{ fontWeight: 600, fontSize: 15 }}>Recent activity</span>
             <a className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>{monthRows.length} events</a>
           </div>

           {dayGroups.length === 0 ? (
            <div style={{ padding: "56px 20px", textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Receipt size={24} weight="duotone" />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒有記帳資料</div>
              <button className="ns-btn primary" onClick={() => openCreate("expense")}><Plus size={14} weight="bold" />新增交易</button>
            </div>
           ) : (
            dayGroups.map((g, gi) => (
              <div key={g.date}>
                <div style={{
                  padding: "14px 22px", borderBottom: "1px solid var(--ns-border)",
                  borderTop: gi === 0 ? "none" : "none",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--ns-bg-elev)",
                }}>
                  <span className="ns-eyebrow">{g.date}</span>
                  <span className="dim mono" style={{ fontSize: 11 }}>
                    Net <span className={g.net >= 0 ? "pos" : "neg"}>
                      {(g.net >= 0 ? "+" : "−")}NT\${formatNumber(Math.abs(g.net))}
                    </span>
                  </span>
                </div>
                {g.rows.map((r, i) => (
                  <LedgerRow
                    key={r.id}
                    row={r}
                    accountName={accountName}
                    onEdit={() => startEdit(r)}
                    onDelete={() => handleDelete(r.id)}
                    onSettle={() => markSettled(r)}
                  />
                ))}
              </div>
            ))
           )}
        </div>

        {/* Side rankings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <RankingCard title="商家花費排行" rows={topMerchantSpend} emptyText="本月尚無商家資料" />
          <UpcomingPayments recurringRows={recurringRows} accountName={accountName} />
        </div>
      </div>`;

content = content.replace(originalJsx, newJsx);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully updated CashFlowRoute.tsx');
