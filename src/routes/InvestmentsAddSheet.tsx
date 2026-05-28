import { ChartLineUp, StackSimple, X, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Field, SelectInput, TextInput } from "../components/Field";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { TickerSearchField } from "../components/TickerSearchField";
import { DatePicker } from "../components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft, PortfolioAssetDraft } from "../data/repositories";
import { calculateInvestmentCashDelta, formatNumber, nowAsDatetimeLocal, todayInTimezone, type Account, type InvestmentAction, type PortfolioAsset } from "../domain";
import { YahooFinanceProvider } from "../features/market-data/yahooFinanceProvider";
import { useUiPreferences } from "../state/uiPreferences";

const actions: InvestmentAction[] = ["buy", "sell", "cashDividend", "stockDividend", "capitalReduction", "stockSplit"];
const actionLabels: Record<InvestmentAction, string> = {
  buy: "買進",
  sell: "賣出",
  cashDividend: "現金股利",
  stockDividend: "股票股利",
  capitalReduction: "減資",
  stockSplit: "股票分割",
};

export type InvestmentEntryMode = "snapshot" | "transaction";

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

function normalizeTransactionDraft(input: InvestmentDraft): InvestmentDraft {
  if (input.action === "cashDividend") {
    return { ...input, quantity: 0 };
  }
  return input;
}

