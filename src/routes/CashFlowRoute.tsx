import { ArrowsLeftRight, PencilSimple, Receipt, Trash, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Field, SelectInput, TextInput } from "../components/Field";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { LedgerDraft, TransferDraft } from "../data/repositories";
import { evaluateAmountExpression } from "../domain";
import type { LedgerTransaction } from "../domain";

type CashMode = "single" | "transfer";

const today = new Date().toISOString().slice(0, 10);

const emptyLedger: LedgerDraft = {
  accountId: "",
  date: today,
  amount: -100,
  currency: "TWD",
  category: "餐飲",
  note: "",
};

const emptyTransfer: TransferDraft = {
  date: today,
  sourceAccountId: "",
  destinationAccountId: "",
  sourceCurrency: "TWD",
  destinationCurrency: "TWD",
  sourceAmount: 1000,
  destinationAmount: 1000,
  note: "",
};

export function CashFlowRoute() {
  const { accounts, ledger } = useFinanceData();
  const [mode, setMode] = useState<CashMode>("single");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  const [amountExpression, setAmountExpression] = useState(String(emptyLedger.amount));
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");

  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const accountName = (id: string) => accountRows.find((account) => account.id === id)?.name ?? id;
  const accountIdFor = (nameOrId: string) => accountRows.find((account) => account.id === nameOrId || account.name === nameOrId)?.id;
  const groupedRows = useMemo(() => groupLedgerRows(ledgerRows), [ledgerRows]);

  const createLedger = useRepositoryMutation((repository, input: LedgerDraft) => repository.createLedgerTransaction(input), ["ledger", "accounts"]);
  const updateLedger = useRepositoryMutation((repository, input: LedgerDraft & { id: string }) => repository.updateLedgerTransaction(input.id, input), ["ledger", "accounts"]);
  const deleteLedger = useRepositoryMutation((repository, id: string) => repository.deleteLedgerTransaction(id), ["ledger", "accounts"]);
  const createTransfer = useRepositoryMutation((repository, input: TransferDraft) => repository.createTransfer(input), ["ledger", "accounts"]);
  const importLedger = useRepositoryMutation((repository, input: LedgerDraft[]) => repository.importLedgerTransactions(input), ["ledger", "accounts"]);

  function syncAccountDefaults(accountId: string) {
    const account = accountRows.find((item) => item.id === accountId);
    if (account) setLedgerForm((current) => ({ ...current, accountId, currency: account.currency }));
  }

  async function submitSingle() {
    setMessage("");
    try {
      const amount = evaluateAmountExpression(amountExpression);
      const payload = { ...ledgerForm, amount };
      if (!payload.accountId) throw new Error("請選擇帳戶。");
      if (editingId) await updateLedger.mutateAsync({ ...payload, id: editingId });
      else await createLedger.mutateAsync(payload);
      setLedgerForm(emptyLedger);
      setAmountExpression(String(emptyLedger.amount));
      setEditingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "收支儲存失敗。");
    }
  }

  async function submitTransfer() {
    setMessage("");
    try {
      if (!transferForm.sourceAccountId || !transferForm.destinationAccountId) throw new Error("請選擇來源和目標帳戶。");
      await createTransfer.mutateAsync(transferForm);
      setTransferForm(emptyTransfer);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轉帳儲存失敗。");
    }
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(parseLedgerCsv(await file.text(), accountIdFor));
    event.target.value = "";
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="收支" description="記錄收入、支出與轉帳，帳戶餘額會自動更新。" />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title="新增收支">
          <div className="mb-3 flex gap-2">
            <ActionButton variant={mode === "single" ? "primary" : "secondary"} onClick={() => setMode("single")}><Receipt size={16} />收支</ActionButton>
            <ActionButton variant={mode === "transfer" ? "primary" : "secondary"} onClick={() => setMode("transfer")}><ArrowsLeftRight size={16} />轉帳</ActionButton>
          </div>
          {mode === "single" ? (
            <div className="grid gap-3">
              <Field label="帳戶">
                <SelectInput value={ledgerForm.accountId} onChange={(event) => syncAccountDefaults(event.target.value)}>
                  <option value="">選擇帳戶</option>
                  {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </SelectInput>
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="日期">
                  <TextInput type="date" value={ledgerForm.date} onChange={(event) => setLedgerForm({ ...ledgerForm, date: event.target.value })} />
                </Field>
                <Field label="幣別">
                  <TextInput value={ledgerForm.currency} onChange={(event) => setLedgerForm({ ...ledgerForm, currency: event.target.value.toUpperCase() })} />
                </Field>
              </div>
              <Field label="金額 / 算式">
                <TextInput value={amountExpression} onChange={(event) => setAmountExpression(event.target.value)} placeholder="-120-85" />
              </Field>
              <Field label="分類">
                <TextInput value={ledgerForm.category} onChange={(event) => setLedgerForm({ ...ledgerForm, category: event.target.value })} />
              </Field>
              <Field label="備註">
                <TextInput value={ledgerForm.note} onChange={(event) => setLedgerForm({ ...ledgerForm, note: event.target.value })} />
              </Field>
              {message ? <StatusText>{message}</StatusText> : null}
              <div className="flex gap-2">
                <ActionButton onClick={submitSingle}>{editingId ? "儲存" : "新增"}</ActionButton>
                {editingId ? <ActionButton variant="secondary" onClick={() => { setEditingId(null); setLedgerForm(emptyLedger); setAmountExpression(String(emptyLedger.amount)); }}>取消</ActionButton> : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <Field label="來源帳戶">
                <SelectInput value={transferForm.sourceAccountId} onChange={(event) => {
                  const account = accountRows.find((item) => item.id === event.target.value);
                  setTransferForm({ ...transferForm, sourceAccountId: event.target.value, sourceCurrency: account?.currency ?? transferForm.sourceCurrency });
                }}>
                  <option value="">選擇帳戶</option>
                  {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="目標帳戶">
                <SelectInput value={transferForm.destinationAccountId} onChange={(event) => {
                  const account = accountRows.find((item) => item.id === event.target.value);
                  setTransferForm({ ...transferForm, destinationAccountId: event.target.value, destinationCurrency: account?.currency ?? transferForm.destinationCurrency });
                }}>
                  <option value="">選擇帳戶</option>
                  {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="日期"><TextInput type="date" value={transferForm.date} onChange={(event) => setTransferForm({ ...transferForm, date: event.target.value })} /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={`來源金額 ${transferForm.sourceCurrency}`}><TextInput type="number" value={transferForm.sourceAmount} onChange={(event) => setTransferForm({ ...transferForm, sourceAmount: Number(event.target.value) })} /></Field>
                <Field label={`目標金額 ${transferForm.destinationCurrency}`}><TextInput type="number" value={transferForm.destinationAmount ?? ""} onChange={(event) => setTransferForm({ ...transferForm, destinationAmount: Number(event.target.value) })} /></Field>
              </div>
              <Field label="備註"><TextInput value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} /></Field>
              {message ? <StatusText>{message}</StatusText> : null}
              <ActionButton onClick={submitTransfer}>建立轉帳</ActionButton>
            </div>
          )}
        </Card>
        <Card
          title="本機收支"
          action={
            <div className="flex gap-2">
              <ActionButton variant="secondary" onClick={() => downloadCsv("northstar-ledger.csv", exportLedgerCsv(ledgerRows, accountName))}>匯出 CSV</ActionButton>
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
                <ActionButton onClick={async () => { await importLedger.mutateAsync(preview.valid.map((item) => item.value)); setPreview(null); }}>確認匯入</ActionButton>
                <ActionButton variant="secondary" onClick={() => setPreview(null)}>取消</ActionButton>
              </div>
            </div>
          ) : null}
          <div className="space-y-3">
            {groupedRows.map((group) => (
              <div key={group.id} className="grid grid-cols-[1fr_auto] gap-4 rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                <div>
                  <div className="font-semibold">{group.title}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{group.subtitle}</div>
                </div>
                <div className="tabular text-right" style={{ color: group.amount < 0 ? "var(--ns-negative)" : "var(--ns-positive)" }}>
                  {group.amount.toLocaleString("zh-TW")} {group.currency}
                  <div className="mt-2 flex justify-end gap-2">
                    {group.rows.length === 1 ? (
                      <ActionButton variant="secondary" onClick={() => {
                        const row = group.rows[0];
                        setMode("single");
                        setEditingId(row.id);
                        setLedgerForm({
                          accountId: row.accountId,
                          date: row.date,
                          amount: row.amount,
                          currency: row.currency,
                          category: row.category,
                          note: row.note,
                        });
                        setAmountExpression(String(row.amount));
                      }}><PencilSimple size={16} />編輯</ActionButton>
                    ) : null}
                    <ActionButton variant="danger" onClick={() => deleteLedger.mutate(group.rows[0].id)}><Trash size={16} />刪除</ActionButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function groupLedgerRows(rows: LedgerTransaction[]) {
  const byGroup = new Map<string, LedgerTransaction[]>();
  const singles: LedgerTransaction[][] = [];
  for (const row of rows) {
    if (!row.groupId) singles.push([row]);
    else byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row]);
  }

  return [...singles, ...byGroup.values()].map((group) => {
    const first = group[0];
    const isTransfer = group.length === 2 && group.some((row) => row.amount < 0) && group.some((row) => row.amount > 0);
    const amount = isTransfer ? Math.abs(group.find((row) => row.amount < 0)?.amount ?? 0) : group.reduce((sum, row) => sum + row.amount, 0);
    return {
      id: first.groupId ?? first.id,
      rows: group,
      title: isTransfer ? "轉帳 / 換匯" : first.category,
      subtitle: isTransfer ? `${group[0].currency} → ${group[1].currency} · ${first.date}` : `${first.date} · ${first.note || "無備註"}`,
      amount,
      currency: isTransfer ? group[0].currency : first.currency,
    };
  });
}
