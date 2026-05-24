import { ArrowsClockwise, Bank, ChartLineUp, ListChecks, PlusCircle } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { useFinanceData } from "../data/hooks";
import {
  buildHoldingPositionsByAccount,
  createFxConverter,
  formatMoney,
  formatNumber,
  formatPrice,
  formatQuantity,
  resolveAssetName,
  type Account,
  type HoldingPosition,
  type MarketQuote as DomainMarketQuote,
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

  const { accounts, assets, investments, quotes, settings, dailyFxRates } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const refreshDailyPrices = useRefreshDailyPrices();
  const nameLocale = useUiPreferences((state) => state.nameLocale);

  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const quoteRows = quotes.data ?? [];
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
    () => accountRows.filter((account) => account.type === "investment" || account.type === "depository"),
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
          refreshing={refreshQuotes.isPending || refreshDailyPrices.isPending}
        />
      ) : null}
      {tab === "holdings" ? (
        <HoldingsTab
          positions={positions}
          accountMap={accountMap}
          nameLocale={nameLocale}
          assetsByTicker={new Map(assetRows.map((asset) => [asset.ticker.toUpperCase(), asset]))}
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
  toPrimary: (value: number, currency: string) => number;
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
  refreshing,
}: {
  positions: HoldingPosition[];
  primaryCurrency: string;
  toPrimary: (value: number, currency: string) => number;
  refreshing: boolean;
}) {
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
  nameLocale,
  assetsByTicker,
}: {
  positions: HoldingPosition[];
  accountMap: Map<string, Account>;
  nameLocale: NameLocalePreference;
  assetsByTicker: Map<string, { name: string; nameZh: string | null; nameEn: string | null; ticker: string }>;
}) {
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
    <Card title={`持倉 (${positions.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => {
              const account = position.accountId ? accountMap.get(position.accountId) : null;
              const asset = assetsByTicker.get(position.ticker.toUpperCase()) ?? null;
              const displayName = asset
                ? resolveAssetName({ ...asset, ticker: position.ticker }, nameLocale)
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "var(--ns-muted)" }}>
        <Link to="/holdings">編輯舊持倉表單</Link>
        <Link to="/transactions">查看交易明細</Link>
      </div>
    </Card>
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
