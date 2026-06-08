import { CaretLeft, DownloadSimple, PencilSimple, Sparkle, Tag } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { DateScopeControl } from "../components/DateScopeControl";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";
import { MiniBars, WeekdayBars, type MonthPoint } from "../components/DetailCharts";
import { useFinanceData } from "../data/hooks";
import { convertCurrency, formatMoney, isWithinDateScope, makeDefaultDateScope, resolveDateScope, type LedgerTransaction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

export function MerchantDetailRoute() {
  const { merchantName } = useParams({ strict: false }) as { merchantName: string };
  const { ledger, accounts, settings, dailyFxRates } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "ytd"));
  const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);

  const ledgerRows = ledger.data ?? [];
  const accountRows = accounts.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const fxHistory = dailyFxRates.data ?? [];
  const accountName = (id: string) => accountRows.find((account) => account.id === id)?.name ?? id;

  const rows = useMemo(
    () =>
      ledgerRows
        .filter((row) => row.merchant === merchantName && row.entryType === "expense" && row.settlementStatus === "settled" && !row.counterAccountId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows, merchantName],
  );

  function convertedAmount(row: LedgerTransaction) {
    return convertCurrency(Math.abs(row.amount), row.currency, primaryCurrency, appSettings, {
      dailyRates: fxHistory,
      asOfDate: row.date,
    });
  }

  const periodRows = rows.filter((row) => isWithinDateScope(row.date, dateRange));
  const categoryHit = mostCommon(periodRows.map((row) => row.category).filter(Boolean));
  const subcategoryHit = mostCommon(periodRows.map((row) => row.subcategory).filter(Boolean));
  const categorySetting = appSettings?.categories.find((category) => category.name === categoryHit.value);
  const categoryColor = categorySetting?.color ?? "var(--ns-accent)";
  const filterOptions = [...new Set(rows.map((row) => row.subcategory || row.category).filter(Boolean))];
  const visibleRows = periodRows.filter((row) => subcategoryFilter === "all" || row.subcategory === subcategoryFilter || row.category === subcategoryFilter);
  const periodTotal = periodRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const filteredTotal = visibleRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const avgPerVisit = periodRows.length ? periodTotal / periodRows.length : 0;
  const monthlyAverage = periodTotal / Math.max(1, countMonthsInRange(dateRange.start, dateRange.end));
  const monthlyData = useMemo(() => buildMonthPoints(rows, convertedAmount), [rows, appSettings, fxHistory, primaryCurrency]);
  const weekdayData = useMemo(() => buildWeekdayData(periodRows), [periodRows]);
  const peakWeekday = weekdayData.reduce((best, item) => (item.count > best.count ? item : best), weekdayData[0]);
  const lastVisit = periodRows[0]?.date ?? rows[0]?.date ?? "—";
  const accountNames = [...new Set(periodRows.map((row) => accountName(row.accountId)))];

  const relatedMerchants = useMemo(() => {
    if (!categoryHit.value) return [];
    const map = new Map<string, { amount: number; count: number }>();
    for (const row of ledgerRows) {
      if (row.merchant === merchantName || row.entryType !== "expense" || row.settlementStatus !== "settled" || row.category !== categoryHit.value || !row.merchant || !isWithinDateScope(row.date, dateRange)) continue;
      const current = map.get(row.merchant) ?? { amount: 0, count: 0 };
      current.amount += convertCurrency(Math.abs(row.amount), row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }) ?? 0;
      current.count += 1;
      map.set(row.merchant, current);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [ledgerRows, merchantName, categoryHit.value, dateRange, appSettings, fxHistory, primaryCurrency]);

  return (
    <div className="ns-detail-page">
      <div className="ns-detail-header">
        <div className="min-w-0">
          <Button variant="ghost" render={<Link to="/cash-flow" />} className="mb-2">
            <CaretLeft size={14} />返回記帳
          </Button>
          <div className="ns-detail-title-row">
            <Initials name={merchantName} color={categoryColor} large />
            <div className="min-w-0">
              <div className="ns-eyebrow">記帳 / 商家</div>
              <h1 className="ns-detail-title">{merchantName}</h1>
              <div className="ns-pill-row">
                {categoryHit.value ? <span className="ns-filter-pill" data-active>{categoryHit.value}</span> : null}
                {subcategoryHit.value ? <span className="ns-filter-pill">{subcategoryHit.value}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <div className="ns-detail-actions">
          <DateScopeControl value={dateScope} onChange={setDateScope} />
          <Button variant="outline" disabled title="商家重新命名目前仍在管理流程中處理">
            <PencilSimple size={14} />重新命名
          </Button>
          <Button variant="outline" disabled title="CSV 匯出尚未接上商家詳情範圍">
            <DownloadSimple size={14} />匯出
          </Button>
        </div>
      </div>

      <div className="ns-metric-strip">
        <InsightTile label={`${dateRange.label} 支出`} value={formatMoney(periodTotal, primaryCurrency)} tone="accent" />
        <InsightTile label="消費次數" value={`${periodRows.length} 次`} />
        <InsightTile label="每次均值" value={formatMoney(avgPerVisit, primaryCurrency)} />
        <InsightTile label="月均支出" value={formatMoney(monthlyAverage, primaryCurrency)} />
      </div>

      <div className="ns-detail-grid">
        <div className="ns-detail-main">
          <Panel eyebrow="支出趨勢" title="月支出 · 近 6 個月">
            <MiniBars data={monthlyData} color={categoryColor} currency={primaryCurrency} />
          </Panel>

          <Panel eyebrow="消費模式" title={peakWeekday ? `${peakWeekday.name}曜日 最頻繁` : "星期分佈"}>
            <WeekdayBars data={weekdayData} />
          </Panel>

          <Panel eyebrow="交易紀錄" title={`${visibleRows.length} 筆交易紀錄`}>
            <div className="ns-pill-row ns-transaction-filter-row">
              <button type="button" className="ns-filter-pill" data-active={subcategoryFilter === "all" || undefined} onClick={() => setSubcategoryFilter("all")}>全部</button>
              {filterOptions.map((filter) => (
                <button key={filter} type="button" className="ns-filter-pill" data-active={subcategoryFilter === filter || undefined} onClick={() => setSubcategoryFilter(filter)}>
                  {filter}
                </button>
              ))}
            </div>
            <TransactionRows rows={visibleRows} total={filteredTotal} accountName={accountName} primaryCurrency={primaryCurrency} onSelect={setDetailRow} />
          </Panel>
        </div>

        <div className="ns-detail-side">
          <Panel eyebrow="自動分類" title="自動分類">
            {categoryHit.value ? (
              <div className="ns-rule-hint">
                <Sparkle size={18} />
                <div>
                  <strong>已根據歷史交易推導</strong>
                  <span>{merchantName.toUpperCase()} → {categoryHit.value}{subcategoryHit.value ? ` › ${subcategoryHit.value}` : ""}</span>
                </div>
              </div>
            ) : (
              <EmptyPanel icon={<Tag size={22} />} text="交易不足，還無法推導常用分類。" />
            )}
          </Panel>

          <Panel eyebrow="統計" title="商家摘要">
            <InfoList
              rows={[
                ["最近消費", lastVisit],
                ["使用帳戶", accountNames.length ? accountNames.join("、") : "—"],
                ["分類命中率", categoryHit.total ? `${((categoryHit.count / categoryHit.total) * 100).toFixed(0)}%` : "—"],
              ]}
            />
          </Panel>

          <Panel eyebrow={`同類商家${categoryHit.value ? ` · ${categoryHit.value}` : ""}`} title="同類商家">
            {relatedMerchants.length ? (
              <div className="ns-compact-list">
                {relatedMerchants.map((merchant) => (
                  <Link key={merchant.name} to="/cash-flow/merchants/$merchantName" params={{ merchantName: merchant.name }} className="ns-compact-row">
                    <Initials name={merchant.name} />
                    <span className="min-w-0">
                      <span className="truncate font-medium">{merchant.name}</span>
                      <span className="muted text-xs">{merchant.count} 次</span>
                    </span>
                    <span className="num ml-auto">{formatMoney(merchant.amount, primaryCurrency)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={<Tag size={22} />} text="尚無同分類商家。" />
            )}
          </Panel>
        </div>
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

function TransactionRows({
  rows,
  total,
  accountName,
  primaryCurrency,
  onSelect,
}: {
  rows: LedgerTransaction[];
  total: number;
  accountName: (id: string) => string;
  primaryCurrency: string;
  onSelect: (row: LedgerTransaction) => void;
}) {
  if (!rows.length) return <EmptyPanel icon={<Tag size={22} />} text="沒有符合篩選的交易。" />;
  return (
    <>
      <div className="ns-detail-table-wrap">
        <table className="ns-detail-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>說明</th>
              <th>帳戶</th>
              <th className="text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} onClick={() => onSelect(row)}>
                <td className="mono muted">{row.date.slice(5, 10)}</td>
                <td>{row.name || row.merchant || "未命名交易"}</td>
                <td className="muted">{accountName(row.accountId)}</td>
                <td className="num text-right neg">−{formatMoney(Math.abs(row.amount), row.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>合計 · 顯示 {rows.length} 筆交易</td>
              <td className="num text-right neg">−{formatMoney(total, primaryCurrency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="ns-mobile-transaction-list">
        {rows.map((row) => (
          <button key={row.id} type="button" className="ns-mobile-transaction-row" onClick={() => onSelect(row)}>
            <span className="mono muted">{row.date.slice(5, 10)}</span>
            <span className="truncate">{row.name || row.merchant || "未命名交易"}</span>
            <span className="num neg">−{formatMoney(Math.abs(row.amount), row.currency)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <Card className="ns-analysis-panel">
      <div className="ns-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      {children}
    </Card>
  );
}

function InsightTile({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <Card className="ns-insight-tile">
      <div className="ns-eyebrow">{label}</div>
      <div className="num" data-tone={tone}>{value}</div>
    </Card>
  );
}

function InfoList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="ns-info-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="ns-empty-panel">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function Initials({ name, color, large }: { name: string; color?: string; large?: boolean }) {
  return (
    <span className={large ? "ns-initials ns-initials-lg" : "ns-initials"} style={{ background: color }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function buildMonthPoints(rows: LedgerTransaction[], amountFor: (row: LedgerTransaction) => number | null): MonthPoint[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = rows.filter((row) => row.date.startsWith(key)).reduce((sum, row) => sum + (amountFor(row) ?? 0), 0);
    return {
      key,
      label: `${date.getMonth() + 1}月`,
      amount,
      partial: index === 5,
    };
  });
}

function buildWeekdayData(rows: LedgerTransaction[]) {
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  const counts = new Map<number, number>();
  for (const row of rows) {
    const day = new Date(row.date).getDay();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [1, 2, 3, 4, 5, 6, 0].map((key) => ({ key, name: names[key], count: counts.get(key) ?? 0 }));
}

function countMonthsInRange(start: string | null, end: string | null) {
  if (!start || !end) return 12;
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = "";
  let count = 0;
  for (const [value, valueCount] of counts) {
    if (valueCount > count) {
      best = value;
      count = valueCount;
    }
  }
  return { value: best, count, total: values.length };
}
