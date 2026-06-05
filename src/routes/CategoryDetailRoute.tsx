import { CaretLeft, DownloadSimple, FolderSimple, PencilSimple, Tag } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";
import { TransactionDetailPanel } from "../components/TransactionDetailPanel";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { convertCurrency, formatMoney, type CategoryGroup, type LedgerTransaction } from "../domain";
import { Glyph } from "../lib/icons";

type MonthPoint = { key: string; label: string; amount: number; partial: boolean };

export function CategoryDetailRoute() {
  const { categoryName } = useParams({ strict: false }) as { categoryName: string };
  const { ledger, settings, accounts, dailyFxRates } = useFinanceData();
  const [detailRow, setDetailRow] = useState<LedgerTransaction | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  const ledgerRows = ledger.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const fxHistory = dailyFxRates.data ?? [];
  const accountRows = accounts.data ?? [];
  const now = new Date();
  const year = now.getFullYear().toString();

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

  function convertedAmount(row: LedgerTransaction) {
    return convertCurrency(Math.abs(row.amount), row.currency, primaryCurrency, appSettings, {
      dailyRates: fxHistory,
      asOfDate: row.date,
    });
  }

  const rows = useMemo(
    () =>
      ledgerRows
        .filter((row) => row.category === categoryName && row.entryType === "expense" && row.settlementStatus === "settled")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [ledgerRows, categoryName],
  );

  const visibleRows = useMemo(
    () => rows.filter((row) => subcategoryFilter === "all" || (row.subcategory || "其他") === subcategoryFilter),
    [rows, subcategoryFilter],
  );

  const ytdRows = rows.filter((row) => row.date.startsWith(year));
  const ytdVisibleRows = visibleRows.filter((row) => row.date.startsWith(year));
  const ytdTotal = ytdRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const filteredTotal = ytdVisibleRows.reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const currentMonth = now.getMonth() + 1;
  const monthlyAverage = currentMonth > 0 ? ytdTotal / currentMonth : ytdTotal;
  const allYtdExpense = ledgerRows
    .filter((row) => row.entryType === "expense" && row.settlementStatus === "settled" && row.date.startsWith(year))
    .reduce((sum, row) => sum + (convertCurrency(Math.abs(row.amount), row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }) ?? 0), 0);
  const share = allYtdExpense > 0 ? (ytdTotal / allYtdExpense) * 100 : 0;

  const previousYearTotal = rows
    .filter((row) => row.date.startsWith(String(Number(year) - 1)))
    .reduce((sum, row) => sum + (convertedAmount(row) ?? 0), 0);
  const yoy = previousYearTotal > 0 ? ((ytdTotal - previousYearTotal) / previousYearTotal) * 100 : null;

  const monthlyData = useMemo(() => buildMonthPoints(rows, convertedAmount), [rows, appSettings, fxHistory, primaryCurrency]);
  const subcategoryData = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const row of ytdRows) {
      const key = row.subcategory || "其他";
      const current = map.get(key) ?? { amount: 0, count: 0 };
      current.amount += convertedAmount(row) ?? 0;
      current.count += 1;
      map.set(key, current);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, ...value, pct: ytdTotal > 0 ? (value.amount / ytdTotal) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [ytdRows, ytdTotal, appSettings, fxHistory, primaryCurrency]);

  const weekdayData = useMemo(() => buildWeekdayData(ytdRows), [ytdRows]);
  const peakWeekday = weekdayData.reduce((best, item) => (item.count > best.count ? item : best), weekdayData[0]);
  const topMerchants = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const row of ytdRows) {
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
  }, [ytdRows, appSettings, fxHistory, primaryCurrency]);

  const maxTransaction = ytdRows.reduce((max, row) => Math.max(max, convertedAmount(row) ?? 0), 0);
  const accountsUsed = new Set(ytdRows.map((row) => row.accountId)).size;
  const avgPerTransaction = ytdRows.length ? ytdTotal / ytdRows.length : 0;

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
          <Button variant="outline" onClick={() => setCategoryDrawerOpen(true)}>
            <PencilSimple size={14} />管理分類
          </Button>
          <Button variant="outline" disabled title="CSV 匯出尚未接上分類詳情範圍">
            <DownloadSimple size={14} />Export
          </Button>
        </div>
      </div>

      <div className="ns-metric-strip">
        <InsightTile label="YTD 總支出" value={formatMoney(ytdTotal, primaryCurrency)} tone="accent" />
        <InsightTile label="交易筆數" value={`${ytdRows.length} 筆`} />
        <InsightTile label="月均支出" value={formatMoney(monthlyAverage, primaryCurrency)} />
        <InsightTile label="佔總支出" value={`${share.toFixed(1)}%`} />
      </div>

      <div className="ns-detail-grid">
        <div className="ns-detail-main">
          <Panel eyebrow="Monthly trend" title="近 6 個月支出">
            <MiniBars data={monthlyData} color={color} currency={primaryCurrency} />
          </Panel>

          <Panel eyebrow="Sub-category breakdown" title="各子分類佔比">
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
              <EmptyPanel icon={<FolderSimple size={22} />} text="這個分類尚未累積今年支出。" />
            )}
          </Panel>
        </div>

        <div className="ns-detail-side">
          <Panel eyebrow="Statistics" title="統計">
            <InfoList
              rows={[
                ["每筆均消", formatMoney(avgPerTransaction, primaryCurrency)],
                ["最高單筆", formatMoney(maxTransaction, primaryCurrency)],
                ["YTD vs 去年同期", yoy === null ? "資料不足" : `${yoy >= 0 ? "↑ +" : "↓ "}${yoy.toFixed(1)}%`],
                ["使用帳戶數", `${accountsUsed} 個帳戶`],
              ]}
            />
          </Panel>

          <Panel eyebrow="Day-of-week pattern" title={peakWeekday ? `高峰：${peakWeekday.name}曜日` : "星期分佈"}>
            <WeekdayBars data={weekdayData} />
          </Panel>

          <Panel eyebrow="Top merchants" title="此分類的商家">
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
        title="Transactions"
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
                  <th>Date</th>
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
                    <td className="num text-right neg">−{formatMoney(Math.abs(row.amount), row.currency)}</td>
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
                <span className="num neg">−{formatMoney(Math.abs(row.amount), row.currency)}</span>
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