export function InvestmentEntryDrawer({
  open,
  onClose,
  accounts,
  portfolioAssets = [],
  title = "新增",
  initialMode = "snapshot",
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
  const { investments } = useFinanceData();
  const recordRows = investments.data ?? [];
  const recentTickers = useMemo(() => {
    const tickers = recordRows
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .map((r: any) => portfolioAssets.find(a => a.id === r.assetId)?.ticker)
      .filter(Boolean) as string[];
    return Array.from(new Set(tickers)).slice(0, 5);
  }, [recordRows, portfolioAssets]);
  const defaultTickers = ["2330.TW", "0050.TW", "AAPL", "VTI", "VWRA"];
  const displayTickers = recentTickers.length > 0 ? recentTickers : defaultTickers;

  const [message, setMessage] = useState("");

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

  const currentAsset = useMemo(() => {
    if (transactionForm.action !== "buy" && transactionForm.action !== "sell") return null;
    const ticker = transactionForm.ticker.trim().toUpperCase();
    if (!ticker) return null;
    return portfolioAssets.find(
      (a) => a.ticker === ticker && a.deletedAt === null &&
        (a.holdingSource === "transactions" || a.accountId === transactionForm.linkedAccountId),
    ) ?? null;
  }, [portfolioAssets, transactionForm.ticker, transactionForm.action, transactionForm.linkedAccountId]);

  const previewInfo = useMemo(() => {
    const isBuy = transactionForm.action === "buy";
    const isSell = transactionForm.action === "sell";
    if (!isBuy && !isSell) return null;

    const currentQty = currentAsset?.totalQuantity || 0;
    const currentCost = currentAsset?.averageCost || 0;
    const addedQty = isBuy ? transactionForm.quantity : -transactionForm.quantity;
    const newQty = Math.max(0, currentQty + addedQty);
    
    let newAvgCost = currentCost;
    if (isBuy && newQty > 0) {
      const totalCostBasis = currentQty * currentCost + (transactionForm.quantity * (transactionForm.price || 0) + (transactionForm.fee || 0));
      newAvgCost = totalCostBasis / newQty;
    }

    return {
      currentQty,
      newQty,
      newAvgCost,
      newMarketValue: newQty * (transactionForm.price || 0),
    };
  }, [currentAsset, transactionForm.action, transactionForm.quantity, transactionForm.price, transactionForm.fee]);

  if (!open) return null;

  async function submitSnapshot() {
    setMessage("");
    try {
      if (!snapshotForm.ticker.trim()) throw new Error("請輸入 ticker。");
      if (!snapshotForm.accountId) throw new Error("請選擇券商 / 帳戶。");
      await createHolding.mutateAsync(snapshotForm);
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "持倉儲存失敗。");
    }
  }

  async function submitTransaction() {
    setMessage("");
    try {
      if (!transactionForm.ticker.trim()) throw new Error("請輸入 ticker。");
      if (!transactionForm.linkedAccountId) throw new Error("請選擇連動帳戶。");
      const payload = normalizeTransactionDraft(transactionForm);
      if (transactionPreset?.id) {
        await updateRecord.mutateAsync({ ...payload, id: transactionPreset.id });
      } else {
        await createRecord.mutateAsync(payload);
      }
      onSubmitted?.();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "交易儲存失敗。");
    }
  }

  const eligibleAccounts = accounts.filter(
    (account) => account.deletedAt === null && account.type === "investment",
  );
  const selectedTransactionAccount = eligibleAccounts.find((account) => account.id === transactionForm.linkedAccountId) ?? null;
  const transactionCashDelta = calculateInvestmentCashDelta(normalizeTransactionDraft(transactionForm));
  const twdTopUpShortfall = selectedTransactionAccount && selectedTransactionAccount.currency.toUpperCase() === "TWD" && transactionForm.action === "buy"
    ? Math.max(0, -(selectedTransactionAccount.balance + transactionCashDelta))
    : 0;
  const tPlus2Date = addDays(transactionForm.date, 2);

  async function enrichSnapshotClassification(draft: PortfolioAssetDraft) {
    try {
      const provider = new YahooFinanceProvider();
      const profiles = await provider.fetchAssetProfiles([draft.ticker]);
      const profile = profiles[draft.ticker.trim().toUpperCase()];
      if (!profile) throw new Error("No profile");
      setSnapshotForm((current) =>
        current.ticker.trim().toUpperCase() === draft.ticker.trim().toUpperCase()
          ? { ...current, assetType: profile.assetType ?? current.assetType, sector: profile.sector ?? current.sector, industry: profile.industry ?? current.industry }
          : current,
      );
    } catch {
      setMessage("未能取得分類，請手動填入。");
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

  return (
    <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose}>
      <div
        className="absolute inset-y-0 right-0 flex h-full w-full sm:w-[680px] lg:w-[740px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="h-full w-full flex flex-col border-l shadow-2xl animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
          style={{ background: "var(--ns-panel-bg)", borderColor: "var(--ns-panel-border)" }}
        >
          <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--ns-panel-border)" }}>
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-xs" style={{ color: "var(--ns-muted)" }}>
                {isEditingTransaction
                  ? "調整既有交易，會自動重算持倉成本。"
                  : mode === "snapshot"
                    ? "直接建立目前持倉，適合一次導入既有部位。"
                    : "逐筆記錄買賣 / 股利，系統會自動更新持倉。"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-md outline-none transition hover:opacity-70"
              aria-label="關閉"
            >
              <X size={18} />
            </button>
          </header>

          {!isEditingTransaction && (
            <div className="px-5 pt-4">
              <SegmentedControl
                value={mode}
                onChange={(m) => setMode(m as InvestmentEntryMode)}
                options={[
                  { value: "transaction", label: "Add Transaction", icon: null },
                  { value: "snapshot", label: "Add Holdings", icon: null },
                ]}
              />
            </div>
          )}

          {mode === "transaction" && (
            <div className="px-5 pt-4">
              <div className="ns-seg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 16 }}>
                {["buy", "sell", "cashDividend", "stockSplit"].map((act) => (
                  <button
                    key={act}
                    aria-selected={transactionForm.action === act}
                    onClick={() => setTransactionForm((cur) => normalizeTransactionDraft({ ...cur, action: act as InvestmentAction }))}
                    style={{ textAlign: "center" }}
                  >
                    {act === "buy" ? "Buy" : act === "sell" ? "Sell" : act === "cashDividend" ? "Dividend" : "Split"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {mode === "snapshot" ? (
              <div className="mt-4">
                <HoldingForm
                  value={snapshotForm}
                  onChange={setSnapshotForm}
                  onSubmit={submitSnapshot}
                  submitLabel={createHolding.isPending ? "新增中..." : "新增持倉"}
                  accounts={accounts}
                />
                {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}
              </div>
            ) : (
              <div className="grid gap-4">
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>TICKER / SYMBOL</div>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: 11, color: "var(--ns-fg-muted)" }}>
                    <MagnifyingGlass size={16} />
                  </span>
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
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {displayTickers.map((t) => (
                    <button
                      key={t}
                      className="ns-pill"
                      style={{ background: "transparent", border: "1px solid var(--ns-border)", padding: "4px 10px", fontSize: 11.5, cursor: "pointer" }}
                      onClick={() => setTransactionForm({ ...transactionForm, ticker: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>DATE</div>
                  <input
                    type="datetime-local"
                    value={transactionForm.date.slice(0, 16)}
                    onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                    className="w-full h-10 ns-input"
                  />
                </div>
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>ACCOUNT</div>
                  <Select
                    value={transactionForm.linkedAccountId ?? ""}
                    onValueChange={(val) =>
                      setTransactionForm({
                        ...transactionForm,
                        linkedAccountId: val || null,
                        currency: eligibleAccounts.find((account) => account.id === val)?.currency ?? transactionForm.currency,
                      })
                    }
                  >
                    <SelectTrigger className="w-full h-10 ns-input" style={{ background: "transparent" }}>
                      <SelectValue placeholder="— 選擇券商 —">
                        {transactionForm.linkedAccountId ? eligibleAccounts.find(a => a.id === transactionForm.linkedAccountId)?.name : "— 選擇券商 —"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— 選擇券商 —</SelectItem>
                      {eligibleAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {transactionForm.action !== "cashDividend" && transactionForm.action !== "stockSplit" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>SHARES</div>
                    <input
                      type="number"
                      className="ns-input"
                      value={transactionForm.quantity || ""}
                      onChange={(event) => setTransactionForm({ ...transactionForm, quantity: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>PRICE PER SHARE</div>
                    <input
                      type="number"
                      className="ns-input"
                      value={transactionForm.price || ""}
                      onChange={(event) => setTransactionForm({ ...transactionForm, price: Number(event.target.value) })}
                    />
                  </div>
                </div>
              )}

              {transactionForm.action === "cashDividend" && (
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>DIVIDEND AMOUNT</div>
                  <input
                    type="number"
                    className="ns-input"
                    value={transactionForm.price || ""}
                    onChange={(event) => setTransactionForm({ ...transactionForm, price: Number(event.target.value) })}
                  />
                </div>
              )}

              {transactionForm.action === "stockSplit" && (
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>SPLIT RATIO (分割比例)</div>
                  <input
                    type="number"
                    className="ns-input"
                    value={transactionForm.quantity || ""}
                    onChange={(event) => setTransactionForm({ ...transactionForm, quantity: Number(event.target.value) })}
                  />
                  <div className="muted mt-2 text-xs">範例：1 股變 2 股輸入 2，1 股變 3 股輸入 3。</div>
                </div>
              )}

              {transactionForm.action !== "stockSplit" && (
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>COMMISSION / FEE</div>
                  <input
                    type="number"
                    className="ns-input"
                    value={transactionForm.fee || ""}
                    onChange={(event) => setTransactionForm({ ...transactionForm, fee: Number(event.target.value) })}
                  />
                </div>
              )}

              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 8, letterSpacing: 1.5 }}>NOTE</div>
                <input
                  className="ns-input"
                  placeholder="Optional"
                  value={transactionForm.note}
                  onChange={(event) => setTransactionForm({ ...transactionForm, note: event.target.value })}
                />
              </div>

              {(transactionForm.action === "buy" || transactionForm.action === "sell") && (
                <div style={{ background: "rgba(164, 219, 108, 0.1)", border: "1px solid var(--ns-chart-1)", borderRadius: 12, padding: 18, marginTop: 8 }}>
                  <div className="ns-eyebrow" style={{ color: "var(--ns-chart-1)", marginBottom: 14 }}>FIFO IMPACT PREVIEW</div>
                  <div className="grid grid-cols-2 gap-y-4">
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Total cost</div>
                      <div className="num" style={{ fontSize: 16, fontWeight: 500 }}>NT${formatNumber(transactionForm.quantity * transactionForm.price + transactionForm.fee)}</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>New avg cost (FIFO)</div>
                      <div className="num" style={{ fontSize: 16, fontWeight: 500 }}>
                        {previewInfo?.newAvgCost ? `NT$${formatNumber(previewInfo.newAvgCost)}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>New position</div>
                      <div className="num" style={{ fontSize: 16, fontWeight: 500 }}>
                        {formatNumber(previewInfo?.newQty || 0)} 股
                      </div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>New market value</div>
                      <div className="num" style={{ fontSize: 16, fontWeight: 500 }}>
                        {previewInfo?.newMarketValue ? `NT$${formatNumber(previewInfo.newMarketValue)}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {message ? <StatusText>{message}</StatusText> : null}

              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <button
                  style={{ padding: "14px 24px", borderRadius: "var(--ns-r-md)", background: "transparent", color: "var(--ns-fg)", border: "none", cursor: "pointer", fontWeight: 500, fontSize: 14 }}
                  onClick={onClose}
                >
                  取消
                </button>
                <button
                  style={{ flex: 1, padding: "14px 24px", borderRadius: "var(--ns-r-md)", background: "var(--ns-chart-1)", color: "#000", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
                  onClick={submitTransaction}
                  disabled={createRecord.isPending || updateRecord.isPending}
                >
                  {createRecord.isPending || updateRecord.isPending ? "處理中..." : `✓ 確認${transactionForm.action === "buy" ? "買入" : transactionForm.action === "sell" ? "賣出" : "送出"} · NT$ ${formatNumber(transactionForm.quantity * transactionForm.price + transactionForm.fee)}`}
                </button>
              </div>
              </div>
            )}
          </div>
        </div>
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
