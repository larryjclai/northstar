import { ArrowsClockwise, Bank, ChartLineUp, ListChecks, PencilSimple, PlusCircle, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Field, TextInput } from "../components/Field";
import { HoldingForm } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { PortfolioAssetDraft } from "../data/repositories";
import {
  buildHoldingPositionsByAccount,
  createFxConverter,
  formatMoney,
  formatNumber,
  formatPrice,
  formatQuantity,
  resolveAssetName,
  type Account,
  type DailyPrice,
  type HoldingPosition,
  type MarketQuote as DomainMarketQuote,
  type PortfolioAsset,
} from "../domain";
import { useRefreshDailyPrices, useRefreshQuotes } from "../features/market-data/useMarketRefresh";
import { useUiPreferences, type NameLocalePreference } from "../state/uiPreferences";
import { HoldingsAddSheet } from "./InvestmentsAddSheet";

type InvestmentTab = "accounts" | "performance" | "holdings";

const tabOptions: { value: InvestmentTab; label: string; icon: React.ReactNode }[] = [
  { value: "accounts", label: "帳戶", icon: <Bank size={16} weight="duotone" /> },
  { value: "performance", label: "績效", icon: <ChartLineUp size={16} weight="duotone" /> },
  { value: "holdings", label: "持倉", icon: <ListChecks size={16} weight="duotone" /> },
];

export function InvestmentsRoute() {
  const [tab, setTab] = useState<InvestmentTab>("holdings");

  const { accounts, assets, investments, quotes, settings, dailyFxRates, dailyPrices } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const refreshDailyPrices = useRefreshDailyPrices();
  const nameLocale = useUiPreferences((state) => state.nameLocale);

  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const quoteRows = quotes.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);

  const quoteMap = useMemo(() => {
    const map: Record<string, DomainMarketQuote | undefined> = {};
    for (const quote of quoteRows) {
      map[quote.symbol.toUpperCase()] = {
        symbol: quote.symbol,
        price: quote.price,
        currency: quote.currency,
      };
    }
    return map;
  }, [quoteRows]);

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const investmentAccounts = useMemo(
    () => accountRows.filter((account) => account.type === "investment"),
    [accountRows],
  );

  const positions = useMemo(
    () => buildHoldingPositionsByAccount(assetRows, recordRows, quoteMap),
    [assetRows, recordRows, quoteMap],
  );

  const [statusMessage, setStatusMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function refreshLatestQuotes() {
    setStatusMessage("");
    const tickers = [...new Set(assetRows.map((asset) => asset.ticker.toUpperCase()).filter(Boolean))];
    if (tickers.length === 0) {
      setStatusMessage("尚無持倉可以更新報價。");
      return;
    }
    try {
      await refreshQuotes.mutateAsync(tickers);
      setStatusMessage("已更新最新報價。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "報價更新失敗。");
    }
  }

  function changeTab(next: InvestmentTab) {
    setTab(next);
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="投資" description="把帳戶、績效、持倉合而為一。每筆持倉都綁定券商，方便看出每家券商的損益。" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl value={tab} options={tabOptions} onChange={changeTab} />
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary" onClick={refreshLatestQuotes} disabled={refreshQuotes.isPending}>
            <ArrowsClockwise size={16} />{refreshQuotes.isPending ? "更新中" : "更新報價"}
          </ActionButton>
          <ActionButton onClick={() => setAddOpen(true)}>
            <PlusCircle size={16} />新增
          </ActionButton>
        </div>
      </div>

      {statusMessage ? <div className="mb-4"><StatusText>{statusMessage}</StatusText></div> : null}

      {tab === "accounts" ? (
        <AccountsTab
          accounts={investmentAccounts}
          positions={positions}
          primaryCurrency={primaryCurrency}
          toPrimary={toPrimary}
        />
      ) : null}
      {tab === "performance" ? (
        <PerformanceTab
          positions={positions}
          primaryCurrency={primaryCurrency}
          toPrimary={toPrimary}
          dailyPrices={dailyPriceRows}
          refreshing={refreshQuotes.isPending || refreshDailyPrices.isPending}
        />
      ) : null}
      {tab === "holdings" ? (
        <HoldingsTab
          positions={positions}
          accountMap={accountMap}
          accounts={investmentAccounts}
          nameLocale={nameLocale}
          assetsById={new Map(assetRows.map((asset) => [asset.id, asset]))}
        />
      ) : null}

      <HoldingsAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accountRows}
      />
    </div>
  );
}

