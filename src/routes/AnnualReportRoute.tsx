import { CaretDown, CaretRight, DownloadSimple, Info } from "@phosphor-icons/react";
import { Fragment, useMemo, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { downloadCsv, exportAnnualTaxCsv } from "../data/csv";
import { useFinanceData } from "../data/hooks";
import {
  buildAnnualReport,
  buildDividendAnalysis,
  createFxConverter,
  formatSignedMoney,
  formatMoney,
  resolveCountryLabel,
  todayInTimezone,
  type AnnualHoldingTaxDetail,
  type AnnualReportYear,
  type InvestmentRecord,
} from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

export function AnnualReportRoute() {
  const { assets, investments, settings, dailyFxRates, isInitialLoading, isError, error, refetchAll } = useFinanceData();

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);

  const timezone = useUiPreferences((state) => state.timezone);
  const today = todayInTimezone(timezone);

  const allAssetMeta = useMemo(
    () => new Map(assetRows.map((a) => [a.id, { ticker: a.ticker, currency: a.currency }])),
    [assetRows],
  );

  // Group records by asset once so the report can resolve them cheaply.
  const recordsByAsset = useMemo(() => {
    const map = new Map<string, InvestmentRecord[]>();
    for (const r of recordRows) {
      const list = map.get(r.assetId);
      if (list) list.push(r);
      else map.set(r.assetId, [r]);
    }
    return map;
  }, [recordRows]);

  const report = useMemo<AnnualReportYear[]>(() => {
    // We only consume `byYear`; the yield denominator is irrelevant here.
    const dividends = buildDividendAnalysis({
      records: recordRows,
      assetMeta: allAssetMeta,
      toPrimary,
      currentMarketValue: 0,
      asOf: today,
    });
    return buildAnnualReport({
      assets: assetRows,
      recordsByAsset: (assetId) => recordsByAsset.get(assetId) ?? [],
      dividendByYear: dividends.byYear,
      toPrimary,
    });
  }, [recordRows, assetRows, allAssetMeta, recordsByAsset, toPrimary, today]);

  // Descending so the most recent (most relevant for 報稅) year is first.
  const rows = useMemo(() => [...report].reverse(), [report]);

  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  if (isInitialLoading) {
    return (
      <div className="grid gap-5" style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
        <Skeleton className="h-[120px]" />
        <Skeleton className="h-[320px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Header — English eyebrow + Chinese h1 (DESIGN.md §3.5). */}
      <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="text-xs" style={{  marginBottom: 6 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>Annual tax summary</div>
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
            年度報表
          </h1>
          <p className="muted text-body" style={{ marginTop: 8, maxWidth: 640 }}>
            依處分日年度彙總證券交易所得（已實現損益）與股利所得，供報稅參考。已實現損益採移動平均成本計算。
          </p>
        </div>
        <Button
          variant="outline"
          disabled={rows.length === 0}
          title={rows.length === 0 ? "尚無資料可匯出" : "匯出逐檔年度報稅明細"}
          onClick={() => downloadCsv("annual-tax.csv", exportAnnualTaxCsv(rows, primaryCurrency))}
          style={{ flexShrink: 0 }}
        >
          <DownloadSimple size={14} />匯出 CSV
        </Button>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="muted text-body" style={{ padding: "40px 24px", textAlign: "center" }}>
            尚無已實現損益或股利紀錄。賣出持股或登錄現金股利後，年度摘要會在此顯示。
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ns-border)" }}>
                  <Th align="left">年度</Th>
                  <Th align="right">已實現損益</Th>
                  <Th align="right">股利所得</Th>
                  <Th align="right">交易成本</Th>
                  <Th align="right">合計</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isOpen = expandedYear === row.year;
                  const hasDetail = row.byHolding.length > 0;
                  const isLast = i === rows.length - 1;
                  return (
                    <Fragment key={row.year}>
                      <tr
                        onClick={hasDetail ? () => setExpandedYear(isOpen ? null : row.year) : undefined}
                        style={{
                          borderBottom: isLast && !isOpen ? "none" : "1px solid var(--ns-border)",
                          cursor: hasDetail ? "pointer" : undefined,
                        }}
                      >
                        <Td align="left" style={{ fontWeight: 600 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {hasDetail ? (
                              isOpen ? <CaretDown size={13} /> : <CaretRight size={13} />
                            ) : (
                              <span style={{ display: "inline-block", width: 13 }} />
                            )}
                            {row.year}
                          </span>
                        </Td>
                        <SignedTd amount={row.realizedGain} currency={primaryCurrency} />
                        <Td align="right">{formatMoney(row.dividends, primaryCurrency)}</Td>
                        <Td align="right" style={{ color: "var(--ns-fg-muted)" }}>{formatMoney(row.tradingCost, primaryCurrency)}</Td>
                        <SignedTd amount={row.total} currency={primaryCurrency} strong />
                      </tr>
                      {isOpen && hasDetail ? (
                        <tr style={{ borderBottom: isLast ? "none" : "1px solid var(--ns-border)" }}>
                          <td colSpan={5} style={{ padding: "0 18px 16px", background: "var(--ns-bg-subtle, rgba(0,0,0,0.02))" }}>
                            <YearDetail row={row} currency={primaryCurrency} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* FX口徑 caveat (Decision C) — mirror plan 015's note pattern. */}
      <div
        className="text-body"
        style={{ marginTop: 16, display: "flex", gap: 8, color: "var(--ns-fg-muted)", maxWidth: 720 }}
      >
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: 0 }}>
            外幣交易以「處分日」匯率換算為{primaryCurrency}；若該日無匯率資料，則回退至目前匯率。
          </p>
          <p style={{ margin: "6px 0 0" }}>
            「交易成本」為該年度手續費與證交稅的合計，僅供揭露 —— 已實現損益已淨額化這些費用，故合計不會重複扣除。
            目前手續費與證交稅為單一合併欄位，尚無法分開顯示。
          </p>
        </div>
      </div>
    </div>
  );
}

/** Expanded per-holding detail for one tax year, plus 境內/海外 subtotals. */
function YearDetail({ row, currency }: { row: AnnualReportYear; currency: string }) {
  return (
    <div style={{ paddingTop: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            <Th align="left">代號</Th>
            <Th align="left">國別</Th>
            <Th align="right">已實現損益</Th>
            <Th align="right">股利所得</Th>
          </tr>
        </thead>
        <tbody>
          {row.byHolding.map((h: AnnualHoldingTaxDetail) => (
            <tr key={h.assetId}>
              <Td align="left">{h.ticker}</Td>
              <Td align="left" style={{ color: "var(--ns-fg-muted)" }}>{resolveCountryLabel(h.country, "zh-Hant")}</Td>
              <SignedTd amount={h.realizedGain} currency={currency} />
              <Td align="right">{formatMoney(h.dividends, currency)}</Td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid var(--ns-border)" }}>
            <Td align="left" style={{ fontWeight: 600 }}>境內小計</Td>
            <Td align="left">{""}</Td>
            <SignedTd amount={row.domestic.realizedGain} currency={currency} strong />
            <Td align="right" style={{ fontWeight: 600 }}>{formatMoney(row.domestic.dividends, currency)}</Td>
          </tr>
          <tr>
            <Td align="left" style={{ fontWeight: 600 }}>海外小計</Td>
            <Td align="left">{""}</Td>
            <SignedTd amount={row.overseas.realizedGain} currency={currency} strong />
            <Td align="right" style={{ fontWeight: 600 }}>{formatMoney(row.overseas.dividends, currency)}</Td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: "left" | "right" }) {
  return (
    <th
      className="text-xs"
      style={{ padding: "12px 18px", textAlign: align, color: "var(--ns-fg-muted)", fontWeight: 500, whiteSpace: "nowrap" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  style,
}: {
  children: React.ReactNode;
  align: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <td className="text-sm" style={{ padding: "14px 18px", textAlign: align, whiteSpace: "nowrap", ...style }}>
      {children}
    </td>
  );
}

function SignedTd({ amount, currency, strong }: { amount: number; currency: string; strong?: boolean }) {
  const tone = amount > 0 ? "var(--ns-pos)" : amount < 0 ? "var(--ns-neg)" : "var(--ns-fg)";
  return (
    <Td align="right" style={{ color: tone, fontWeight: strong ? 600 : 400 }}>
      {formatSignedMoney(amount, currency)}
    </Td>
  );
}
