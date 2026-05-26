import { ChartLineUp, StackSimple, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Field, SelectInput, TextInput } from "../components/Field";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { TickerSearchField } from "../components/TickerSearchField";
import { useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft, PortfolioAssetDraft } from "../data/repositories";
import { calculateInvestmentCashDelta, formatNumber, todayInTimezone, type Account, type InvestmentAction } from "../domain";
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

type Mode = "snapshot" | "transaction";

function emptyTransactionDraft(timezone: string): InvestmentDraft {
  return {
    ticker: "",
    name: "",
    currency: "TWD",
    linkedAccountId: null,
    date: todayInTimezone(timezone),
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

export function HoldingsAddSheet({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
}) {
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyHoldingDraft = useMemo(() => makeEmptyHoldingDraft(timezone), [timezone]);
  const [mode, setMode] = useState<Mode>("snapshot");
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

  // Reset state every time the sheet opens so it never carries half-typed values
  // across separate add sessions.
  useEffect(() => {
    if (!open) return;
    setSnapshotForm(emptyHoldingDraft);
    setTransactionForm(emptyTransactionDraft(timezone));
    setMessage("");
    setMode("snapshot");
  }, [open, emptyHoldingDraft, timezone]);

  if (!open) return null;

  async function submitSnapshot() {
    setMessage("");
    try {
      if (!snapshotForm.ticker.trim()) throw new Error("請輸入 ticker。");
      if (!snapshotForm.accountId) throw new Error("請選擇券商 / 帳戶。");
      await createHolding.mutateAsync(snapshotForm);
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
      await createRecord.mutateAsync(normalizeTransactionDraft(transactionForm));
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg border shadow-xl"
        style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
          <h2 className="text-lg font-semibold">新增</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-5 pt-4">
          <SegmentedControl
            value={mode}
            onChange={(next) => {
              setMode(next);
              setMessage("");
            }}
            options={[
              { value: "snapshot", label: "建立目前部位", icon: <StackSimple size={16} /> },
              { value: "transaction", label: "記一筆交易", icon: <ChartLineUp size={16} /> },
            ]}
          />
          <p className="mt-2 text-xs" style={{ color: "var(--ns-muted)" }}>
            {mode === "snapshot"
              ? "建立目前部位：直接填入現有股數與平均成本，適合既有庫存。"
              : "記一筆交易：逐筆記錄買賣 / 股利，系統會自動更新均價與庫存。"}
          </p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-4">
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
                <Field label="日期">
                  <TextInput
                    type="date"
                    value={transactionForm.date}
                    onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })}
                  />
                </Field>
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
                <ActionButton onClick={submitTransaction} disabled={createRecord.isPending}>
                  {createRecord.isPending ? "儲存中…" : "儲存交易"}
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
  );
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
