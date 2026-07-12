import { X, Bank, UploadSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { AccountFilter } from "../components/AccountFilter";
import { ToggleGroup, ToggleGroupItem } from "../components/coss/toggle-group";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { ModalShell } from "../components/ModalShell";
import { NumberField } from "../components/NumberField";
import { StatusText } from "../components/StatusText";
import { TickerSearchField } from "../components/TickerSearchField";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { DividendReinvestmentDraft, InvestmentDraft, PortfolioAssetDraft } from "../data/repositories";
import { calculateInvestmentCashDelta, formatNumber, formatQuantity, nowAsDatetimeLocal, type Account, type InvestmentAction, type PortfolioAsset } from "../domain";
import { TaiwanMarketDataProvider } from "../features/market-data/taiwanMarketDataProvider";
import { assertExplicitMarketSuffix } from "../domain/marketSymbols";
import { YahooFinanceProvider } from "../features/market-data/yahooFinanceProvider";
import { useUiPreferences } from "../state/uiPreferences";
import { computeTradeFee, brokerFeeDiscountFor, isTaiwanTicker, DEFAULT_TW_FEES } from "../domain/tradingFees";
import { feeStartsTouched } from "./investmentsAddSheetFee";

export type InvestmentEntryMode = "snapshot" | "transaction";

/** COSS ToggleGroup segmented-item styling — accent fill when selected, so the
 *  active option is unmistakable (the COSS default `data-pressed` is a faint gray
 *  that reads as unselected). Mirrors the .ns-seg accent convention. */
const SEG_ITEM_CLASS =
  "flex-1 data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground";

const NUM_INPUT_STYLE: React.CSSProperties = {
  fontFamily: "var(--ns-font-mono)",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums lining-nums",
};

/**
 * Surface the real cause when a save fails. Errors thrown by the SQLite layer
 * (`@tauri-apps/plugin-sql`) are bare strings, not Error instances, so a plain
 * `instanceof Error` check drops them and shows only the generic fallback.
 */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

/** Transaction sides surfaced in the entry sheet, mapped to data-layer actions.
 *  The "dividend" side covers both cash and stock dividends via a sub-toggle. */
type TxSide = "buy" | "sell" | "dividend" | "split" | "reduction";
const SIDE_TO_ACTION: Record<TxSide, InvestmentAction> = {
  buy: "buy",
  sell: "sell",
  dividend: "cashDividend",
  split: "stockSplit",
  reduction: "capitalReduction",
};
const SIDE_LABEL: Record<TxSide, string> = { buy: "買進", sell: "賣出", dividend: "股利", split: "拆股", reduction: "減資" };
const SIDE_CONFIRM: Record<TxSide, string> = {
  buy: "確認買入",
  sell: "確認賣出",
  dividend: "確認股利",
  split: "確認拆股",
  reduction: "確認減資",
};

function sideFromAction(action: InvestmentAction): TxSide {
  if (action === "sell") return "sell";
  if (action === "cashDividend" || action === "stockDividend") return "dividend";
  if (action === "stockSplit") return "split";
  if (action === "capitalReduction") return "reduction";
  return "buy";
}

export interface TransactionPreset {
  id?: string;
  draft: InvestmentDraft;
}

export function emptyTransactionDraft(timezone: string): InvestmentDraft {
  return {
    ticker: "",
    name: "",
    currency: "TWD",
    linkedAccountId: null,
    date: nowAsDatetimeLocal(timezone),
    action: "buy",
    price: 0,
    quantity: 0,
    fee: 0,
    note: "",
    assetType: null,
    sector: null,
    industry: null,
  };
}

/** Normalise per-action so cash/quantity math stays consistent with the data layer. */
function normalizeTransactionDraft(input: InvestmentDraft): InvestmentDraft {
  // cashDividend: `price` holds the total dividend amount; no share change.
  if (input.action === "cashDividend") return { ...input, quantity: 0 };
  // stockDividend (配股): `quantity` holds shares received; no cash / cost.
  if (input.action === "stockDividend") return { ...input, price: 0, fee: 0 };
  // stockSplit: `quantity` holds the ratio (holding ×= ratio); no price / fee.
  if (input.action === "stockSplit") return { ...input, price: 0, fee: 0 };
  // capitalReduction (減資): `quantity` = shares cancelled, `price` = cash
  // returned per cancelled share (0 for a deficit-offset reduction); no fee.
  if (input.action === "capitalReduction") return { ...input, fee: 0 };
  return input;
}

function isStockDividend(action: InvestmentAction) {
  return action === "stockDividend";
}

export function InvestmentEntryDrawer({
  open,
  onClose,
  accounts,
  portfolioAssets = [],
  title = "新增交易",
  initialMode = "transaction",
  onSubmitted,
  transactionPreset,
  onOpenImport,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  portfolioAssets?: PortfolioAsset[];
  title?: string;
  initialMode?: InvestmentEntryMode;
  onSubmitted?: () => void;
  transactionPreset?: TransactionPreset;
  onOpenImport?: () => void;
}) {
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyHoldingDraft = useMemo(() => makeEmptyHoldingDraft(timezone), [timezone]);
  const [mode, setMode] = useState<InvestmentEntryMode>(initialMode);
  const [snapshotForm, setSnapshotForm] = useState<PortfolioAssetDraft>(emptyHoldingDraft);
  // 自訂資產（無報價）: a manually-priced holding with no Yahoo-resolvable ticker.
  // When on, the snapshot is created with assetType "custom" and prices from
  // manual snapshots → average cost (see domain/valuation, HoldingDetailRoute).
  const [isCustom, setIsCustom] = useState(false);
  const [transactionForm, setTransactionForm] = useState<InvestmentDraft>(() => emptyTransactionDraft(timezone));
  const [message, setMessage] = useState("");
  // 股利 sub-mode: 現金股利 / 股票股利(配股) / 股息再投入(DRIP). cash/stock map to the
  // record `action`; drip is an extra mode that records a linked dividend + buy.
  const [dividendMode, setDividendMode] = useState<"cash" | "stock" | "drip">("cash");
  // DRIP-only: the total dividend amount (A). Reinvested qty (Q) and price (P)
  // reuse transactionForm.quantity / .price. Residual = A − Q×P stays in cash.
  const [dripDividendAmount, setDripDividendAmount] = useState(0);
  // dripAmountTouched: true once the user has manually edited the DRIP amount
  // field; while true, changes to qty/price no longer auto-fill it. Mirrors
  // feeTouchedRef below.
  const dripAmountTouchedRef = useRef(false);

  // ── Taiwan broker-fee auto-fill ──────────────────────────────────────────
  // instrument: per-trade stock/ETF toggle (determines sell-tax rate in v1;
  // auto-detection is a follow-on).
  const [instrument, setInstrument] = useState<"stock" | "etf">("stock");
  // feeTouched: true once the user has manually edited the fee field; while
  // true auto-fill stops recomputing so the manual value is never overwritten.
  const feeTouchedRef = useRef(false);

  // Read tradingFees config from settings (non-blocking — if settings haven't
  // loaded yet, config is undefined and we skip auto-fill).
  const { settings: settingsQuery } = useFinanceData();
  const feeConfig = settingsQuery.data?.tradingFees ?? DEFAULT_TW_FEES;

  const createHolding = useRepositoryMutation(
    (repository, input: PortfolioAssetDraft) => repository.createManualHolding(input),
    ["assets"],
  );
  const createRecord = useRepositoryMutation(
    (repository, input: InvestmentDraft) => repository.createInvestmentRecord(input),
    ["investments", "assets", "accounts", "ledger"],
  );
  const createDrip = useRepositoryMutation(
    (repository, input: DividendReinvestmentDraft) => repository.createDividendReinvestment(input),
    ["investments", "assets", "accounts", "ledger"],
  );
  const updateRecord = useRepositoryMutation(
    (repository, input: InvestmentDraft & { id: string }) => repository.updateInvestmentRecord(input.id, input),
    ["investments", "assets", "accounts", "ledger"],
  );

  const isEditingTransaction = Boolean(transactionPreset?.id);

  useEffect(() => {
    if (!open) return;
    setSnapshotForm(emptyHoldingDraft);
    setIsCustom(false);
    if (transactionPreset) {
      setTransactionForm(normalizeTransactionDraft(transactionPreset.draft));
      setMode("transaction");
      // Editing an existing record never lands in DRIP mode (DRIP legs are
      // edited as their underlying cashDividend / buy records).
      setDividendMode(isStockDividend(transactionPreset.draft.action) ? "stock" : "cash");
    } else {
      setTransactionForm(emptyTransactionDraft(timezone));
      setMode(initialMode);
      setDividendMode("cash");
    }
    setDripDividendAmount(0);
    setMessage("");
    // Reset auto-fill state whenever the drawer opens. In edit mode the stored
    // fee is data, not a suggestion target, so start it "touched" — otherwise
    // the auto-fill effect (whose deps all change as the preset loads) clobbers
    // the record's real fee with a fresh formula estimate. See feeStartsTouched.
    feeTouchedRef.current = feeStartsTouched(transactionPreset);
    dripAmountTouchedRef.current = false;
    setInstrument("stock");
  }, [open, emptyHoldingDraft, timezone, initialMode, transactionPreset]);

  // ── Auto-fill effect ─────────────────────────────────────────────────────
  // Recomputes the fee whenever qty, price, action, or instrument changes,
  // but only when:
  //   • the config is enabled
  //   • the ticker is a TW market ticker (ends .TW / .TWO)
  //   • the action is buy or sell (not dividend/split/reduction)
  //   • the user has NOT manually edited the fee (feeTouchedRef.current === false)
  useEffect(() => {
    if (!feeConfig.enabled) return;
    if (feeTouchedRef.current) return;
    const action = transactionForm.action;
    if (action !== "buy" && action !== "sell") return;
    if (!isTaiwanTicker(transactionForm.ticker)) return;
    const suggested = computeTradeFee({
      action,
      qty: transactionForm.quantity,
      price: transactionForm.price,
      instrument,
      config: feeConfig,
      brokerFeeDiscount: brokerFeeDiscountFor(feeConfig, transactionForm.linkedAccountId),
    });
    setTransactionForm((prev) => ({ ...prev, fee: suggested }));
  }, [
    feeConfig,
    transactionForm.action,
    transactionForm.ticker,
    transactionForm.quantity,
    transactionForm.price,
    transactionForm.linkedAccountId,
    instrument,
  ]);

  // Escape-to-close and body scroll-lock are provided by <ModalShell> below.

  const eligibleAccounts = accounts.filter(
    (account) => account.deletedAt === null && account.type === "investment",
  );
  const selectedTransactionAccount = eligibleAccounts.find((account) => account.id === transactionForm.linkedAccountId) ?? null;

  // Current holding for the entered ticker + account, used for the FIFO preview.
  const matchedAsset = useMemo(() => {
    const ticker = transactionForm.ticker.trim().toUpperCase();
    if (!ticker) return null;
    return (
      portfolioAssets.find(
        (a) => a.ticker.toUpperCase() === ticker && a.deletedAt === null &&
          (a.holdingSource === "transactions" || a.accountId === transactionForm.linkedAccountId),
      ) ?? null
    );
  }, [portfolioAssets, transactionForm.ticker, transactionForm.linkedAccountId]);

  // Quick-pick chips follow the user's own holdings, most recently added first —
  // never a hardcoded list, so we don't suggest tickers they never bought (B15).
  const tickerSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return [...portfolioAssets]
      .filter((a) => a.deletedAt === null && a.ticker)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .map((a) => a.ticker.toUpperCase())
      .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
      .slice(0, 6);
  }, [portfolioAssets]);

  if (!open) return null;

  const side = sideFromAction(transactionForm.action);
  const currency = selectedTransactionAccount?.currency ?? transactionForm.currency;

  function setAction(nextSide: TxSide) {
    setTransactionForm((current) => normalizeTransactionDraft({ ...current, action: SIDE_TO_ACTION[nextSide] }));
    if (nextSide === "dividend") setDividendMode("cash");
    setMessage("");
  }

  async function submitSnapshot() {
    setMessage("");
    try {
      if (isCustom) {
        // Custom (manually-priced) asset: no ticker, name required.
        if (!snapshotForm.name.trim()) throw new Error("請輸入名稱。");
        if (!snapshotForm.accountId) throw new Error("請選擇券商 / 帳戶。");
        await createHolding.mutateAsync({ ...snapshotForm, ticker: "", assetType: "custom" });
      } else {
        if (!snapshotForm.ticker.trim()) throw new Error("請輸入 ticker。");
        assertExplicitMarketSuffix(snapshotForm.ticker);
        if (!snapshotForm.accountId) throw new Error("請選擇券商 / 帳戶。");
        await createHolding.mutateAsync(snapshotForm);
      }
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(errorMessage(error, "持倉儲存失敗。"));
    }
  }

  async function submitTransaction() {
    setMessage("");
    try {
      if (!transactionForm.ticker.trim()) throw new Error("請輸入 ticker。");
      assertExplicitMarketSuffix(transactionForm.ticker);
      if (!transactionForm.linkedAccountId) throw new Error("請選擇連動帳戶 / 券商。");

      // 股息再投入 (DRIP): record a linked cashDividend + reinvestment buy at once.
      if (side === "dividend" && dividendMode === "drip") {
        if (transactionForm.quantity <= 0) throw new Error("請輸入再投入股數。");
        if (transactionForm.price <= 0) throw new Error("請輸入再投入價格。");
        // Amount-vs-qty×price match check lives in the repository's shared
        // validateDividendReinvestment (single source of truth, tolerant of
        // broker rounding); failures surface via the catch below.
        const dripInput: DividendReinvestmentDraft = {
          ticker: transactionForm.ticker,
          name: transactionForm.name,
          currency: transactionForm.currency,
          linkedAccountId: transactionForm.linkedAccountId,
          date: transactionForm.date,
          quantity: transactionForm.quantity,
          price: transactionForm.price,
          dividendAmount: dripDividendAmount,
          note: transactionForm.note,
          assetType: transactionForm.assetType,
          sector: transactionForm.sector,
          industry: transactionForm.industry,
        };
        await createDrip.mutateAsync(dripInput);
        onSubmitted?.();
        onClose();
        return;
      }

      if (side === "split" && transactionForm.quantity <= 0) throw new Error("請輸入拆股比例（例如 3 = 1 股拆 3 股）。");
      if (side === "reduction" && transactionForm.quantity <= 0) throw new Error("請輸入被註銷的股數。");
      if (side === "dividend" && isStockDividend(transactionForm.action) && transactionForm.quantity <= 0) throw new Error("請輸入配發的股數。");
      if (side === "dividend" && !isStockDividend(transactionForm.action) && transactionForm.price <= 0) throw new Error("請輸入股利金額。");

      const payload = normalizeTransactionDraft(transactionForm);
      if (transactionPreset?.id) {
        await updateRecord.mutateAsync({ ...payload, id: transactionPreset.id });
      } else {
        await createRecord.mutateAsync(payload);
      }
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(errorMessage(error, "交易儲存失敗。"));
    }
  }

  async function enrichTransactionClassification(draft: InvestmentDraft) {
    try {
      const yahooProvider = new YahooFinanceProvider();
      const taiwanProvider = new TaiwanMarketDataProvider();
      const [yahooProfiles, taiwanProfiles] = await Promise.all([
        yahooProvider.fetchAssetProfiles([draft.ticker]).catch(() => ({})),
        taiwanProvider.fetchAssetProfiles([draft.ticker]).catch(() => ({})),
      ]);
      const profiles = { ...yahooProfiles, ...taiwanProfiles };
      const profile = profiles[draft.ticker.trim().toUpperCase()];
      if (!profile) throw new Error("No profile");
      setTransactionForm((current) =>
        current.ticker.trim().toUpperCase() === draft.ticker.trim().toUpperCase()
          ? {
              ...current,
              name: profile.nameZh ?? current.name,
              assetType: profile.assetType ?? current.assetType,
              sector: profile.sector ?? current.sector,
              industry: profile.industry ?? current.industry,
            }
          : current,
      );
    } catch {
      setMessage("未能取得分類，請手動填入。");
    }
  }

  // ── FIFO impact preview ──
  const curQty = matchedAsset?.totalQuantity ?? 0;
  const curAvg = matchedAsset?.averageCost ?? 0;
  const curCost = curQty * curAvg;
  const qty = Math.max(0, transactionForm.quantity || 0);
  const price = Math.max(0, transactionForm.price || 0);
  const fee = Math.max(0, transactionForm.fee || 0);

  let totalLabel = "投入成本";
  let totalValue = 0;
  let newQty = curQty;
  let newAvg = curAvg;
  if (side === "buy") {
    totalValue = qty * price + fee;
    newQty = curQty + qty;
    newAvg = newQty > 0 ? (curCost + qty * price + fee) / newQty : 0;
  } else if (side === "sell") {
    totalLabel = "預估收入";
    totalValue = qty * price - fee;
    newQty = Math.max(0, curQty - qty);
    newAvg = curAvg;
  } else if (side === "dividend" && dividendMode === "drip") {
    // DRIP: dividend buys Q shares @ P → shares rise, cost blends in the buy.
    totalLabel = "再投入金額";
    totalValue = qty * price;
    newQty = curQty + qty;
    newAvg = newQty > 0 ? (curCost + qty * price) / newQty : 0;
  } else if (side === "dividend" && isStockDividend(transactionForm.action)) {
    // 配股：股數增加、總成本不變 → 均價下降。
    totalLabel = "配發股數";
    totalValue = qty;
    newQty = curQty + qty;
    newAvg = newQty > 0 ? curCost / newQty : 0;
  } else if (side === "dividend") {
    totalLabel = "股利收入";
    totalValue = price - fee;
    newQty = curQty;
    newAvg = curAvg;
  } else if (side === "reduction") {
    // 減資：扣除股數、退回現金降低成本基礎（彌補虧損減資退現金為 0）。
    totalLabel = "退回現金";
    const cashReturned = qty * price;
    totalValue = cashReturned;
    newQty = Math.max(0, curQty - qty);
    const newCost = Math.max(0, curCost - cashReturned);
    newAvg = newQty > 0 ? newCost / newQty : 0;
  } else {
    // split: quantity = ratio
    totalLabel = "拆股比例";
    const ratio = qty;
    totalValue = ratio;
    newQty = ratio > 0 ? curQty * ratio : curQty;
    newAvg = ratio > 0 ? curAvg / ratio : curAvg;
  }
  const newMarketValue = newQty * (price || curAvg);
  const confirmAmount =
    side === "split" ? `×${qty || 0}`
      : side === "dividend" && dividendMode === "drip" ? `+${formatNumber(qty || 0)} 股`
        : side === "dividend" && isStockDividend(transactionForm.action) ? `+${formatNumber(qty || 0)} 股`
          : formatPreviewMoney(totalValue, currency);

  // T+2 settlement warning (TWD buys only).
  const cashDelta = calculateInvestmentCashDelta(normalizeTransactionDraft(transactionForm));
  const twdTopUpShortfall = selectedTransactionAccount && currency.toUpperCase() === "TWD" && side === "buy"
    ? Math.max(0, -(selectedTransactionAccount.balance + cashDelta))
    : 0;
  const tPlus2Date = addDays(transactionForm.date, 2);

  return (
    <ModalShell
      variant="drawer"
      mobilePresentation="bottom-sheet"
      title={mode === "snapshot" ? "建立目前部位" : title}
      onClose={onClose}
      style={{ zIndex: 50 }}
      panelStyle={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: "min(520px, 100%)",
        background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)",
        display: "flex", flexDirection: "column", boxShadow: "var(--ns-shadow-2)",
      }}
    >
      {(dismiss) => (<>
        {/* Header */}
        <div className="flex items-center gap-3" style={{ padding: "20px 24px", borderBottom: "1px solid var(--ns-border)" }}>
          <h2 className="text-xl" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 600, letterSpacing: -0.02 }}>
            {mode === "snapshot" ? "建立目前部位" : title}
          </h2>
          <div className="flex-1" />
          {onOpenImport && !transactionPreset && mode === "transaction" && (
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => { onClose(); onOpenImport(); }}>
              <UploadSimple size={14} className="mr-1.5" />匯入 CSV
            </Button>
          )}
          {!transactionPreset ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setMode(mode === "snapshot" ? "transaction" : "snapshot"); setMessage(""); }}
            >
              {mode === "snapshot" ? "改記一筆交易" : "建立持倉／自訂資產"}
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={dismiss} aria-label="關閉"><X size={16} /></Button>
        </div>

        {eligibleAccounts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
              <Bank size={24} weight="duotone" />
            </div>
            <div>
              <h3 className="text-base" style={{ margin: "0 0 8px 0", fontWeight: 600 }}>尚未建立投資帳戶</h3>
              <p className="muted text-sm" style={{ margin: 0, lineHeight: 1.5 }}>
                在開始記錄投資交易前，您需要先建立至少一個「投資種類」的帳戶。
              </p>
            </div>
            <Button render={<Link to="/accounts" onClick={onClose} />} className="mt-2">前往建立帳戶</Button>
          </div>
        ) : mode === "snapshot" ? (
          <div className="flex-1" style={{ overflow: "auto", padding: "20px 24px" }}>
            <label
              className="mb-4 flex gap-2.5"
              style={{
                alignItems: "flex-start",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--ns-border)",
                background: "var(--ns-bg-elev)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isCustom}
                onChange={(event) => { setIsCustom(event.target.checked); setMessage(""); }}
                style={{ marginTop: 2, accentColor: "var(--ns-accent)" }}
              />
              <span>
                <span className="block font-semibold">自訂資產（無報價）</span>
                <span className="muted text-xs block" style={{ marginTop: 2, lineHeight: 1.5 }}>
                  無市場報價的資產（例如未上市股權、不動產、收藏品）。不需 ticker，市值由你之後在持倉頁手動更新價格決定；未更新前以平均成本計價。
                </span>
              </span>
            </label>
            <HoldingForm
              value={snapshotForm}
              onChange={setSnapshotForm}
              onSubmit={submitSnapshot}
              submitLabel={createHolding.isPending ? "儲存中…" : "儲存持倉"}
              accounts={accounts}
            />
            {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}
          </div>
        ) : (
          <>
            {/* Side tabs */}
            <div style={{ padding: "18px 24px 0" }}>
              <ToggleGroup
                variant="outline"
                className="w-full"
                value={[side]}
                onValueChange={(value) => {
                  const next = value[0] as TxSide | undefined;
                  if (next) setAction(next);
                }}
              >
                {(Object.keys(SIDE_TO_ACTION) as TxSide[]).map((s) => (
                  <ToggleGroupItem key={s} value={s} className={SEG_ITEM_CLASS}>
                    {SIDE_LABEL[s]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-1 flex-col" style={{ overflow: "auto", padding: "20px 24px", gap: 18 }}>
              {/* Ticker + quick chips */}
              <div>
                <label className="text-xs ns-field-label block">股票代號 / Symbol</label>
                <TickerSearchField
                  value={transactionForm.ticker}
                  onChange={(ticker) => setTransactionForm({ ...transactionForm, ticker })}
                  onSelect={(result) => {
                    const next = {
                      ...transactionForm,
                      ticker: result.symbol.toUpperCase(),
                      name: result.name || result.symbol,
                      currency: selectedTransactionAccount?.currency ?? transactionForm.currency,
                      assetType: result.assetType ?? transactionForm.assetType ?? null,
                    };
                    setTransactionForm(next);
                    void enrichTransactionClassification(next);
                  }}
                />
                {tickerSuggestions.length > 0 ? (
                  <div className="mt-2 flex gap-1.5" style={{ flexWrap: "wrap" }}>
                    {tickerSuggestions.map((s) => (
                      <Button key={s} variant="outline" size="xs" className="font-mono" onClick={() => setTransactionForm({ ...transactionForm, ticker: s })}>
                        {s}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Date + account */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label className="text-xs ns-field-label block">日期</label>
                  <input className="ns-input" type="datetime-local" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs ns-field-label block">券商 / 帳戶</label>
                  <AccountFilter
                    accounts={eligibleAccounts}
                    value={transactionForm.linkedAccountId ?? "all"}
                    onChange={(id) =>
                      setTransactionForm({
                        ...transactionForm,
                        linkedAccountId: id === "all" ? null : id,
                        currency: eligibleAccounts.find((a) => a.id === id)?.currency ?? transactionForm.currency,
                      })
                    }
                    allowAll
                    allLabel="選擇券商"
                    placeholder="選擇券商"
                    style={{ width: "100%", maxWidth: "none", minWidth: 0, height: 40 }}
                    contentClassName="z-80"
                    positionerClassName="z-80"
                  />
                </div>
              </div>

              {/* ── Group separator: 標的識別 → 金額明細 ── */}
              <div style={{ borderBottom: "1px solid var(--ns-border)", margin: "2px 0" }} />

              {/* Side-specific numeric fields */}
              {side === "split" ? (
                <div>
                  <label className="text-xs ns-field-label block">拆股比例（1 股 → N 股）</label>
                  <NumberField
                    value={transactionForm.quantity}
                    onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })}
                    decimals={4}
                    placeholder="3"
                    className="ns-input mono text-lg"
                    style={NUM_INPUT_STYLE}
                  />
                  <div className="muted text-caption mt-1.5">
                    輸入 3 = 3-for-1（持股 ×3、均價 ÷3、總成本不變）；小於 1 為反向拆股（例 0.5 = 2 併 1）。無手續費。
                  </div>
                </div>
              ) : side === "dividend" ? (
                <div className="flex flex-col gap-3.5">
                  {/* 現金股利 / 股票股利(配股) / 股息再投入(DRIP) sub-toggle. Editing an
                      existing record stays on cash/stock — DRIP is create-only. */}
                  <ToggleGroup
                    variant="outline"
                    className="w-full"
                    value={[dividendMode]}
                    onValueChange={(value) => {
                      const next = value[0] as "cash" | "stock" | "drip" | undefined;
                      if (!next) return;
                      setDividendMode(next);
                      // Leaving DRIP resets the amount auto-fill so re-entering starts fresh.
                      if (next !== "drip") dripAmountTouchedRef.current = false;
                      // cash + drip both record a cashDividend leg; stock = 配股.
                      setTransactionForm((c) => normalizeTransactionDraft({ ...c, action: next === "stock" ? "stockDividend" : "cashDividend" }));
                      setMessage("");
                    }}
                  >
                    <ToggleGroupItem value="cash" className={SEG_ITEM_CLASS}>現金股利</ToggleGroupItem>
                    <ToggleGroupItem value="stock" className={SEG_ITEM_CLASS}>股票股利</ToggleGroupItem>
                    {!isEditingTransaction && <ToggleGroupItem value="drip" className={SEG_ITEM_CLASS}>股息再投入</ToggleGroupItem>}
                  </ToggleGroup>
                  {dividendMode === "stock" ? (
                    <div>
                      <label className="text-xs ns-field-label block">配發股數</label>
                      <NumberField className="ns-input mono text-lg" value={transactionForm.quantity} onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })} decimals={5} placeholder="100" style={NUM_INPUT_STYLE} />
                      <div className="muted text-caption mt-1.5">
                        配股不涉及現金：股數增加、總成本不變，因此平均成本會下降。
                      </div>
                    </div>
                  ) : dividendMode === "drip" ? (
                    <div className="flex flex-col gap-3.5">
                      <div>
                        <label className="text-xs ns-field-label block">股利金額（總額）</label>
                        <NumberField
                          className="ns-input mono text-lg"
                          value={dripDividendAmount}
                          onChange={(amount) => {
                            dripAmountTouchedRef.current = true;
                            setDripDividendAmount(amount);
                          }}
                          decimals={2}
                          placeholder="3,500"
                          style={NUM_INPUT_STYLE}
                        />
                        <div className="muted text-caption mt-1.5">
                          未修改時自動帶入 股數 × 價格。
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div>
                          <label className="text-xs ns-field-label block">再投入股數</label>
                          <NumberField
                            className="ns-input mono text-lg"
                            value={transactionForm.quantity}
                            onChange={(quantity) => {
                              setTransactionForm({ ...transactionForm, quantity });
                              if (!dripAmountTouchedRef.current) {
                                setDripDividendAmount(Math.round(quantity * transactionForm.price * 100) / 100);
                              }
                            }}
                            decimals={5}
                            placeholder="2"
                            style={NUM_INPUT_STYLE}
                          />
                        </div>
                        <div>
                          <label className="text-xs ns-field-label block">再投入價格</label>
                          <NumberField
                            className="ns-input mono text-lg"
                            value={transactionForm.price}
                            onChange={(price) => {
                              setTransactionForm({ ...transactionForm, price });
                              if (!dripAmountTouchedRef.current) {
                                setDripDividendAmount(Math.round(transactionForm.quantity * price * 100) / 100);
                              }
                            }}
                            decimals={5}
                            placeholder="1,042.00"
                            style={NUM_INPUT_STYLE}
                          />
                        </div>
                      </div>
                      <div className="muted text-caption">
                        股息再投入：記錄一筆現金股利（計入股利統計）＋一筆買進（併入平均成本）。
                        現金淨變動 ≈ 0，剩餘現金 {formatPreviewMoney(Math.max(0, dripDividendAmount - transactionForm.quantity * transactionForm.price), currency)} 留在帳戶。
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label className="text-xs ns-field-label block">股利金額（總額）</label>
                        <NumberField className="ns-input mono text-lg" value={transactionForm.price} onChange={(price) => setTransactionForm({ ...transactionForm, price })} decimals={2} placeholder="3,500" style={NUM_INPUT_STYLE} />
                      </div>
                      <div>
                        <label className="text-xs ns-field-label block">代扣稅 / 手續費</label>
                        <NumberField className="ns-input mono text-lg" value={transactionForm.fee} onChange={(fee) => setTransactionForm({ ...transactionForm, fee })} placeholder="0" style={NUM_INPUT_STYLE} />
                      </div>
                    </div>
                  )}
                </div>
              ) : side === "reduction" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label className="text-xs ns-field-label block">被註銷股數</label>
                    <NumberField className="ns-input mono text-lg" value={transactionForm.quantity} onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })} decimals={5} placeholder="20" style={NUM_INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="text-xs ns-field-label block">每股退回現金</label>
                    <NumberField className="ns-input mono text-lg" value={transactionForm.price} onChange={(price) => setTransactionForm({ ...transactionForm, price })} decimals={5} placeholder="10" style={NUM_INPUT_STYLE} />
                    <div className="muted text-caption mt-1.5">
                      現金減資填每股退回金額；彌補虧損減資（不退現金）填 0。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Stock / ETF instrument toggle — determines sell-tax rate when
                      auto-fill is enabled; also shown on buys so the user's choice
                      persists if they switch between buy and sell. */}
                  {feeConfig.enabled && isTaiwanTicker(transactionForm.ticker) && (
                    <div>
                      <label className="text-xs ns-field-label block">標的類型</label>
                      <ToggleGroup
                        variant="outline"
                        className="w-full"
                        value={[instrument]}
                        onValueChange={(value) => {
                          const next = value[0] as "stock" | "etf" | undefined;
                          if (next) {
                            feeTouchedRef.current = false;
                            setInstrument(next);
                          }
                        }}
                      >
                        <ToggleGroupItem value="stock" className={SEG_ITEM_CLASS}>股票</ToggleGroupItem>
                        <ToggleGroupItem value="etf" className={SEG_ITEM_CLASS}>ETF</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    <div>
                      <label className="text-xs ns-field-label block">股數</label>
                      <NumberField className="ns-input mono text-lg" value={transactionForm.quantity} onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })} decimals={5} placeholder="100" style={NUM_INPUT_STYLE} />
                    </div>
                    <div>
                      <label className="text-xs ns-field-label block">每股價格</label>
                      <NumberField className="ns-input mono text-lg" value={transactionForm.price} onChange={(price) => setTransactionForm({ ...transactionForm, price })} decimals={5} placeholder="1,042.00" style={NUM_INPUT_STYLE} />
                    </div>
                    <div>
                      <label className="text-xs ns-field-label block">
                        手續費
                        {feeConfig.enabled && isTaiwanTicker(transactionForm.ticker) && !feeTouchedRef.current && (
                          <span className="muted ml-1.5" style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0 }}>自動試算</span>
                        )}
                      </label>
                      <NumberField
                        className="ns-input mono text-lg"
                        value={transactionForm.fee}
                        onChange={(fee) => {
                          feeTouchedRef.current = true;
                          setTransactionForm({ ...transactionForm, fee });
                        }}
                        decimals={2}
                        placeholder="選填"
                        style={NUM_INPUT_STYLE}
                      />
                      {feeConfig.enabled && isTaiwanTicker(transactionForm.ticker) && feeTouchedRef.current && (
                        <button
                          type="button"
                          className="text-xs muted mt-1"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            feeTouchedRef.current = false;
                            const action = transactionForm.action;
                            if (action === "buy" || action === "sell") {
                              setTransactionForm((prev) => ({
                                ...prev,
                                fee: computeTradeFee({ action, qty: prev.quantity, price: prev.price, instrument, config: feeConfig, brokerFeeDiscount: brokerFeeDiscountFor(feeConfig, prev.linkedAccountId) }),
                              }));
                            }
                          }}
                        >
                          重新試算
                        </button>
                      )}
                      {feeConfig.enabled &&
                        isTaiwanTicker(transactionForm.ticker) &&
                        (transactionForm.action === "buy" || transactionForm.action === "sell") &&
                        (() => {
                          const d = brokerFeeDiscountFor(feeConfig, transactionForm.linkedAccountId);
                          return d < 1 ? (
                            <div className="text-xs muted mt-1">
                              此帳戶券商手續費折扣 {(d * 10).toFixed((d * 10) % 1 === 0 ? 0 : 1)} 折（證交稅不打折）
                            </div>
                          ) : null;
                        })()}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Group separator: 金額明細 → 附加資訊 ── */}
              <div style={{ borderBottom: "1px solid var(--ns-border)", margin: "2px 0" }} />

              {/* Note */}
              <div>
                <label className="text-xs ns-field-label block">備註</label>
                <input className="ns-input" value={transactionForm.note} onChange={(e) => setTransactionForm({ ...transactionForm, note: e.target.value })} placeholder="選填" />
              </div>

              {/* FIFO impact preview */}
              <Card className="gap-0 rounded-[var(--ns-r-md)] border-[var(--ns-accent)] bg-[var(--ns-accent-soft)] p-4 shadow-none before:hidden">
                <div className="text-xs mb-2.5 font-medium" style={{ color: "var(--ns-accent)" }}>部位影響預覽</div>
                <div className="text-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><span className="muted">{totalLabel}</span><br /><span className="num text-base font-medium">{side === "split" ? `×${formatNumber(totalValue)}` : side === "dividend" && isStockDividend(transactionForm.action) ? `+${formatQuantity(totalValue)} 股` : formatPreviewMoney(totalValue, currency)}</span></div>
                  <div><span className="muted">新平均成本</span><br /><span className="num text-base font-medium">{formatPreviewMoney(newAvg, currency)}</span></div>
                  <div><span className="muted">新部位股數</span><br /><span className="num text-base font-medium">{formatQuantity(newQty)} 股</span></div>
                  <div><span className="muted">新市值</span><br /><span className="num pos text-base font-medium">{formatPreviewMoney(newMarketValue, currency)}</span></div>
                </div>
              </Card>

              {twdTopUpShortfall > 0 ? (
                <div className="text-xs" style={{ color: "var(--ns-warn)" }}>
                  台股 T+2 提醒：預估交割後需補 {formatNumber(twdTopUpShortfall)} TWD，請在 {tPlus2Date || "交割日前"} 前補款。
                </div>
              ) : null}
              {message ? <StatusText>{message}</StatusText> : null}
            </div>

            {/* Footer */}
            <div className="flex gap-2.5" style={{ padding: "16px 24px", borderTop: "1px solid var(--ns-border)" }}>
              <Button variant="outline" className="flex-1" onClick={dismiss}>取消</Button>
              <Button
                className="flex-[2]"
                onClick={submitTransaction}
                loading={createRecord.isPending || updateRecord.isPending || createDrip.isPending}
              >
                {(createRecord.isPending || updateRecord.isPending || createDrip.isPending) ? "儲存中…" : isEditingTransaction ? "儲存交易" : `${SIDE_CONFIRM[side]} · ${confirmAmount}`}
              </Button>
            </div>
          </>
        )}
      </>)}
    </ModalShell>
  );
}

export const HoldingsAddSheet = InvestmentEntryDrawer;

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatPreviewMoney(value: number, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase() || "TWD";
  const prefix = normalizedCurrency === "TWD" ? "NT$" : `${normalizedCurrency} `;
  const fractionOptions: Intl.NumberFormatOptions =
    normalizedCurrency === "TWD"
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 6 };
  return `${prefix}${formatNumber(value, fractionOptions)}`;
}
