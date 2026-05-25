import { ChartLineUp, PencilSimple, PlusCircle, StackSimple, Trash, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextInput } from "../components/Field";
import { HoldingForm, makeEmptyHoldingDraft } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { TickerSearchField } from "../components/TickerSearchField";
import { downloadCsv, exportInvestmentCsv, parseInvestmentCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { InvestmentDraft, PortfolioAssetDraft } from "../data/repositories";
import { todayInTimezone } from "../domain";
import type { InvestmentAction, InvestmentRecord } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

type EntryMode = "transaction" | "holding";
const actions: InvestmentAction[] = ["buy", "sell", "cashDividend", "stockDividend", "capitalReduction", "stockSplit"];
const actionLabels: Record<InvestmentAction, string> = {
  buy: "買進",
  sell: "賣出",
  cashDividend: "現金股利",
  stockDividend: "股票股利",
  capitalReduction: "減資",
  stockSplit: "股票分割",
};

function makeEmptyInvestment(timezone: string): InvestmentDraft {
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
  };
}

export function TransactionsRoute() {
  const { accounts, assets, investments } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyInvestment = useMemo(() => makeEmptyInvestment(timezone), [timezone]);
  const emptyHoldingDraft = useMemo(() => makeEmptyHoldingDraft(timezone), [timezone]);
  const [mode, setMode] = useState<EntryMode>("transaction");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InvestmentDraft>(emptyInvestment);
  const [holdingForm, setHoldingForm] = useState<PortfolioAssetDraft>(emptyHoldingDraft);
  const [preview, setPreview] = useState<ImportPreview<InvestmentDraft> | null>(null);
  const [message, setMessage] = useState("");
  const createRecord = useRepositoryMutation((repository, input: InvestmentDraft) => repository.createInvestmentRecord(input), ["investments", "assets"]);
  const updateRecord = useRepositoryMutation((repository, input: InvestmentDraft & { id: string }) => repository.updateInvestmentRecord(input.id, input), ["investments", "assets"]);
  const deleteRecord = useRepositoryMutation((repository, id: string) => repository.deleteInvestmentRecord(id), ["investments", "assets"]);
  const importRecords = useRepositoryMutation((repository, input: InvestmentDraft[]) => repository.importInvestmentRecords(input), ["investments", "assets"]);
  const createHolding = useRepositoryMutation((repository, input: PortfolioAssetDraft) => repository.createManualHolding(input), ["assets"]);

  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const accountRows = accounts.data ?? [];
  const assetFor = (id: string) => assetRows.find((asset) => asset.id === id);

  async function submit() {
    setMessage("");
    try {
      if (!form.ticker.trim()) throw new Error("請輸入 ticker。");
      if (editingId) await updateRecord.mutateAsync({ ...form, id: editingId });
      else await createRecord.mutateAsync(form);
      setForm(emptyInvestment);
      setEditingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "交易儲存失敗。");
    }
  }

  async function submitHolding() {
    setMessage("");
    try {
      if (!holdingForm.ticker.trim()) throw new Error("請輸入 ticker。");
      await createHolding.mutateAsync(holdingForm);
      setHoldingForm(emptyHoldingDraft);
      setMode("transaction");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "持倉儲存失敗。");
    }
  }

  function startEdit(record: InvestmentRecord) {
    const asset = assetFor(record.assetId);
    setEditingId(record.id);
    setForm({
      ticker: asset?.ticker ?? "",
      name: asset?.name ?? "",
      currency: asset?.currency ?? "TWD",
      linkedAccountId: record.linkedAccountId,
      date: record.date,
      action: record.action,
      price: record.price,
      quantity: record.quantity,
      fee: record.fee,
      note: record.note,
    });
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseInvestmentCsv(await file.text()));
    event.target.value = "";
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="投資交易" description="逐筆記錄買賣與股利，或直接建立現有持倉作為起點。" />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title={mode === "holding" ? "直接建立持倉" : editingId ? "編輯交易" : "新增交易"}>
          <div className="mb-4">
            <SegmentedControl
              value={mode}
              onChange={(nextMode) => { setMode(nextMode); setMessage(""); }}
              options={[
                { value: "transaction", label: "逐筆交易", icon: <ChartLineUp size={16} /> },
                { value: "holding", label: "直接建立持倉", icon: <StackSimple size={16} /> },
              ]}
            />
          </div>
          {mode === "holding" ? (
            <div>
              <HoldingForm value={holdingForm} onChange={setHoldingForm} onSubmit={submitHolding} submitLabel="新增持倉" />
              {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}
            </div>
          ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
              <Field label="Ticker">
                <TickerSearchField
                  value={form.ticker}
                  onChange={(ticker) => setForm({ ...form, ticker })}
                  onSelect={(result) => setForm({
                    ...form,
                    ticker: result.symbol.toUpperCase(),
                    name: result.name || result.symbol,
                    currency: result.currency || form.currency,
                  })}
                />
              </Field>
              <Field label="幣別"><TextInput value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></Field>
            </div>
            <Field label="名稱"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="元大台灣50" /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="日期"><TextInput type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
              <Field label="動作">
                <SelectInput value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value as InvestmentAction })}>
                  {actions.map((action) => <option key={action} value={action}>{actionLabels[action]}</option>)}
                </SelectInput>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <Field label="價格"><TextInput type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></Field>
              <Field label="數量"><TextInput type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></Field>
              <Field label="手續費"><TextInput type="number" value={form.fee} onChange={(event) => setForm({ ...form, fee: Number(event.target.value) })} /></Field>
            </div>
            <Field label="連動帳戶">
              <SelectInput value={form.linkedAccountId ?? ""} onChange={(event) => setForm({ ...form, linkedAccountId: event.target.value || null })}>
                <option value="">不連動</option>
                {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="備註"><TextInput value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
            {message ? <StatusText>{message}</StatusText> : null}
            <div className="flex gap-2">
              <ActionButton onClick={submit}>{editingId ? "儲存" : "新增"}</ActionButton>
              {editingId ? <ActionButton variant="secondary" onClick={() => { setEditingId(null); setForm(emptyInvestment); }}>取消</ActionButton> : null}
            </div>
          </div>
          )}
        </Card>
        <Card
          title="交易紀錄"
          action={
            <div className="flex gap-2">
              <ActionButton variant="secondary" onClick={() => downloadCsv("northstar-investments.csv", exportInvestmentCsv(recordRows, assetFor))}>匯出 CSV</ActionButton>
              <label>
                <input className="hidden" type="file" accept=".csv,text/csv" onChange={handleCsv} />
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--ns-border)" }}><UploadSimple size={16} />匯入 CSV</span>
              </label>
            </div>
          }
        >
          {preview ? (
            <div className="mb-4 rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
              <div className="font-semibold">匯入預覽：{preview.valid.length} valid / {preview.invalid.length} invalid</div>
              {preview.invalid.map((item) => <div key={item.row} className="text-sm" style={{ color: "var(--ns-negative)" }}>Row {item.row}: {item.reason}</div>)}
              <div className="mt-3 flex gap-2">
                <ActionButton onClick={async () => { await importRecords.mutateAsync(preview.valid.map((item) => item.value)); setPreview(null); }}>確認匯入</ActionButton>
                <ActionButton variant="secondary" onClick={() => setPreview(null)}>取消</ActionButton>
              </div>
            </div>
          ) : null}
          {recordRows.length === 0 ? (
            <EmptyState
              icon={<PlusCircle size={24} weight="duotone" />}
              title="還沒有投資交易"
              description="如果你已有持倉，可以先用左側的直接建立持倉；之後新增買賣紀錄時會自動計算平均成本。"
            />
          ) : (
          <div className="space-y-3">
            {recordRows.map((record) => {
              const asset = assetFor(record.assetId);
              return (
                <div key={record.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <ChartLineUp size={22} weight="duotone" style={{ color: "var(--ns-accent)" }} />
                      <div>
                        <div className="font-semibold">{asset?.ticker ?? record.assetId}</div>
                        <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{record.date} · {actionLabels[record.action]}</div>
                      </div>
                    </div>
                    <div className="tabular text-right">
                      <div>{record.quantity} × {record.price}</div>
                      <div className="mt-2 flex flex-wrap justify-start gap-2 sm:justify-end">
                        <ActionButton variant="secondary" onClick={() => startEdit(record)}><PencilSimple size={16} />編輯</ActionButton>
                        <ActionButton variant="danger" onClick={() => deleteRecord.mutate(record.id)}><Trash size={16} />刪除</ActionButton>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </Card>
      </div>
    </div>
  );
}