function MiniBars({ data, color, currency }: { data: MonthPoint[]; color: string; currency: string }) {
  const max = Math.max(1, ...data.map((item) => item.amount));
  return (
    <div className="ns-mini-bars">
      {data.map((item) => (
        <div key={item.key} className="ns-mini-bar-cell" title={`${item.key}: ${formatMoney(item.amount, currency)}`}>
          <div
            className="ns-mini-bar"
            data-partial={item.partial || undefined}
            style={{ height: `${Math.max(6, (item.amount / max) * 112)}px`, background: color }}
          />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function WeekdayBars({ data }: { data: Array<{ key: number; name: string; count: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="ns-weekday-bars">
      {data.map((item) => (
        <div key={item.key} className="ns-weekday-cell" data-peak={item.count === max && item.count > 0 || undefined}>
          <div style={{ height: `${Math.max(4, (item.count / max) * 54)}px` }} />
          <span>{item.name}</span>
        </div>
      ))}
    </div>
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

function buildWeekdayData(rows: LedgerTransaction[]) {
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  const counts = new Map<number, number>();
  for (const row of rows) {
    const day = new Date(row.date).getDay();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [1, 2, 3, 4, 5, 6, 0].map((key) => ({ key, name: names[key], count: counts.get(key) ?? 0 }));
}

function breakdownColor(index: number, fallback: string) {
  return [fallback, "var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)", "var(--ns-fg-dim)"][index] ?? "var(--ns-fg-dim)";
}