function AccountsTab({
  accounts,
  positions,
  primaryCurrency,
  toPrimary,
}: {
  accounts: Account[];
  positions: HoldingPosition[];
  primaryCurrency: string;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
}) {
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<Bank size={24} weight="duotone" />}
        title="尚未設定券商帳戶"
        description="到「帳戶」分頁新增 Charles Schwab、Firstrade 等券商之後，這裡就會看到每家券商的持倉概況。"
      />
    );
  }

  const byAccount = new Map<string, HoldingPosition[]>();
  for (const position of positions) {
    const key = position.accountId ?? "__unassigned__";
    const existing = byAccount.get(key) ?? [];
    existing.push(position);
    byAccount.set(key, existing);
  }

  return (
    <div className="grid gap-4">
      {accounts.map((account) => {
        const accountPositions = byAccount.get(account.id) ?? [];
        const marketValue = accountPositions.reduce(
          (sum, position) => sum + toPrimary(position.marketValue, position.currency),
          0,
        );
        const costBasis = accountPositions.reduce(
          (sum, position) => sum + toPrimary(position.costBasis, position.currency),
          0,
        );
        const pnl = marketValue - costBasis;
        return (
          <Card key={account.id} title={account.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="text-sm" style={{ color: "var(--ns-muted)" }}>
                {account.type === "investment" ? "投資帳戶" : "存款帳戶"} · {account.currency}
              </div>
              <div className="tabular text-right">
                <div className="font-semibold">{formatMoney(marketValue, primaryCurrency)}</div>
                <div className="text-xs" style={{ color: pnl >= 0 ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)" }}>
                  損益 {pnl >= 0 ? "+" : ""}{formatNumber(pnl)} {primaryCurrency}
                </div>
              </div>
            </div>
            {accountPositions.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>
                此帳戶尚無持倉。
              </p>
            ) : (
              <div className="mt-4 grid gap-2 text-sm">
                {accountPositions.map((position) => (
                  <div key={`${position.assetId}-${position.accountId ?? "none"}`} className="flex justify-between gap-3">
                    <span>{position.ticker}</span>
                    <span className="tabular">
                      {formatQuantity(position.quantity)} × {formatPrice(position.marketPrice ?? position.averageCost)} {position.currency}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function PerformanceTab({
  positions,
  primaryCurrency,
  toPrimary,
  dailyPrices,
  refreshing,
}: {
  positions: HoldingPosition[];
  primaryCurrency: string;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  dailyPrices: DailyPrice[];
  refreshing: boolean;
}) {
  const [range, setRange] = useState<PerformanceRange>("1Y");
  const [customStart, setCustomStart] = useState(() => dateDaysAgo(365));
  const [customEnd, setCustomEnd] = useState(() => todayDate());

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<ChartLineUp size={24} weight="duotone" />}
        title="尚無績效資料"
        description="新增持倉或交易紀錄後，這裡會顯示彙整後的市值、成本與未實現損益。"
      />
    );
  }
  const totalValue = positions.reduce((sum, position) => sum + toPrimary(position.marketValue, position.currency), 0);
  const totalCost = positions.reduce((sum, position) => sum + toPrimary(position.costBasis, position.currency), 0);
  const totalPnL = totalValue - totalCost;
  const returnPct = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100;
  const trend = buildPerformanceTrend({
    positions,
    dailyPrices,
    toPrimary,
    range,
    customStart,
    customEnd,
  });

  return (
    <div className="grid gap-4">
      <Card title="總覽">
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCell label="市值" value={formatMoney(totalValue, primaryCurrency)} />
          <SummaryCell label="成本" value={formatMoney(totalCost, primaryCurrency)} />
          <SummaryCell
            label="未實現損益"
            value={`${totalPnL >= 0 ? "+" : ""}${formatNumber(totalPnL)} ${primaryCurrency} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%)`}
            tone={totalPnL >= 0 ? "positive" : "negative"}
          />
        </div>
        {refreshing ? (
          <div className="mt-3 text-xs" style={{ color: "var(--ns-muted)" }}>
            正在抓取最新報價…
          </div>
        ) : null}
      </Card>
      <Card
        title="績效趨勢"
        action={
          <div className="flex flex-wrap gap-2">
            <SegmentedControl
              value={range}
              onChange={setRange}
              options={performanceRangeOptions.map((option) => ({ value: option, label: option, icon: null }))}
            />
          </div>
        }
      >
        {range === "Custom" ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="開始">
              <TextInput type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            </Field>
            <Field label="結束">
              <TextInput type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </Field>
          </div>
        ) : null}
        {trend.length > 1 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="portfolioPerformance" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="var(--ns-muted)" minTickGap={24} />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), primaryCurrency)}
                  labelFormatter={(_, payload) => payload[0]?.payload?.date ?? ""}
                />
                <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#portfolioPerformance)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={<ChartLineUp size={24} weight="duotone" />}
            title="還沒有足夠的歷史股價"
            description="先用「更新報價」或在持倉頁回補 1Y / 5Y 歷史股價，這裡就會依所選區間畫出投資市值趨勢。"
          />
        )}
      </Card>
      <Card title="貢獻度（依市值）">
        <div className="space-y-3">
          {[...positions]
            .sort((a, b) => toPrimary(b.marketValue, b.currency) - toPrimary(a.marketValue, a.currency))
            .slice(0, 8)
            .map((position) => {
              const valueInBase = toPrimary(position.marketValue, position.currency);
              const ratio = totalValue === 0 ? 0 : valueInBase / totalValue;
              return (
                <div key={`${position.assetId}-${position.accountId ?? "none"}`} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{position.ticker}</span>
                    <span className="tabular">{(ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
                    <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: "var(--ns-accent)" }} />
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}

function HoldingsTab({
  positions,
  accountMap,
  accounts,
  nameLocale,
  assetsById,
}: {
  positions: HoldingPosition[];
  accountMap: Map<string, Account>;
  accounts: Account[];
  nameLocale: NameLocalePreference;
  assetsById: Map<string, PortfolioAsset>;
}) {
  const [editingAsset, setEditingAsset] = useState<PortfolioAsset | null>(null);
  const [editForm, setEditForm] = useState<PortfolioAssetDraft | null>(null);
  const [message, setMessage] = useState("");
  const updateHolding = useRepositoryMutation(
    (repository, input: PortfolioAssetDraft & { id: string }) => repository.updateManualHolding(input.id, input),
    ["assets"],
  );

  function startEdit(asset: PortfolioAsset) {
    setEditingAsset(asset);
    setEditForm({
      ticker: asset.ticker,
      name: asset.name,
      currency: asset.currency,
      totalQuantity: asset.totalQuantity,
      averageCost: asset.averageCost,
      acquisitionDate: asset.acquisitionDate ?? new Date().toISOString().slice(0, 10),
      accountId: asset.accountId,
    });
    setMessage("");
  }

  async function submitEdit() {
    if (!editingAsset || !editForm) return;
    setMessage("");
    try {
      if (editingAsset.holdingSource !== "manual") {
        throw new Error("交易計算的持倉請到交易明細調整。");
      }
      if (!editForm.accountId) throw new Error("請選擇券商 / 帳戶。");
      await updateHolding.mutateAsync({ ...editForm, id: editingAsset.id });
      setEditingAsset(null);
      setEditForm(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "持倉儲存失敗。");
    }
  }

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks size={24} weight="duotone" />}
        title="目前沒有持倉"
        description="點右上的「新增」按鈕，從券商開始記錄今天的部位或逐筆交易。"
      />
    );
  }

  const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue);

  return (
    <>
      <Card title={`持倉 (${positions.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
                <th className="py-2">Ticker</th>
                <th className="py-2">名稱</th>
                <th className="py-2">券商</th>
                <th className="py-2 text-right">股數</th>
                <th className="py-2 text-right">均價</th>
                <th className="py-2 text-right">現價</th>
                <th className="py-2 text-right">市值</th>
                <th className="py-2 text-right">損益</th>
                <th className="py-2 text-right">報酬率</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((position) => {
                const account = position.accountId ? accountMap.get(position.accountId) : null;
                const asset = assetsById.get(position.assetId) ?? null;
                const displayName = asset
                  ? resolveAssetName(asset, nameLocale)
                  : position.name;
                const pnlTone = position.unrealizedGain >= 0 ? "positive" : "negative";
                return (
                  <tr key={`${position.assetId}-${position.accountId ?? "none"}`} className="border-t" style={{ borderColor: "var(--ns-border)" }}>
                    <td className="py-3 font-semibold">{position.ticker}</td>
                    <td className="py-3">{displayName}</td>
                    <td className="py-3">{account ? account.name : "未指定"}</td>
                    <td className="py-3 text-right tabular">{formatQuantity(position.quantity)}</td>
                    <td className="py-3 text-right tabular">{formatPrice(position.averageCost)}</td>
                    <td className="py-3 text-right tabular">
                      {position.marketPrice !== null ? formatPrice(position.marketPrice) : "—"}
                    </td>
                    <td className="py-3 text-right tabular">
                      {formatNumber(position.marketValue)} <span style={{ color: "var(--ns-muted)" }}>{position.currency}</span>
                    </td>
                    <td
                      className="py-3 text-right tabular"
                      style={{ color: pnlTone === "positive" ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)" }}
                    >
                      {position.unrealizedGain >= 0 ? "+" : ""}{formatNumber(position.unrealizedGain)}
                    </td>
                    <td
                      className="py-3 text-right tabular"
                      style={{ color: pnlTone === "positive" ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)" }}
                    >
                      {position.unrealizedGainPercent >= 0 ? "+" : ""}{position.unrealizedGainPercent.toFixed(2)}%
                    </td>
                    <td className="py-3 text-right">
                      <ActionButton
                        variant="ghost"
                        onClick={() => asset ? startEdit(asset) : undefined}
                        disabled={!asset || asset.holdingSource !== "manual"}
                        title={asset?.holdingSource === "transactions" ? "交易計算持倉請到交易明細調整" : "編輯持倉"}
                      >
                        <PencilSimple size={16} />編輯
                      </ActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "var(--ns-muted)" }}>
          <Link to="/transactions">查看交易明細</Link>
        </div>
      </Card>
      {editingAsset && editForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setEditingAsset(null)}>
          <div
            className="w-full max-w-2xl rounded-lg border shadow-xl"
            style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
              <h2 className="text-lg font-semibold">編輯持倉</h2>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-4">
              <HoldingForm
                value={editForm}
                onChange={setEditForm}
                onSubmit={submitEdit}
                submitLabel={updateHolding.isPending ? "儲存中…" : "儲存持倉"}
                accounts={accounts}
              />
              {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SummaryCell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  const color = tone === "positive"
    ? "var(--ns-positive, var(--ns-accent))"
    : tone === "negative"
      ? "var(--ns-danger, #c0392b)"
      : "var(--ns-fg)";
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{label}</div>
      <div className="mt-1 tabular text-base font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

const performanceRangeOptions = ["1D", "1W", "1M", "1Y", "3Y", "Custom"] as const;
type PerformanceRange = typeof performanceRangeOptions[number];

function buildPerformanceTrend({
  positions,
  dailyPrices,
  toPrimary,
  range,
  customStart,
  customEnd,
}: {
  positions: HoldingPosition[];
  dailyPrices: DailyPrice[];
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  range: PerformanceRange;
  customStart: string;
  customEnd: string;
}) {
  const end = range === "Custom" ? customEnd : todayDate();
  const start = range === "Custom" ? customStart : rangeStartDate(range, end);
  if (!start || !end || start > end) return [];

  const tickers = new Set(positions.map((position) => position.ticker.toUpperCase()));
  const pricesByTicker = new Map<string, DailyPrice[]>();
  for (const price of dailyPrices) {
    const ticker = price.ticker.toUpperCase();
    if (!tickers.has(ticker)) continue;
    if (price.date < start || price.date > end) continue;
    const bucket = pricesByTicker.get(ticker) ?? [];
    bucket.push(price);
    pricesByTicker.set(ticker, bucket);
  }
  for (const [ticker, rows] of pricesByTicker) {
    pricesByTicker.set(ticker, rows.sort((a, b) => a.date.localeCompare(b.date)));
  }

  const dates = [...new Set([...pricesByTicker.values()].flat().map((price) => price.date))].sort();
  return dates.map((date) => {
    const value = positions.reduce((sum, position) => {
      const history = pricesByTicker.get(position.ticker.toUpperCase()) ?? [];
      const price = latestPriceOnOrBefore(history, date);
      if (!price) return sum;
      return sum + toPrimary(price.close * position.quantity, price.currency || position.currency, date);
    }, 0);
    return {
      date,
      label: compactDateLabel(date, range),
      value,
    };
  }).filter((point) => point.value > 0);
}

function latestPriceOnOrBefore(rows: DailyPrice[], date: string) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= date) return rows[index];
  }
  return null;
}

function rangeStartDate(range: PerformanceRange, end: string) {
  if (range === "Custom") return end;
  const days: Record<Exclude<PerformanceRange, "Custom">, number> = {
    "1D": 1,
    "1W": 7,
    "1M": 31,
    "1Y": 365,
    "3Y": 365 * 3,
  };
  return dateDaysAgo(days[range], end);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days: number, from = todayDate()) {
  const date = new Date(`${from}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function compactDateLabel(value: string, range: PerformanceRange) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "1D" || range === "1W" || range === "1M") {
    return date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
  }
  return date.toLocaleDateString("zh-TW", { year: "2-digit", month: "numeric" });
}
