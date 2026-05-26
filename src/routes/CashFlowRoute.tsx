import { ArrowsLeftRight, CalendarPlus, PencilSimple, Receipt, Trash, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { DateTimeField } from "../components/DateTimeField";
import { EmptyState } from "../components/EmptyState";
import { Field, SelectInput, TextAreaInput, TextInput } from "../components/Field";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportLedgerCsv, parseLedgerCsv, type ImportPreview } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { LedgerDraft, RecurringDraft, TransferDraft } from "../data/repositories";
import { evaluateAmountExpression, formatNumber, nowAsDatetimeLocal, todayInTimezone } from "../domain";
import type { LedgerTransaction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

type CashMode = "single" | "transfer";

/** Factory functions — empty templates are computed per-render so they pick
 *  up the user's currently-selected timezone instead of being frozen at
 *  module load time (which was the timezone bug we just fixed). */
function makeEmptyLedger(timezone: string): LedgerDraft {
  return {
    accountId: "",
    date: nowAsDatetimeLocal(timezone),
    name: "",
    amount: 100,
    currency: "TWD",
    category: "餐飲",
    subcategory: "點心",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
  };
}

function makeEmptyTransfer(timezone: string): TransferDraft {
  return {
    date: nowAsDatetimeLocal(timezone),
    sourceAccountId: "",
    destinationAccountId: "",
    sourceCurrency: "TWD",
    destinationCurrency: "TWD",
    sourceAmount: 1000,
    destinationAmount: 1000,
    note: "",
  };
}

function makeEmptyRecurring(timezone: string): RecurringDraft {
  return {
    accountId: "",
    amount: -390,
    currency: "TWD",
    category: "餐飲",
    subcategory: "飲料",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "訂閱",
    dayOfMonth: 1,
    nextRunDate: todayInTimezone(timezone),
    isActive: true,
  };
}

export function CashFlowRoute() {
  const { accounts, ledger, recurring, settings } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const emptyLedger = useMemo(() => makeEmptyLedger(timezone), [timezone]);
  const emptyTransfer = useMemo(() => makeEmptyTransfer(timezone), [timezone]);
  const emptyRecurring = useMemo(() => makeEmptyRecurring(timezone), [timezone]);
  const [mode, setMode] = useState<CashMode>("single");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ledgerForm, setLedgerForm] = useState<LedgerDraft>(emptyLedger);
  const [amountExpression, setAmountExpression] = useState(String(Math.abs(emptyLedger.amount)));
  const [transferForm, setTransferForm] = useState<TransferDraft>(emptyTransfer);
  const [recurringForm, setRecurringForm] = useState<RecurringDraft>(emptyRecurring);
  const [accountSelectionMode, setAccountSelectionMode] = useState<"auto" | "manual">("auto");
  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [message, setMessage] = useState("");

  const appSettings = settings.data;
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const recurringRows = recurring.data ?? [];
  const categories = appSettings?.categories.length ? appSettings.categories : [];
  const categoryNames = categories.map((category) => category.name);
  const subcategories = categories.find((category) => category.name === ledgerForm.category)?.children ?? [];
  const recurringSubcategories = categories.find((category) => category.name === recurringForm.category)?.children ?? [];
  const merchants = appSettings?.merchants ?? [];
  const merchantPool = useMemo(
    () => uniqueClean([...merchants, ...ledgerRows.map((row) => row.merchant)]),
    [merchants, ledgerRows],
  );
  const merchantSuggestions = useMemo(
    () => buildMerchantSuggestions(merchantPool, ledgerForm.merchant),
    [merchantPool, ledgerForm.merchant],
  );
  const recurringMerchantSuggestions = useMemo(
    () => buildMerchantSuggestions(merchantPool, recurringForm.merchant),
    [merchantPool, recurringForm.merchant],
  );
  const accountName = (id: string) => accountRows.find((account) => account.id === id)?.name ?? id;
  const accountIdFor = (nameOrId: string) => accountRows.find((account) => account.id === nameOrId || account.name === nameOrId)?.id;
  const groupedRows = useMemo(() => groupLedgerRows(ledgerRows), [ledgerRows]);
  const availableAccountIds = useMemo(() => new Set(accountRows.map((account) => account.id)), [accountRows]);

  const createLedger = useRepositoryMutation((repository, input: LedgerDraft) => repository.createLedgerTransaction(input), ["ledger", "accounts"]);
  const updateLedger = useRepositoryMutation((repository, input: LedgerDraft & { id: string }) => repository.updateLedgerTransaction(input.id, input), ["ledger", "accounts"]);
  const deleteLedger = useRepositoryMutation((repository, id: string) => repository.deleteLedgerTransaction(id), ["ledger", "accounts"]);
  const createTransfer = useRepositoryMutation((repository, input: TransferDraft) => repository.createTransfer(input), ["ledger", "accounts"]);
  const importLedger = useRepositoryMutation((repository, input: LedgerDraft[]) => repository.importLedgerTransactions(input), ["ledger", "accounts"]);
  const createRecurring = useRepositoryMutation((repository, input: RecurringDraft) => repository.createRecurringTransaction(input), ["recurring"]);
  const deleteRecurring = useRepositoryMutation((repository, id: string) => repository.deleteRecurringTransaction(id), ["recurring"]);
  const postRecurring = useRepositoryMutation((repository, id: string) => repository.postRecurringTransaction(id), ["recurring", "ledger", "accounts"]);
  const rememberMerchants = useRepositoryMutation(async (repository, input: string[]) => {
    const nextNames = uniqueClean(input);
    if (nextNames.length === 0) return;
    const current = await repository.getAppSettings();
    const existing = new Set(current.merchants.map((merchant) => merchant.trim()).filter(Boolean));
    const additions = nextNames.filter((merchant) => !existing.has(merchant));
    if (additions.length === 0) return;
    await repository.updateAppSettings({
      ...current,
      merchants: [...current.merchants, ...additions],
    });
  }, ["settings"]);
  const rememberCategories = useRepositoryMutation(async (repository, input: Array<{ category: string; subcategory: string }>) => {
    const nextItems = input
      .map((item) => ({ category: item.category.trim(), subcategory: item.subcategory.trim() }))
      .filter((item) => item.category);
    if (nextItems.length === 0) return;

    const current = await repository.getAppSettings();
    const nextCategories = current.categories.map((category) => ({
      ...category,
      children: [...category.children],
    }));
    let changed = false;

    for (const item of nextItems) {
      let category = nextCategories.find((candidate) => candidate.name === item.category);
      if (!category) {
        category = { name: item.category, children: [] };
        nextCategories.push(category);
        changed = true;
      }
      if (item.subcategory && !category.children.includes(item.subcategory)) {
        category.children.push(item.subcategory);
        changed = true;
      }
    }

    if (!changed) return;
    await repository.updateAppSettings({
      ...current,
      categories: nextCategories,
    });
  }, ["settings"]);

  function rememberMerchantNames(names: string[]) {
    const nextNames = uniqueClean(names);
    if (nextNames.length === 0) return;
    void rememberMerchants.mutateAsync(nextNames).catch((error) => {
      console.warn("[cash-flow] failed to remember merchants", error);
    });
  }

  function syncAccountDefaults(accountId: string) {
    setAccountSelectionMode("manual");
    const account = accountRows.find((item) => item.id === accountId);
    if (account) setLedgerForm((current) => ({ ...current, accountId, currency: account.currency }));
  }

  useEffect(() => {
    if (mode !== "single" || editingId || accountSelectionMode !== "auto") return;
    const accountId = findLastUsedAccountIdForCategory(ledgerRows, availableAccountIds, {
      category: ledgerForm.category,
      subcategory: ledgerForm.subcategory,
      entryType: ledgerForm.entryType,
    });
    if (!accountId) return;
    const account = accountRows.find((item) => item.id === accountId);
    if (!account) return;

    setLedgerForm((current) => {
      if (current.accountId === accountId && current.currency === account.currency) return current;
      return {
        ...current,
        accountId,
        currency: account.currency,
      };
    });
  }, [
    accountRows,
    accountSelectionMode,
    availableAccountIds,
    editingId,
    ledgerForm.category,
    ledgerForm.entryType,
    ledgerForm.subcategory,
    ledgerRows,
    mode,
  ]);

  async function submitRecurring() {
    setMessage("");
    try {
      if (!recurringForm.accountId) throw new Error("請選擇帳戶。");
      await createRecurring.mutateAsync(recurringForm);
      rememberMerchantNames([recurringForm.merchant]);
      setRecurringForm({ ...emptyRecurring, currency: appSettings?.primaryCurrency ?? emptyRecurring.currency });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "週期事件儲存失敗。");
    }
  }

  async function submitSingle() {
    setMessage("");
    try {
      const amount = Math.abs(evaluateAmountExpression(amountExpression));
      const signedAmount = ledgerForm.entryType === "expense" ? -amount : amount;
      const payload = {
        ...ledgerForm,
        amount: signedAmount,
        name: ledgerForm.name.trim(),
        category: ledgerForm.category.trim(),
        subcategory: ledgerForm.subcategory.trim(),
        merchant: ledgerForm.merchant.trim(),
      };
      if (!payload.accountId) throw new Error("請選擇帳戶。");
      if (editingId) await updateLedger.mutateAsync({ ...payload, id: editingId });
      else await createLedger.mutateAsync(payload);
      await rememberCategories.mutateAsync([{ category: payload.category, subcategory: payload.subcategory }]);
      rememberMerchantNames([payload.merchant]);
      setLedgerForm({ ...emptyLedger, date: nowAsDatetimeLocal(timezone), currency: appSettings?.primaryCurrency ?? emptyLedger.currency });
      setAmountExpression(String(Math.abs(emptyLedger.amount)));
      setAccountSelectionMode("auto");
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
      setTransferForm({ ...emptyTransfer, date: nowAsDatetimeLocal(timezone) });
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
      <PageHeader
        title="記帳"
        description="記錄收入、支出與轉帳，帳戶餘額會自動更新。"
        action={
          <ActionButton onClick={() => setMode("single")} size="sm">
            <Receipt size={14} />新增收支
          </ActionButton>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title="新增收支">
          <div className="mb-3 flex gap-2">
            <ActionButton variant={mode === "single" ? "primary" : "secondary"} onClick={() => setMode("single")}><Receipt size={16} />收支</ActionButton>
            <ActionButton variant={mode === "transfer" ? "primary" : "secondary"} onClick={() => setMode("transfer")}><ArrowsLeftRight size={16} />轉帳</ActionButton>
          </div>
          {mode === "single" ? (
            <div className="grid gap-4">
              <Field label="名稱">
                <TextInput
                  value={ledgerForm.name}
                  onChange={(event) => setLedgerForm({ ...ledgerForm, name: event.target.value })}
                  placeholder="例如 晚餐、咖啡、股利"
                  className="py-3 text-base font-semibold"
                />
              </Field>

              <Field label="商家">
                <MerchantAutocomplete
                  value={ledgerForm.merchant}
                  suggestions={merchantSuggestions}
                  onChange={(next) => setLedgerForm({ ...ledgerForm, merchant: next })}
                  placeholder="例如 7-ELEVEN、Lyft"
                />
              </Field>

              <div className="grid gap-3 rounded-md border p-3" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-strong)" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_112px]">
                  <Field label="金額 / 算式">
                    <TextInput
                      value={amountExpression}
                      onChange={(event) => setAmountExpression(event.target.value)}
                      placeholder="120+85"
                      inputMode="decimal"
                      className="bg-[var(--ns-surface)] text-right text-lg font-semibold tabular"
                    />
                  </Field>
                  <Field label="類型">
                    <SelectInput
                      value={ledgerForm.entryType}
                      onChange={(event) => {
                        const entryType = event.target.value as LedgerDraft["entryType"];
                        setLedgerForm({ ...ledgerForm, entryType, settlementStatus: "settled" });
                      }}
                      className="bg-[var(--ns-surface)]"
                    >
                      <option value="expense">支出</option>
                      <option value="income">收入</option>
                    </SelectInput>
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="分類">
                  <TextInput
                    list="cashflow-categories"
                    value={ledgerForm.category}
                    onChange={(event) => setLedgerForm({ ...ledgerForm, category: event.target.value })}
                    placeholder="選擇或輸入分類"
                  />
                </Field>
                <Field label="子分類">
                  <TextInput
                    list="cashflow-subcategories"
                    value={ledgerForm.subcategory}
                    onChange={(event) => setLedgerForm({ ...ledgerForm, subcategory: event.target.value })}
                    placeholder="未分類"
                  />
                </Field>
              </div>

              <Field label="帳戶">
                <SelectInput value={ledgerForm.accountId} onChange={(event) => syncAccountDefaults(event.target.value)}>
                  <option value="">選擇帳戶</option>
                  {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </SelectInput>
              </Field>

              <DateTimeField
                label="日期 + 時間"
                value={ledgerForm.date}
                onChange={(value) => setLedgerForm({ ...ledgerForm, date: value })}
              />

              <Field label="備註">
                <TextAreaInput
                  value={ledgerForm.note}
                  onChange={(event) => setLedgerForm({ ...ledgerForm, note: event.target.value })}
                  rows={3}
                  placeholder="可留空"
                />
              </Field>

              <details className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
                <summary className="cursor-pointer select-none font-medium" style={{ color: "var(--ns-muted)" }}>
                  進階
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="幣別">
                    <TextInput value={ledgerForm.currency} onChange={(event) => setLedgerForm({ ...ledgerForm, currency: event.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="狀態">
                    <SelectInput value={ledgerForm.settlementStatus} onChange={(event) => setLedgerForm({ ...ledgerForm, settlementStatus: event.target.value as LedgerDraft["settlementStatus"] })}>
                      <option value="settled">{ledgerForm.entryType === "income" ? "已收款" : "已付款"}</option>
                      {ledgerForm.entryType === "income" ? <option value="receivable">應收帳款</option> : <option value="payable">應付帳款</option>}
                    </SelectInput>
                  </Field>
                </div>
              </details>

              <datalist id="cashflow-categories">
                {categoryNames.map((category) => <option key={category} value={category} />)}
              </datalist>
              <datalist id="cashflow-subcategories">
                {subcategories.map((subcategory) => <option key={subcategory} value={subcategory} />)}
              </datalist>

              {message ? <StatusText>{message}</StatusText> : null}
              <div className="flex gap-2">
                <ActionButton onClick={submitSingle}>{editingId ? "儲存" : "新增"}</ActionButton>
                {editingId ? <ActionButton variant="secondary" onClick={() => { setEditingId(null); setLedgerForm({ ...emptyLedger, date: nowAsDatetimeLocal(timezone) }); setAmountExpression(String(Math.abs(emptyLedger.amount))); setAccountSelectionMode("auto"); }}>取消</ActionButton> : null}
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
              <DateTimeField
                label="時間"
                value={transferForm.date}
                onChange={(value) => setTransferForm({ ...transferForm, date: value })}
              />
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
                <ActionButton onClick={async () => {
                  const rows = preview.valid.map((item) => item.value);
                  await importLedger.mutateAsync(rows);
                  rememberMerchantNames(rows.map((row) => row.merchant));
                  setPreview(null);
                }}>確認匯入</ActionButton>
                <ActionButton variant="secondary" onClick={() => setPreview(null)}>取消</ActionButton>
              </div>
            </div>
          ) : null}
          {groupedRows.length === 0 ? (
            <EmptyState
              icon={<Receipt size={24} weight="duotone" />}
              title="還沒有記帳資料"
              description="先從左側新增第一筆收支，或匯入 CSV 歷史資料。"
            />
          ) : (
            <div className="space-y-3">
              {groupedRows.map((group) => (
              <div key={group.id} className="grid grid-cols-1 gap-4 rounded-md border p-4 sm:grid-cols-[1fr_auto]" style={{ borderColor: "var(--ns-border)" }}>
                <div>
                  <div className="font-semibold">{group.title}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{group.subtitle}</div>
                </div>
                <div className="tabular text-left sm:text-right" style={{ color: group.amount < 0 ? "var(--ns-negative)" : "var(--ns-positive)" }}>
                  <div>{group.typeLabel} {formatNumber(Math.abs(group.amount))} {group.currency}</div>
                  <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                    {group.rows.length === 1 ? (
                      <ActionButton variant="secondary" onClick={() => {
                        const row = group.rows[0];
                        setMode("single");
                        setEditingId(row.id);
                        setLedgerForm({
                          accountId: row.accountId,
                          date: row.date,
                          name: row.name,
                          amount: row.amount,
                          currency: row.currency,
                          category: row.category,
                          subcategory: row.subcategory,
                          merchant: row.merchant,
                          entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
                          settlementStatus: row.settlementStatus ?? "settled",
                          note: row.note,
                        });
                        setAccountSelectionMode("manual");
                        setAmountExpression(String(Math.abs(row.amount)));
                      }}><PencilSimple size={16} />編輯</ActionButton>
                    ) : null}
                    <ActionButton variant="danger" onClick={() => deleteLedger.mutate(group.rows[0].id)}><Trash size={16} />刪除</ActionButton>
                  </div>
                </div>
              </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <details className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
        <summary className="cursor-pointer select-none text-sm font-semibold" style={{ color: "var(--ns-muted)" }}>
          週期事件（每月固定收支）
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card title="新增週期事件" variant="muted">
            <div className="grid gap-3">
            <Field label="帳戶">
              <SelectInput value={recurringForm.accountId} onChange={(event) => {
                const account = accountRows.find((item) => item.id === event.target.value);
                setRecurringForm({ ...recurringForm, accountId: event.target.value, currency: account?.currency ?? recurringForm.currency });
              }}>
                <option value="">選擇帳戶</option>
                {accountRows.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </SelectInput>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="類型">
                <SelectInput value={recurringForm.entryType} onChange={(event) => {
                  const entryType = event.target.value as RecurringDraft["entryType"];
                  const amount = Math.abs(recurringForm.amount);
                  setRecurringForm({ ...recurringForm, entryType, amount: entryType === "expense" ? -amount : amount });
                }}>
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </SelectInput>
              </Field>
              <Field label="金額">
                <TextInput type="number" value={Math.abs(recurringForm.amount)} onChange={(event) => {
                  const amount = Math.abs(Number(event.target.value));
                  setRecurringForm({ ...recurringForm, amount: recurringForm.entryType === "expense" ? -amount : amount });
                }} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="分類">
                <SelectInput value={recurringForm.category} onChange={(event) => {
                  const category = event.target.value;
                  const firstChild = categories.find((item) => item.name === category)?.children[0] ?? "";
                  setRecurringForm({ ...recurringForm, category, subcategory: firstChild });
                }}>
                  {categoryNames.map((category) => <option key={category} value={category}>{category}</option>)}
                </SelectInput>
              </Field>
              <Field label="子分類">
                <SelectInput value={recurringForm.subcategory} onChange={(event) => setRecurringForm({ ...recurringForm, subcategory: event.target.value })}>
                  <option value="">未分類</option>
                  {recurringSubcategories.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
                </SelectInput>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="每月日期">
                <TextInput type="number" min={1} max={31} value={recurringForm.dayOfMonth} onChange={(event) => setRecurringForm({ ...recurringForm, dayOfMonth: Number(event.target.value) })} />
              </Field>
              <Field label="下次日期">
                <TextInput type="date" value={recurringForm.nextRunDate} onChange={(event) => setRecurringForm({ ...recurringForm, nextRunDate: event.target.value })} />
              </Field>
            </div>
            <Field label="商家">
              <MerchantAutocomplete
                value={recurringForm.merchant}
                suggestions={recurringMerchantSuggestions}
                onChange={(next) => setRecurringForm({ ...recurringForm, merchant: next })}
                placeholder="例如 Spotify"
              />
            </Field>
            <Field label="備註">
              <TextInput value={recurringForm.note} onChange={(event) => setRecurringForm({ ...recurringForm, note: event.target.value })} />
            </Field>
            <ActionButton onClick={submitRecurring}><CalendarPlus size={16} />建立週期事件</ActionButton>
            </div>
          </Card>
          <Card title="週期事件" variant="muted">
            {recurringRows.length === 0 ? (
              <EmptyState
                icon={<CalendarPlus size={24} weight="duotone" />}
                title="尚未建立週期事件"
                description="你可以建立每月固定扣款或固定收入，降低重複輸入。"
              />
            ) : (
              <div className="space-y-3">
                {recurringRows.map((row) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 rounded-md border p-4 sm:grid-cols-[1fr_auto]" style={{ borderColor: "var(--ns-border)" }}>
                <div>
                  <div className="font-semibold">{row.category}{row.subcategory ? ` / ${row.subcategory}` : ""}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{row.merchant || accountName(row.accountId)} · 下次 {row.nextRunDate} · 每月 {row.dayOfMonth} 日</div>
                </div>
                <div className="tabular text-left sm:text-right">
                  <div>{row.entryType === "income" ? "收入" : "支出"} {formatNumber(Math.abs(row.amount))} {row.currency}</div>
                  <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                    <ActionButton variant="secondary" onClick={() => postRecurring.mutate(row.id)}>產生本期</ActionButton>
                    <ActionButton variant="danger" onClick={() => deleteRecurring.mutate(row.id)}><Trash size={16} />刪除</ActionButton>
                  </div>
                </div>
              </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </details>
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
      title: isTransfer ? "轉帳 / 換匯" : first.name || `${first.category}${first.subcategory ? ` / ${first.subcategory}` : ""}`,
      subtitle: isTransfer ? `${group[0].currency} → ${group[1].currency} · ${formatRecordTime(first.date)}` : [settlementLabel(first.settlementStatus), formatRecordTime(first.date), `${first.category}${first.subcategory ? ` / ${first.subcategory}` : ""}`, first.merchant, first.note || "無備註"].filter(Boolean).join(" · "),
      amount,
      currency: isTransfer ? group[0].currency : first.currency,
      typeLabel: isTransfer ? "轉帳" : first.entryType === "income" ? "收入" : "支出",
    };
  });
}

function settlementLabel(status: LedgerTransaction["settlementStatus"]) {
  if (status === "receivable") return "應收";
  if (status === "payable") return "應付";
  return "已收付";
}

function formatRecordTime(value: string) {
  if (!value.includes("T")) return value;
  return value.replace("T", " ");
}

function MerchantAutocomplete({
  value,
  suggestions,
  onChange,
  placeholder,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const showPanel = open && suggestions.length > 0;

  return (
    <div className="relative">
      <TextInput
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!showPanel) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
            return;
          }
          if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            onChange(suggestions[activeIndex]);
            setOpen(false);
          }
        }}
        placeholder={placeholder}
      />
      {showPanel ? (
        <div
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border"
          style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)", boxShadow: "var(--ns-shadow-strong)" }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(suggestion);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm transition"
              style={{ background: index === activeIndex ? "var(--ns-accent-soft)" : "transparent" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function uniqueClean(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildMerchantSuggestions(merchants: string[], query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return merchants.slice(0, 12);

  return merchants
    .map((merchant, index) => ({
      merchant,
      index,
      score: merchantMatchScore(merchant, normalizedQuery),
    }))
    .filter((item) => item.score > -1)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .map((item) => item.merchant);
}

function merchantMatchScore(rawMerchant: string, normalizedQuery: string) {
  const merchant = normalizeText(rawMerchant);
  if (!merchant) return -1;
  if (merchant === normalizedQuery) return 300;
  if (merchant.startsWith(normalizedQuery)) return 200;

  const tokenHit = merchant
    .split(/[\s\-_.]+/)
    .some((token) => token.startsWith(normalizedQuery));
  if (tokenHit) return 120;
  if (merchant.includes(normalizedQuery)) return 80;
  return -1;
}

function findLastUsedAccountIdForCategory(
  rows: LedgerTransaction[],
  availableAccountIds: Set<string>,
  target: Pick<LedgerDraft, "category" | "subcategory" | "entryType">,
) {
  const category = target.category.trim();
  if (!category) return "";
  const subcategory = target.subcategory.trim();

  const rankedRows = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const exact = rankedRows.find((row) =>
    row.entryType === target.entryType &&
    row.category.trim() === category &&
    row.subcategory.trim() === subcategory &&
    availableAccountIds.has(row.accountId),
  );
  if (exact) return exact.accountId;

  const byCategory = rankedRows.find((row) =>
    row.entryType === target.entryType &&
    row.category.trim() === category &&
    availableAccountIds.has(row.accountId),
  );
  return byCategory?.accountId ?? "";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}
