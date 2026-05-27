import { ChartLineUp, StackSimple, X } from "@phosphor-icons/react";
import { DateTimeField } from "../components/DateTimeField";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Field, SelectInput, TextInput } from "../components/Field";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { TickerSearchField } from "../components/TickerSearchField";
import { useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft, PortfolioAssetDraft } from "../data/repositories";
import { calculateInvestmentCashDelta, formatNumber, nowAsDatetimeLocal, type Account, type InvestmentAction, type PortfolioAsset } from "../domain";
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

  const currentHoldingQty = useMemo(() => {
    if (transactionForm.action !== "buy" && transactionForm.action !== "sell") return null;
    const ticker = transactionForm.ticker.trim().toUpperCase();
    if (!ticker) return null;
    const match = portfolioAssets.find(
      (a) => a.ticker === ticker && a.deletedAt === null && a.totalQuantity > 0 &&
        (a.holdingSource === "transactions" || a.accountId === transactionForm.linkedAccountId),
    );
    return match ? match.totalQuantity : null;
  }, [portfolioAssets, transactionForm.ticker, transactionForm.action, transactionForm.linkedAccountId]);

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
          className="h-full w-full border-l shadow-2xl animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
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

          <div className="px-5 pt-4">
            <SegmentedControl
              value={mode}
              onChange={(next) => {
                if (isEditingTransaction) return;
                setMode(next);
                setMessage("");
              }}
              options={[
                { value: "snapshot", label: "建立目前部位", icon: <StackSimple size={16} /> },
                { value: "transaction", label: "記一筆交易", icon: <ChartLineUp size={16} /> },
              ]}
            />
          </div>

          <div className="h-[calc(100%-118px)] overflow-y-auto px-5 pb-6 pt-4">
            {mode === "snapshot" ? (
              <div>
                <HoldingForm
                  value={snapshotForm}
                  onChange={setSnapshotForm}
                  onSubmit={submitSnapshot}
                  submitLabel={createHolding.isPending ? "儲存中…" : "儲存持倉"}
                  accounts={accounts}
                  onTickerSelected={(draft) => void enrichSnapshotClassification(draft)}
                />
                {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="種類">
                    <SelectInput
                      value={transactionForm.action}
                      onChange={(event) =>
                        setTransactionForm((current) => normalizeTransactionDraft({
                          ...current,
                          action: event.target.value as InvestmentAction,
                        }))
                      }
                    >
                      {actions.map((action) => (
                        <option key={action} value={action}>
                          {actionLabels[action]}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <DateTimeField
                    label="日期 + 時間"
                    value={transactionForm.date}
                    onChange={(value) => setTransactionForm({ ...transactionForm, date: value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                  <Field label="Ticker">
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
                  </Field>
                  <Field label="幣別">
                    <TextInput
                      value={selectedTransactionAccount?.currency ?? transactionForm.currency}
                      disabled={Boolean(selectedTransactionAccount)}
                      onChange={(event) =>
                        setTransactionForm({ ...transactionForm, currency: event.target.value.toUpperCase() })
                      }
                    />
                  </Field>
                </div>
                <Field label="名稱">
                  <TextInput
                    value={transactionForm.name}
                    onChange={(event) => setTransactionForm({ ...transactionForm, name: event.target.value })}
                    placeholder="元大台灣50"
                  />
                </Field>
                <Field label="連動帳戶 / 券商">
                  <SelectInput
                    value={transactionForm.linkedAccountId ?? ""}
                    onChange={(event) =>
                      setTransactionForm({
                        ...transactionForm,
                        linkedAccountId: event.target.value || null,
                        currency: eligibleAccounts.find((account) => account.id === event.target.value)?.currency ?? transactionForm.currency,
                      })
                    }
                  >
                    <option value="">— 選擇券商 —</option>
                    {eligibleAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.currency})
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label={transactionForm.action === "cashDividend" ? "股利金額" : "價格"}>
                    <TextInput
                      type="number"
                      value={transactionForm.price}
                      onChange={(event) => setTransactionForm({ ...transactionForm, price: Number(event.target.value) })}
                    />
                  </Field>
                  {transactionForm.action === "cashDividend" ? <div /> : (
                    <Field label="數量">
                      <TextInput
                        type="number"
                        value={transactionForm.quantity}
                        onChange={(event) =>
                          setTransactionForm({ ...transactionForm, quantity: Number(event.target.value) })
                        }
                      />
                    </Field>
                  )}
                  <Field label="手續費">
                    <TextInput
                      type="number"
                      value={transactionForm.fee}
                      onChange={(event) => setTransactionForm({ ...transactionForm, fee: Number(event.target.value) })}
                    />
                  </Field>
                </div>
                {currentHoldingQty !== null ? (
                  <p className="text-xs" style={{ color: "var(--ns-muted)" }}>
                    目前持倉：{formatNumber(currentHoldingQty)} 股
                  </p>
                ) : null}
                <Field label="備註">
                  <TextInput
                    value={transactionForm.note}
                    onChange={(event) => setTransactionForm({ ...transactionForm, note: event.target.value })}
                  />
                </Field>
                {twdTopUpShortfall > 0 ? (
                  <p className="text-sm" style={{ color: "var(--ns-warn)" }}>
                    台股 T+2 提醒：預估交割後需補 {formatNumber(twdTopUpShortfall)} TWD，請在 {tPlus2Date || "交割日前"} 前補款。
                  </p>
                ) : null}
                {message ? <StatusText>{message}</StatusText> : null}
                <div className="flex gap-2">
                  <ActionButton onClick={submitTransaction} disabled={createRecord.isPending || updateRecord.isPending}>
                    {(createRecord.isPending || updateRecord.isPending)
                      ? "儲存中…"
                      : isEditingTransaction
                        ? "儲存交易"
                        : "新增交易"}
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={onClose}>
                    取消
                  </ActionButton>
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
