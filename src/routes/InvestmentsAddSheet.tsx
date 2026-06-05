import { X, Bank } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Checkbox } from "../components/coss/checkbox";
import { ToggleGroup, ToggleGroupItem } from "../components/coss/toggle-group";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { NumberField } from "../components/NumberField";
import { StatusText } from "../components/StatusText";
import { TickerSearchField } from "../components/TickerSearchField";
import { useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft, PortfolioAssetDraft } from "../data/repositories";
import { calculateInvestmentCashDelta, formatNumber, formatQuantity, nowAsDatetimeLocal, type Account, type InvestmentAction, type PortfolioAsset } from "../domain";
import { YahooFinanceProvider } from "../features/market-data/yahooFinanceProvider";
import { useUiPreferences } from "../state/uiPreferences";

export type InvestmentEntryMode = "snapshot" | "transaction";

/** COSS ToggleGroup segmented-item styling — accent fill when selected, so the
 *  active option is unmistakable (the COSS default `data-pressed` is a faint gray
 *  that reads as unselected). Mirrors the .ns-seg accent convention. */
const SEG_ITEM_CLASS =
  "flex-1 data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground";

const NUM_INPUT_STYLE: React.CSSProperties = {
  fontFamily: "var(--ns-font-mono)",
  fontSize: 18,
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
const SIDE_LABEL: Record<TxSide, string> = { buy: "Buy", sell: "Sell", dividend: "股利", split: "拆股", reduction: "減資" };
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
  title = "New transaction",
  initialMode = "transaction",
  onSubmitted,
  transactionPreset,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  portfolioAssets?: PortfolioAsset[];
  title?: string;
  initialMode?: InvestmentEntryMode;
  onSubmitted?: () => void;
  transactionPreset?: TransactionPreset;
}) {
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyHoldingDraft = useMemo(() => makeEmptyHoldingDraft(timezone), [timezone]);
  const [mode, setMode] = useState<InvestmentEntryMode>(initialMode);
  const [snapshotForm, setSnapshotForm] = useState<PortfolioAssetDraft>(emptyHoldingDraft);
  const [transactionForm, setTransactionForm] = useState<InvestmentDraft>(() => emptyTransactionDraft(timezone));
  const [message, setMessage] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchAccounts, setBatchAccounts] = useState<string[]>([]);

  const createHolding = useRepositoryMutation(
    (repository, input: PortfolioAssetDraft) => repository.createManualHolding(input),
    ["assets"],
  );
  const createRecord = useRepositoryMutation(
    (repository, input: InvestmentDraft) => repository.createInvestmentRecord(input),
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
    if (transactionPreset) {
      setTransactionForm(normalizeTransactionDraft(transactionPreset.draft));
      setMode("transaction");
    } else {
      setTransactionForm(emptyTransactionDraft(timezone));
      setMode(initialMode);
    }
    setMessage("");
    setBatchMode(false);
    setBatchAccounts([]);
  }, [open, emptyHoldingDraft, timezone, initialMode, transactionPreset]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

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
    setMessage("");
  }

  async function submitSnapshot() {
    setMessage("");
    try {
      if (!snapshotForm.ticker.trim()) throw new Error("請輸入 ticker。");
      if (!snapshotForm.accountId) throw new Error("請選擇券商 / 帳戶。");
      await createHolding.mutateAsync(snapshotForm);
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
      if (batchMode) {
        if (batchAccounts.length === 0) throw new Error("請選擇至少一個連動帳戶。");
      } else {
        if (!transactionForm.linkedAccountId) throw new Error("請選擇連動帳戶 / 券商。");
      }
      if (side === "split" && transactionForm.quantity <= 0) throw new Error("請輸入拆股比例（例如 3 = 1 股拆 3 股）。");
      if (side === "reduction" && transactionForm.quantity <= 0) throw new Error("請輸入被註銷的股數。");
      if (side === "dividend" && isStockDividend(transactionForm.action) && transactionForm.quantity <= 0) throw new Error("請輸入配發的股數。");
      if (side === "dividend" && !isStockDividend(transactionForm.action) && transactionForm.price <= 0) throw new Error("請輸入股利金額。");

      const payload = normalizeTransactionDraft(transactionForm);
      if (transactionPreset?.id) {
        await updateRecord.mutateAsync({ ...payload, id: transactionPreset.id });
      } else {
        if (batchMode) {
          await Promise.all(batchAccounts.map(async (accId) => {
            const acc = eligibleAccounts.find(a => a.id === accId);
            return createRecord.mutateAsync({ ...payload, linkedAccountId: accId, currency: acc?.currency ?? payload.currency });
          }));
        } else {
          await createRecord.mutateAsync(payload);
        }
      }
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(errorMessage(error, "交易儲存失敗。"));
    }
  }

  async function enrichTransactionClassification(draft: InvestmentDraft) {
    try {
      const provider = new YahooFinanceProvider();
      const profiles = await provider.fetchAssetProfiles([draft.ticker]);
      const profile = profiles[draft.ticker.trim().toUpperCase()];
      if (!profile) throw new Error("No profile");
      setTransactionForm((current) =>
        current.ticker.trim().toUpperCase() === draft.ticker.trim().toUpperCase()
          ? { ...current, assetType: profile.assetType ?? current.assetType, sector: profile.sector ?? current.sector, industry: profile.industry ?? current.industry }
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

  let totalLabel = "Total cost";
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
      : side === "dividend" && isStockDividend(transactionForm.action) ? `+${formatNumber(qty || 0)} 股`
        : formatPreviewMoney(totalValue, currency);

  // T+2 settlement warning (TWD buys only).
  const cashDelta = calculateInvestmentCashDelta(normalizeTransactionDraft(transactionForm));
  const twdTopUpShortfall = selectedTransactionAccount && currency.toUpperCase() === "TWD" && side === "buy"
    ? Math.max(0, -(selectedTransactionAccount.balance + cashDelta))
    : 0;
  const tPlus2Date = addDays(transactionForm.date, 2);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: "min(520px, 100%)",
          background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)",
          display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 20, fontWeight: 600, letterSpacing: -0.02 }}>
            {mode === "snapshot" ? "建立目前部位" : title}
          </h2>
          <div style={{ flex: 1 }} />
          {!isEditingTransaction ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setMode(mode === "snapshot" ? "transaction" : "snapshot"); setMessage(""); }}
            >
              {mode === "snapshot" ? "改記一筆交易" : "匯入現有持倉"}
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉"><X size={16} /></Button>
        </div>

        {eligibleAccounts.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bank size={24} weight="duotone" />
            </div>
            <div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 600 }}>尚未建立投資帳戶</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                在開始記錄投資交易前，您需要先建立至少一個「投資種類」的帳戶。
              </p>
            </div>
            <Button render={<Link to="/accounts" onClick={onClose} />} className="mt-2">前往建立帳戶</Button>
          </div>
        ) : mode === "snapshot" ? (
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            <HoldingForm
              value={snapshotForm}
              onChange={setSnapshotForm}
              onSubmit={submitSnapshot}
              submitLabel={createHolding.isPending ? "儲存中…" : "儲存持倉"}
              accounts={accounts}
            />
            {message ? <div style={{ marginTop: 12 }}><StatusText>{message}</StatusText></div> : null}
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

            <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Ticker + quick chips */}
              <div>
                <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>Ticker / Symbol</label>
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
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                  <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>Date</label>
                  <input className="ns-input" type="datetime-local" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label className="ns-eyebrow">Account</label>
                    {!isEditingTransaction ? (
                      <label style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--ns-accent)" }}>
                        <Checkbox checked={batchMode} onCheckedChange={(checked) => { setBatchMode(checked === true); setBatchAccounts(transactionForm.linkedAccountId ? [transactionForm.linkedAccountId] : []); }} />
                        批次多帳戶
                      </label>
                    ) : null}
                  </div>
                  {batchMode ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflowY: "auto", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-sm)", padding: 8 }}>
                      {eligibleAccounts.map((a) => (
                        <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                          <Checkbox checked={batchAccounts.includes(a.id)} onCheckedChange={(checked) => {
                            if (checked) setBatchAccounts([...batchAccounts, a.id]);
                            else setBatchAccounts(batchAccounts.filter((id) => id !== a.id));
                          }} />
                          {a.name} ({a.currency})
                        </label>
                      ))}
                    </div>
                  ) : (
                    <select
                      className="ns-input"
                      style={{ appearance: "none" }}
                      value={transactionForm.linkedAccountId ?? ""}
                      onChange={(e) =>
                        setTransactionForm({
                          ...transactionForm,
                          linkedAccountId: e.target.value || null,
                          currency: eligibleAccounts.find((a) => a.id === e.target.value)?.currency ?? transactionForm.currency,
                        })
                      }
                    >
                      <option value="">— 選擇券商 —</option>
                      {eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Side-specific numeric fields */}
              {side === "split" ? (
                <div>
                  <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>拆股比例（1 股 → N 股）</label>
                  <NumberField
                    value={transactionForm.quantity}
                    onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })}
                    decimals={4}
                    placeholder="3"
                    style={NUM_INPUT_STYLE}
                  />
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                    輸入 3 = 3-for-1（持股 ×3、均價 ÷3、總成本不變）；小於 1 為反向拆股（例 0.5 = 2 併 1）。無手續費。
                  </div>
                </div>
              ) : side === "dividend" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* 現金股利 vs 股票股利(配股) sub-toggle */}
                  <ToggleGroup
                    variant="outline"
                    className="w-full"
                    value={[isStockDividend(transactionForm.action) ? "stock" : "cash"]}
                    onValueChange={(value) => {
                      const next = value[0];
                      if (next) setTransactionForm((c) => normalizeTransactionDraft({ ...c, action: next === "stock" ? "stockDividend" : "cashDividend" }));
                    }}
                  >
                    <ToggleGroupItem value="cash" className={SEG_ITEM_CLASS}>現金股利</ToggleGroupItem>
                    <ToggleGroupItem value="stock" className={SEG_ITEM_CLASS}>股票股利 (配股)</ToggleGroupItem>
                  </ToggleGroup>
                  {isStockDividend(transactionForm.action) ? (
                    <div>
                      <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>配發股數</label>
                      <NumberField value={transactionForm.quantity} onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })} decimals={4} placeholder="100" style={NUM_INPUT_STYLE} />
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                        配股不涉及現金：股數增加、總成本不變，因此平均成本會下降。
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>股利金額（總額）</label>
                        <NumberField value={transactionForm.price} onChange={(price) => setTransactionForm({ ...transactionForm, price })} decimals={2} placeholder="3,500" style={NUM_INPUT_STYLE} />
                      </div>
                      <div>
                        <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>代扣稅 / 手續費</label>
                        <NumberField value={transactionForm.fee} onChange={(fee) => setTransactionForm({ ...transactionForm, fee })} placeholder="0" style={NUM_INPUT_STYLE} />
                      </div>
                    </div>
                  )}
                </div>
              ) : side === "reduction" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>被註銷股數</label>
                    <NumberField value={transactionForm.quantity} onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })} decimals={4} placeholder="20" style={NUM_INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>每股退回現金</label>
                    <NumberField value={transactionForm.price} onChange={(price) => setTransactionForm({ ...transactionForm, price })} decimals={2} placeholder="10" style={NUM_INPUT_STYLE} />
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                      現金減資填每股退回金額；彌補虧損減資（不退現金）填 0。
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  <div>
                    <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>Shares</label>
                    <NumberField value={transactionForm.quantity} onChange={(quantity) => setTransactionForm({ ...transactionForm, quantity })} decimals={4} placeholder="100" style={NUM_INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>Price per share</label>
                    <NumberField value={transactionForm.price} onChange={(price) => setTransactionForm({ ...transactionForm, price })} decimals={2} placeholder="1,042.00" style={NUM_INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>Commission / fee</label>
                    <NumberField value={transactionForm.fee} onChange={(fee) => setTransactionForm({ ...transactionForm, fee })} decimals={2} placeholder="Optional" style={NUM_INPUT_STYLE} />
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>Note</label>
                <input className="ns-input" value={transactionForm.note} onChange={(e) => setTransactionForm({ ...transactionForm, note: e.target.value })} placeholder="Optional" />
              </div>

              {/* FIFO impact preview */}
              <Card className="gap-0 rounded-[var(--ns-r-md)] border-[var(--ns-accent)] bg-[var(--ns-accent-soft)] p-4 shadow-none before:hidden">
                <div className="ns-eyebrow" style={{ marginBottom: 10, color: "var(--ns-accent)" }}>部位影響預覽</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                  <div><span className="muted">{totalLabel}</span><br /><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{side === "split" ? `×${formatNumber(totalValue)}` : side === "dividend" && isStockDividend(transactionForm.action) ? `+${formatQuantity(totalValue)} 股` : formatPreviewMoney(totalValue, currency)}</span></div>
                  <div><span className="muted">新平均成本</span><br /><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{formatPreviewMoney(newAvg, currency)}</span></div>
                  <div><span className="muted">新部位股數</span><br /><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{formatQuantity(newQty)} 股</span></div>
                  <div><span className="muted">新市值</span><br /><span className="num pos" style={{ fontSize: 16, fontWeight: 500 }}>{formatPreviewMoney(newMarketValue, currency)}</span></div>
                </div>
              </Card>

              {twdTopUpShortfall > 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--ns-warn)" }}>
                  台股 T+2 提醒：預估交割後需補 {formatNumber(twdTopUpShortfall)} TWD，請在 {tPlus2Date || "交割日前"} 前補款。
                </div>
              ) : null}
              {message ? <StatusText>{message}</StatusText> : null}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 10 }}>
              <Button variant="outline" className="flex-1" onClick={onClose}>取消</Button>
              <Button
                className="flex-[2]"
                onClick={submitTransaction}
                loading={createRecord.isPending || updateRecord.isPending}
              >
                {(createRecord.isPending || updateRecord.isPending) ? "儲存中…" : isEditingTransaction ? "儲存交易" : batchMode ? `批次建立 ${batchAccounts.length} 筆交易` : `${SIDE_CONFIRM[side]} · ${confirmAmount}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
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
