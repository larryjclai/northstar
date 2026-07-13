import { CaretDown, CaretRight, DownloadSimple, Info, Printer } from "@phosphor-icons/react";
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
  formatNumber,
  formatSignedMoney,
  formatMoney,
  resolveCountryLabel,
  todayInTimezone,
  type AnnualHoldingTaxDetail,
  type AnnualReportYear,
  type InvestmentRecord,
} from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { annualPrintButtonState, buildAnnualPrintHeaderMeta } from "./annualReportPrint";

export function AnnualReportRoute() {
  const { assets, investments, settings, dailyFxRates, isInitialLoading, isError, error, refetchAll } = useFinanceData();

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const appSettings = settings.data;
  const { primaryCurrency, toPrimaryOrNull } = useMemo(
    () => createFxConverter(appSettings, dailyFxRates.data ?? []),
    [appSettings, dailyFxRates.data],
  );

  const timezone = useUiPreferences((state) => state.timezone);
  const today = todayInTimezone(timezone);
  const privacyMode = useUiPreferences((state) => state.privacyMode);

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

  const { report, dividendFxMisses } = useMemo(() => {
    // We only consume `byYear`; the yield denominator is irrelevant here.
    const dividends = buildDividendAnalysis({
      records: recordRows,
      assetMeta: allAssetMeta,
      toPrimary: toPrimaryOrNull,
      currentMarketValue: 0,
      asOf: today,
    });
    const { years } = buildAnnualReport({
      assets: assetRows,
      recordsByAsset: (assetId) => recordsByAsset.get(assetId) ?? [],
      dividendByYear: dividends.byYear,
      toPrimary: toPrimaryOrNull,
    });
    return { report: years, dividendFxMisses: dividends.fxMisses };
  }, [recordRows, assetRows, allAssetMeta, recordsByAsset, toPrimaryOrNull, today]);

  // Descending so the most recent (most relevant for 報稅) year is first.
  const rows = useMemo(() => [...report].reverse(), [report]);

  // Print/export (plan 173). window.print() opens the native macOS print
  // dialog inside the Tauri WKWebview (Tauri fixed window.print() on macOS —
  // see @tauri-apps/api CHANGELOG) and the browser dev shell alike, and its
  // "Save as PDF" destination is the export path — no PDF dependency needed.
  // The button is inert while the privacy mask is on (a printout of blurred
  // amounts is useless) or when there's nothing to print.
  const printButton = annualPrintButtonState({ privacyMode, hasRows: rows.length > 0 });
  const printMeta = useMemo(
    () => buildAnnualPrintHeaderMeta(rows.map((r) => r.year), today),
    [rows, today],
  );

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
          <h3 className="text-[17px] font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>
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
    <div className="ns-annual-report" style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Print-only report header — hidden on screen (ns-print-only), shown on
          the printed page so the PDF/paper carries the app name, the year span
          it covers, and when it was generated. */}
      <div className="ns-print-only ns-annual-print-head" aria-hidden="true">
        <div className="ns-annual-print-brand">Northstar · 年度報表</div>
        <div className="ns-annual-print-meta">
          {printMeta.rangeLabel ? <span>{printMeta.rangeLabel}</span> : null}
          <span>{printMeta.generatedLabel}</span>
        </div>
      </div>

      {/* Header — English eyebrow + Chinese h1 (DESIGN.md §3.5). */}
      <div className="flex justify-between" style={{ marginBottom: 22, alignItems: "flex-start", gap: 16 }}>
        <div>
          <div className="text-xs ns-field-label">Annual tax summary</div>
          <h1 className="text-[28px] font-semibold" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02 }}>
            年度報表
          </h1>
          <p className="muted text-body mt-2" style={{ maxWidth: 640 }}>
            依處分日年度彙總證券交易所得（已實現損益）與股利所得，供報稅參考。已實現損益採移動平均成本計算。
          </p>
        </div>
        {/* Toolbar buttons never print (ns-print-hide). */}
        <div className="ns-print-hide flex" style={{ gap: 8, alignItems: "flex-start" }}>
          <Button
            variant="outline"
            disabled={printButton.disabled}
            title={printButton.title}
            onClick={() => window.print()}
          >
            <Printer size={14} />列印 / 匯出 PDF
          </Button>
          <Button
            variant="outline"
            disabled={rows.length === 0}
            title={rows.length === 0 ? "尚無資料可匯出" : "匯出逐檔年度報稅明細"}
            onClick={() => downloadCsv("annual-tax.csv", exportAnnualTaxCsv(rows, primaryCurrency))}
          >
            <DownloadSimple size={14} />匯出 CSV
          </Button>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div className="muted text-body text-center" style={{ padding: "40px 24px" }}>
            尚無已實現損益或股利紀錄。賣出持股或登錄現金股利後，年度摘要會在此顯示。
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
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
                          <span className="items-center" style={{ display: "inline-flex", gap: 6 }}>
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

      {/* Missing-rate warning — dividends excluded from the totals above because
          no FX rate covered their currency on their date (plan 121). */}
      {dividendFxMisses.count > 0 ? (
        <div
          className="text-body mt-4 flex"
          style={{ gap: 8, color: "var(--ns-warn)", maxWidth: 720 }}
        >
          <Info size={16} className="shrink-0" style={{ marginTop: 2 }} />
          <p style={{ margin: 0 }}>
            有 {formatNumber(dividendFxMisses.count)} 筆配息因缺少匯率未計入（
            {dividendFxMisses.currencies.map((c) => `${c}→${primaryCurrency}`).join("、")}）。
          </p>
        </div>
      ) : null}

      {/* FX口徑 caveat (Decision C) — mirror plan 015's note pattern. */}
      <div
        className="text-body mt-4 flex"
        style={{ gap: 8, color: "var(--ns-fg-muted)", maxWidth: 720 }}
      >
        <Info size={16} className="shrink-0" style={{ marginTop: 2 }} />
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
    <div className="pt-3">
      <table className="w-full" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
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
