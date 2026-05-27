import { Bank, PencilSimple, Scales, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { DateTimeField } from "../components/DateTimeField";
import { Field, SelectInput, TextInput } from "../components/Field";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportAccountsCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { Account, AccountType, AppSettings } from "../domain";
import { convertCurrency, formatMoney, formatNumber, nowAsDatetimeLocal } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

type AccountFormState = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "isSharedToHousehold" | "loanStartDate" | "annualInterestRate" | "loanTerm">;

const emptyAccount: AccountFormState = {
  name: "",
  currency: "TWD",
  openingBalance: 0,
  type: "depository",
  creditLimit: null,
  creditLimitGroup: "",
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
};

const accountTypes: AccountType[] = ["depository", "cash", "credit", "loan", "investment", "other"];
const accountTypeLabels: Record<AccountType, string> = {
  depository: "銀行帳戶",
  cash: "現金",
  credit: "信用卡",
  loan: "貸款",
  investment: "投資",
  other: "其他",
};

const accountTypeDescriptions: Record<AccountType, string> = {
  depository: "支票、存款帳戶",
  cash: "實體現金",
  credit: "信用卡、預付卡",
  loan: "房貸、車貸、學貸",
  investment: "券商、基金帳戶",
  other: "其他類型",
};

export function AccountsRoute() {
  const { accounts, settings } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeStep, setTypeStep] = useState<AccountType | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyAccount);
  const [message, setMessage] = useState("");
  const [adjustingAccountId, setAdjustingAccountId] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustDate, setAdjustDate] = useState("");
  const [adjustMessage, setAdjustMessage] = useState("");

  const createAccount = useRepositoryMutation((repository, input: AccountFormState) => repository.createAccount(input), ["accounts"]);
  const updateAccount = useRepositoryMutation(
    (repository, input: AccountFormState & { id: string }) => repository.updateAccount(input.id, input),
    ["accounts"],
  );
  const deleteAccount = useRepositoryMutation((repository, id: string) => repository.deleteAccount(id), ["accounts"]);
  const adjustBalance = useRepositoryMutation(
    (repository, input: { accountId: string; targetBalance: number; date: string; note: string }) =>
      repository.adjustAccountBalance(input.accountId, input.targetBalance, input.date, input.note),
    ["accounts", "ledger"],
  );

  const rows = accounts.data ?? [];
  const appSettings = settings.data;
  const currencyOptions = useMemo(() => buildConfiguredCurrencyOptions(appSettings), [appSettings]);
  const selectedCurrency = currencyOptions.includes(form.currency) ? form.currency : currencyOptions[0];
  const isEditing = Boolean(editingId);
  const groupedAccounts = accountTypes.map((type) => ({
    type,
    rows: rows.filter((account) => account.type === type),
  })).filter((group) => group.rows.length);

  async function submit() {
    setMessage("");
    if (!form.name.trim()) {
      setMessage("請輸入帳戶名稱。");
      return;
    }
    try {
      const payload = { ...form, currency: selectedCurrency };
      if (editingId) {
        await updateAccount.mutateAsync({ ...payload, id: editingId });
      } else {
        await createAccount.mutateAsync(payload);
      }
      setForm(emptyAccount);
      setEditingId(null);
      setTypeStep(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "帳戶儲存失敗。");
    }
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setTypeStep(account.type);
    setForm({
      name: account.name,
      currency: account.currency,
      openingBalance: account.openingBalance,
      type: account.type,
      creditLimit: account.creditLimit,
      creditLimitGroup: account.creditLimitGroup,
      isSharedToHousehold: account.isSharedToHousehold,
      loanStartDate: account.loanStartDate,
      annualInterestRate: account.annualInterestRate,
      loanTerm: account.loanTerm,
    });
  }

  function cancelForm() {
    setEditingId(null);
    setTypeStep(null);
    setForm(emptyAccount);
    setMessage("");
  }

  function openAdjust(account: Account) {
    setAdjustingAccountId(account.id);
    setAdjustTarget(String(account.balance));
    setAdjustNote("");
    setAdjustDate(nowAsDatetimeLocal(timezone));
    setAdjustMessage("");
  }

  async function submitAdjust() {
    setAdjustMessage("");
    const target = Number(adjustTarget);
    if (Number.isNaN(target)) {
      setAdjustMessage("請輸入有效的目標餘額。");
      return;
    }
    try {
      await adjustBalance.mutateAsync({
        accountId: adjustingAccountId!,
        targetBalance: target,
        date: adjustDate,
        note: adjustNote.trim() || "手動調整餘額",
      });
      setAdjustingAccountId(null);
    } catch (error) {
      setAdjustMessage(error instanceof Error ? error.message : "調整失敗。");
    }
  }

  const adjustingAccount = adjustingAccountId ? rows.find((r) => r.id === adjustingAccountId) : null;

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader
        title="帳戶"
        description="管理現金、銀行、信用卡與投資帳戶，讓淨值和收支有可靠基礎。"
      />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div>
          {/* Type selection step */}
          {!typeStep ? (
            <Card title={isEditing ? "編輯帳戶" : "新增帳戶"}>
              <p className="mb-3 text-sm" style={{ color: "var(--ns-muted)" }}>請先選擇帳戶種類：</p>
              <div className="grid gap-2">
                {accountTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTypeStep(type);
                      setForm({ ...emptyAccount, type });
                      setMessage("");
                    }}
                    className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition hover:opacity-90"
                    style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-strong)" }}
                  >
                    <div className="grid size-9 shrink-0 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                      <Bank size={18} weight="duotone" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{accountTypeLabels[type]}</div>
                      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{accountTypeDescriptions[type]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ) : (
            <Card title={isEditing ? `編輯帳戶 · ${accountTypeLabels[typeStep]}` : `新增${accountTypeLabels[typeStep]}`}>
              <div className="grid gap-3">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => { setTypeStep(null); setMessage(""); }}
                    className="inline-flex items-center gap-1 text-xs outline-none transition hover:opacity-70"
                    style={{ color: "var(--ns-accent)" }}
                  >
                    ← 重新選擇種類
                  </button>
                )}
                <Field label="名稱">
                  <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="台幣生活帳戶" />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="幣別">
                    <SelectInput value={selectedCurrency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
                      {currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                    </SelectInput>
                  </Field>
                  <Field label="期初餘額">
                    <TextInput type="number" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: Number(event.target.value) })} />
                  </Field>
                </div>

                {form.type === "credit" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="信用額度">
                      <TextInput type="number" value={form.creditLimit ?? ""} onChange={(event) => setForm({ ...form, creditLimit: event.target.value ? Number(event.target.value) : null })} placeholder="120000" />
                    </Field>
                    <Field label="共用額度群組">
                      <TextInput value={form.creditLimitGroup} onChange={(event) => setForm({ ...form, creditLimitGroup: event.target.value })} placeholder="玉山信用卡" />
                    </Field>
                  </div>
                ) : null}

                {form.type === "loan" ? (
                  <>
                    <Field label="貸款開始日期">
                      <TextInput type="date" value={form.loanStartDate ?? ""} onChange={(event) => setForm({ ...form, loanStartDate: event.target.value || null })} />
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="年利率（%）">
                        <TextInput type="number" step="0.01" value={form.annualInterestRate ?? ""} onChange={(event) => setForm({ ...form, annualInterestRate: event.target.value ? Number(event.target.value) : null })} placeholder="2.5" />
                      </Field>
                      <Field label="貸款期限（月）">
                        <TextInput type="number" value={form.loanTerm ?? ""} onChange={(event) => setForm({ ...form, loanTerm: event.target.value ? Number(event.target.value) : null })} placeholder="240" />
                      </Field>
                    </div>
                  </>
                ) : null}

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isSharedToHousehold} onChange={(event) => setForm({ ...form, isSharedToHousehold: event.target.checked })} />
                  未來納入家庭視圖
                </label>
                {message ? <StatusText>{message}</StatusText> : null}
                <div className="flex gap-2">
                  <ActionButton onClick={submit} disabled={createAccount.isPending || updateAccount.isPending}>
                    {(createAccount.isPending || updateAccount.isPending) ? "儲存中…" : isEditing ? "儲存" : "新增"}
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={cancelForm}>取消</ActionButton>
                </div>
              </div>
            </Card>
          )}
        </div>

        <Card
          title="本機帳戶"
          action={<ActionButton variant="secondary" onClick={() => downloadCsv("northstar-accounts.csv", exportAccountsCsv(rows))}>匯出 CSV</ActionButton>}
        >
          <div className="grid gap-5">
            {groupedAccounts.map((group) => (
              <section key={group.type} className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--ns-muted)" }}>{accountTypeLabels[group.type]}</h3>
                  <div className="text-xs tabular" style={{ color: "var(--ns-muted)" }}>{group.rows.length} 個帳戶</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.rows.map((account) => {
                    const converted = appSettings ? convertCurrency(account.balance, account.currency, appSettings.primaryCurrency, appSettings) : null;
                    const groupCredit = account.type === "credit" && account.creditLimitGroup
                      ? calculateCreditGroup(account.creditLimitGroup, rows)
                      : null;
                    return (
                      <div key={account.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="grid size-10 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                              <Bank size={20} weight="duotone" />
                            </div>
                            <div>
                              <div className="font-semibold">{account.name}</div>
                              <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{accountTypeLabels[account.type]} · {account.currency}</div>
                            </div>
                          </div>
                          <div className="tabular text-right font-semibold">
                            {formatNumber(account.balance)}
                            {converted !== null && appSettings && account.currency !== appSettings.primaryCurrency ? (
                              <div className="text-xs font-normal" style={{ color: "var(--ns-muted)" }}>{formatMoney(converted, appSettings.primaryCurrency)}</div>
                            ) : null}
                          </div>
                        </div>

                        {account.type === "credit" ? (
                          <div className="mt-3 rounded-md p-3 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                            <div className="flex justify-between gap-3">
                              <span style={{ color: "var(--ns-muted)" }}>已用額度</span>
                              <span className="tabular">{formatNumber(Math.max(0, -account.balance))} / {formatNumber(account.creditLimit ?? 0)}</span>
                            </div>
                            {groupCredit ? <div className="mt-1 flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>共用額度 {groupCredit.name}</span><span className="tabular">{formatNumber(groupCredit.used)} / {formatNumber(groupCredit.limit)}</span></div> : null}
                          </div>
                        ) : null}

                        {account.type === "loan" && (account.annualInterestRate !== null || account.loanTerm !== null) ? (
                          <div className="mt-3 rounded-md p-3 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                            {account.loanStartDate ? <div className="flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>開始日期</span><span>{account.loanStartDate}</span></div> : null}
                            {account.annualInterestRate !== null ? <div className="flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>年利率</span><span>{account.annualInterestRate}%</span></div> : null}
                            {account.loanTerm !== null ? <div className="flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>期限</span><span>{account.loanTerm} 個月</span></div> : null}
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          <ActionButton variant="secondary" onClick={() => startEdit(account)}><PencilSimple size={16} />編輯</ActionButton>
                          <ActionButton variant="secondary" onClick={() => openAdjust(account)}><Scales size={16} />調整餘額</ActionButton>
                          <ActionButton
                            variant="danger"
                            onClick={async () => {
                              try {
                                await deleteAccount.mutateAsync(account.id);
                              } catch (error) {
                                setMessage(error instanceof Error ? error.message : "刪除失敗。");
                              }
                            }}
                          >
                            <Trash size={16} />刪除
                          </ActionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {rows.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ns-muted)" }}>尚未建立任何帳戶，從左側新增第一個帳戶。</p>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Adjust balance modal */}
      {adjustingAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdjustingAccountId(null)}>
          <div
            className="w-full max-w-md rounded-xl border shadow-2xl"
            style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b px-5 py-4" style={{ borderColor: "var(--ns-border)" }}>
              <h2 className="text-base font-semibold">調整餘額 · {adjustingAccount.name}</h2>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ns-muted)" }}>
                目前餘額：{formatNumber(adjustingAccount.balance)} {adjustingAccount.currency}
              </p>
            </header>
            <div className="grid gap-3 px-5 py-4">
              <Field label="目標餘額">
                <TextInput
                  type="number"
                  value={adjustTarget}
                  onChange={(e) => setAdjustTarget(e.target.value)}
                  placeholder={String(adjustingAccount.balance)}
                />
              </Field>
              <DateTimeField label="調整時間" value={adjustDate} onChange={setAdjustDate} />
              <Field label="備註（選填）">
                <TextInput value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="例如：對帳後修正" />
              </Field>
              {adjustMessage ? <StatusText>{adjustMessage}</StatusText> : null}
              <div className="flex gap-2">
                <ActionButton onClick={submitAdjust} disabled={adjustBalance.isPending}>
                  {adjustBalance.isPending ? "調整中…" : "確認調整"}
                </ActionButton>
                <ActionButton variant="secondary" onClick={() => setAdjustingAccountId(null)}>取消</ActionButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function calculateCreditGroup(name: string, accounts: Account[]) {
  const groupRows = accounts.filter((account) => account.type === "credit" && account.creditLimitGroup === name);
  const used = groupRows.reduce((sum, account) => sum + Math.max(0, -account.balance), 0);
  const limit = Math.max(...groupRows.map((account) => account.creditLimit ?? 0), 0);
  return { name, used, limit };
}

function buildConfiguredCurrencyOptions(settings: AppSettings | undefined) {
  const values = [
    settings?.primaryCurrency ?? "TWD",
    ...(settings?.exchangeRates.flatMap((rate) => [rate.from, rate.to]) ?? []),
  ];
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
}
