import { CaretLeft, DownloadSimple, FolderSimple, PencilSimple, Tag } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { DateScopeControl } from "../components/DateScopeControl";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";
import { MiniBars, WeekdayBars, type MonthPoint } from "../components/DetailCharts";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { convertCurrency, formatMoney, isWithinDateScope, makeDefaultDateScope, resolveDateScope, type CategoryGroup, type LedgerTransaction } from "../domain";
import { Glyph } from "../lib/icons";
import { useUiPreferences } from "../state/uiPreferences";

export function CategoryDetailRoute() {
  const { categoryName } = useParams({ strict: false }) as { categoryName: string };
  const { ledger, settings, accounts, dailyFxRates } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [dateScope, setDateScope] = useState(() => makeDefaultDateScope(timezone, "ytd"));
  const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);

  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const fxHistory = dailyFxRates.data ?? [];
  const accountRows = accounts.data ?? [];

  const updateSettingsMutation = useRepositoryMutation(
    (repository, categories: CategoryGroup[]) => {
      const current = appSettings;
      if (!current) throw new Error("找不到設定資料。");
      return repository.updateAppSettings({ ...current, categories });
    },
    ["settings", "ledger"],
  );

  const accountName = (id: string) => accountRows.find((account) => account.id === id)?.name ?? id;
  const category = appSettings?.categories?.find((item) => item.name === categoryName);
  const color = category?.color ?? "var(--ns-accent)";
  const icon = category?.iconName ?? "Tag";
  const children = category?.children ?? [];

  // Signed spend (−amount): normal expenses are negative → positive spend; a
  // refund (positive-amount expense) nets back out of the category total.
  function convertedAmount(row: LedgerTransaction) {
    return convertCurrency(-row.amount, row.currency, primaryCurrency, appSettings, {
      dailyRates: fxHistory,
      asOfDate: row.date,
    });
  }

  const rows = useMemo(
    () =>
      ledgerRows
        .filter((row) => row.category === categoryName && row.entryType === "expense" && row.settlementStatus === "settled" && !row.counterAccountId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows, categoryName],
  );

  const visibleRows = useMemo(
    () => rows.filter((row) => isWithinDateScope(row.date, dateRange) && (subcategoryFilter === "all" || (row.subcategory || "其他") === subcategoryFilter)),
    [rows, dateRange, subcategoryFilter],
  );

  const periodRows = rows.filter((row) => isWithinDateScope(row.date, dateRange));
  const periodTotal = periodRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const filteredTotal = visibleRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const monthlyAverage = periodTotal / Math.max(1, countMonthsInRange(dateRange.start, dateRange.end));
  const allPeriodExpense = ledgerRows
    .filter((row) => row.entryType === "expense" && row.settlementStatus === "settled" && !row.counterAccountId && isWithinDateScope(row.date, dateRange))
    .reduce((sum, row) => sum + (convertCurrency(-row.amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }) ?? 0), 0);
  const share = allPeriodExpense > 0 ? (periodTotal / allPeriodExpense) * 100 : 0;

  const previousYearRange = dateRange.start && dateRange.end ? { start: shiftYear(dateRange.start, -1), end: shiftYear(dateRange.end, -1) } : null;
  const previousYearTotal = previousYearRange
    ? rows
        .filter((row) => row.date.slice(0, 10) >= previousYearRange.start && row.date.slice(0, 10) <= previousYearRange.end)
        .reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0)
    : 0;
  const yoy = previousYearTotal > 0 ? ((periodTotal - previousYearTotal) / previousYearTotal) * 100 : null;

  const monthlyData = useMemo(() => buildMonthPoints(rows, convertedAmount), [rows, appSettings, fxHistory, primaryCurrency]);
  const subcategoryData = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const row of periodRows) {
      const key = row.subcategory || "其他";
      const current = map.get(key) ?? { amount: 0, count: 0 };
      current.amount += convertedAmount(row) ?? 0;
      current.count += 1;
      map.set(key, current);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value, pct: periodTotal > 0 ? (value.amount / periodTotal) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [periodRows, periodTotal, appSettings, fxHistory, primaryCurrency]);

  const weekdayData = useMemo(() => buildWeekdayData(periodRows, convertedAmount), [periodRows, appSettings, fxHistory, primaryCurrency]);
  const peakWeekday = weekdayData.reduce((best, item) => (item.amount > best.amount ? item : best), weekdayData[0]);
  const topMerchants = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const row of periodRows) {
      const merchant = row.merchant || "未指定商家";
      const current = map.get(merchant) ?? { amount: 0, count: 0 };
      current.amount += convertedAmount(row) ?? 0;
      current.count += 1;
      map.set(merchant, current);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [periodRows, appSettings, fxHistory, primaryCurrency]);

  const maxTransaction = periodRows.reduce((max, row) => Math.max(max, convertedAmount(row) ?? 0), 0);
  const accountsUsed = new Set(periodRows.map((row) => row.accountId)).size;
  const avgPerTransaction = periodRows.length ? periodTotal / periodRows.length : 0;

  return (
    <div className="ns-detail-page">
      <div className="ns-detail-header">
        <div className="min-w-0">
          <Button variant="ghost" render={<Link to="/cash-flow" />} className="mb-2">
            <CaretLeft size={14} />返回記帳
          </Button>
          <div className="ns-detail-title-row">
            <div className="ns-detail-marker" style={{ background: color }}>
              <Glyph name={icon} size={26} color="var(--ns-accent-fg)" />
            </div>
            <div className="min-w-0">
              <div className="ns-eyebrow">Cash Flow / 分類</div>
              <h1 className="ns-detail-title">{categoryName}</h1>
              {children.length ? (
                <div className="ns-pill-row">
                  {children.map((child, index) => (
                    <button
                      key={child}
                      type="button"
                      className="ns-filter-pill"
                      data-active={subcategoryFilter === child || undefined}
                      style={{ "--pill-accent": index === 0 ? color : undefined } as CSSProperties}
                      onClick={() => setSubcategoryFilter(child)}
                    >
                      {child}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ns-detail-actions">
          <DateScopeControl value={dateScope} onChange={setDateScope} />
          <Button variant="outline" onClick={() => setCategoryDrawerOpen(true)}>
            <PencilSimple size={14} />管理分類
          </Button>
          <Button variant="outline" disabled title="CSV 匯出尚未接上分類詳情範圍">
            <DownloadSimple size={14} />匯出
          </Button>
        </div>
      </div>

      <div className="ns-metric-strip">
        <InsightTile label={`${dateRange.label} 總支出`} value={formatMoney(periodTotal, primaryCurrency)} tone="accent" />
        <InsightTile label="交易筆數" value={`${periodRows.length} 筆`} />
        <InsightTile label="月均支出" value={formatMoney(monthlyAverage, primaryCurrency)} />
        <InsightTile label="佔總支出" value={`${share.toFixed(1)}%`} />
      </div>

      <div className="ns-detail-grid">
        <div className="ns-detail-main">
          <Panel eyebrow="月支出趨勢" title="近 6 個月支出">
            <MiniBars data={monthlyData} color={color} currency={primaryCurrency} />
          </Panel>

          <Panel eyebrow="子分類拆解" title="各子分類佔比">
            {subcategoryData.length ? (
              <div className="ns-breakdown-list">
                {subcategoryData.map((item, index) => (
                  <div key={item.name} className="ns-breakdown-row">
                    <div className="ns-breakdown-head">
                      <span>{item.name}</span>
                      <span className="num">{item.pct.toFixed(1)}%</span>
                      <span className="num">−{formatMoney(item.amount, primaryCurrency)}</span>
                    </div>
                    <div className="ns-breakdown-track">
                      <div
                        className="ns-breakdown-fill"
                        style={{ width: `${item.pct}%`, background: breakdownColor(index, color) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={<FolderSimple size={22} />} text="這個分類在此期間尚無支出。" />
            )}
          </Panel>

          <Panel eyebrow="星期分佈" title={peakWeekday ? `高峰：星期${peakWeekday.name}` : "星期分佈"}>
            <WeekdayBars data={weekdayData} currency={primaryCurrency} />
          </Panel>
        </div>

        <div className="ns-detail-side">
          <Panel eyebrow="統計" title="統計">
            <InfoList
              rows={[
                ["每筆均消", formatMoney(avgPerTransaction, primaryCurrency)],
                ["最高單筆", formatMoney(maxTransaction, primaryCurrency)],
                ["去年同期間", yoy === null ? "資料不足" : `${yoy >= 0 ? "↑ +" : "↓ "}${yoy.toFixed(1)}%`],
                ["使用帳戶數", `${accountsUsed} 個帳戶`],
              ]}
            />
          </Panel>

          <Panel eyebrow="商家排行" title="此分類的商家">
            {topMerchants.length ? (
              <div className="ns-compact-list">
                {topMerchants.map((merchant) => (
                  <Link
                    key={merchant.name}
                    to="/cash-flow/merchants/$merchantName"
                    params={{ merchantName: merchant.name }}
                    className="ns-compact-row"
                  >
                    <Initials name={merchant.name} />
                    <span className="min-w-0">
                      <span className="truncate font-medium">{merchant.name}</span>
                      <span className="muted text-xs">{merchant.count} 次</span>
                    </span>
                    <span className="num ml-auto">−{formatMoney(merchant.amount, primaryCurrency)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={<Tag size={22} />} text="尚無商家資料。" />
            )}
          </Panel>
        </div>
      </div>

      <TransactionsPanel
        title="交易紀錄"
        rows={visibleRows}
        total={filteredTotal}
        primaryCurrency={primaryCurrency}
        accountName={accountName}
        onSelect={setDetailRow}
        activeFilter={subcategoryFilter}
        filters={children}
        onFilter={setSubcategoryFilter}
      />

      <TransactionDetailPanel
        row={detailRow}
        onClose={() => setDetailRow(null)}
        accountName={accountName}
        onEdit={() => {}}
        onDelete={() => {}}
      />

      <CategoryManagementDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={appSettings?.categories || []}
        onSave={async (categories) => {
          await updateSettingsMutation.mutateAsync(categories);
        }}
      />
    </div>
  );
}

function TransactionsPanel({
  title,
  rows,
  total,
  primaryCurrency,
  accountName,
  onSelect,
  activeFilter,
  filters,
  onFilter,
}: {
  title: string;
  rows: LedgerTransaction[];
  total: number;
  primaryCurrency: string;
  accountName: (id: string) => string;
  onSelect: (row: LedgerTransaction) => void;
  activeFilter: string;
  filters: string[];
  onFilter: (value: string) => void;
}) {
  return (
    <Card className="ns-transactions-card">
      <div className="ns-section-head">
        <div>
          <div className="ns-eyebrow">{title}</div>
          <h2>{rows.length} 筆 · {formatMoney(total, primaryCurrency)}</h2>
        </div>
        <div className="ns-pill-row">
          <button type="button" className="ns-filter-pill" data-active={activeFilter === "all" || undefined} onClick={() => onFilter("all")}>全部</button>
          {filters.map((filter) => (
            <button key={filter} type="button" className="ns-filter-pill" data-active={activeFilter === filter || undefined} onClick={() => onFilter(filter)}>
              {filter}
            </button>
          ))}
        </div>
      </div>

      {rows.length ? (
        <>
          <div className="ns-detail-table-wrap">
            <table className="ns-detail-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>名稱</th>
                  <th>子分類</th>
                  <th>帳戶</th>
                  <th className="text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => onSelect(row)}>
                    <td className="mono muted">{row.date.slice(5, 10)}</td>
                    <td>{row.name || row.merchant || "未命名交易"}</td>
                    <td className="muted">{row.subcategory || "其他"}</td>
                    <td className="muted">{accountName(row.accountId)}</td>
                    <td className={`num text-right ${row.amount > 0 ? "pos" : "neg"}`}>{row.amount > 0 ? "+" : "−"}{formatMoney(Math.abs(row.amount), row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ns-mobile-transaction-list">
            {rows.map((row) => (
              <button key={row.id} type="button" className="ns-mobile-transaction-row" onClick={() => onSelect(row)}>
                <span className="mono muted">{row.date.slice(5, 10)}</span>
                <span className="truncate">{row.name || row.merchant || "未命名交易"}</span>
                <span className={`num ${row.amount > 0 ? "pos" : "neg"}`}>{row.amount > 0 ? "+" : "−"}{formatMoney(Math.abs(row.amount), row.currency)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <EmptyPanel icon={<Tag size={22} />} text="沒有符合篩選的交易。" />
      )}
    </Card>
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

function Initials({ name }: { name: string }) {
  return <span className="ns-initials">{name.slice(0, 2).toUpperCase()}</span>;
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

function shiftYear(date: string, delta: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setFullYear(next.getFullYear() + delta);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function countMonthsInRange(start: string | null, end: string | null) {
  if (!start || !end) return 12;
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
}

function buildWeekdayData(rows: LedgerTransaction[], amountFor: (row: LedgerTransaction) => number | null) {
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  const amounts = new Map<number, number>();
  for (const row of rows) {
    const day = new Date(row.date).getDay();
    amounts.set(day, (amounts.get(day) ?? 0) + (amountFor(row) ?? 0));
  }
  return [1, 2, 3, 4, 5, 6, 0].map((key) => ({ key, name: names[key], amount: amounts.get(key) ?? 0 }));
}

function breakdownColor(index: number, fallback: string) {
  return [fallback, "var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)", "var(--ns-fg-dim)"][index] ?? "var(--ns-fg-dim)";
}
