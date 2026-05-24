import { Bank, PencilSimple, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Field, SelectInput, TextInput } from "../components/Field";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportAccountsCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { Account, AccountType } from "../domain";
import { convertCurrency, formatMoney } from "../domain";

type AccountFormState = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "isSharedToHousehold">;

const emptyAccount: AccountFormState = {
  name: "",
  currency: "TWD",
  openingBalance: 0,
  type: "depository",
  creditLimit: null,
  creditLimitGroup: "",
  isSharedToHousehold: false,
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

export function AccountsRoute() {
  const { accounts, settings } = useFinanceData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyAccount);
  const [message, setMessage] = useState("");
  const createAccount = useRepositoryMutation((repository, input: AccountFormState) => repository.createAccount(input), ["accounts"]);
  const updateAccount = useRepositoryMutation(
    (repository, input: AccountFormState & { id: string }) => repository.updateAccount(input.id, input),
    ["accounts"],
  );
  const deleteAccount = useRepositoryMutation((repository, id: string) => repository.deleteAccount(id), ["accounts"]);

  const rows = accounts.data ?? [];
  const appSettings = settings.data;
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
      if (editingId) {
        await updateAccount.mutateAsync({ ...form, id: editingId });
      } else {
        await createAccount.mutateAsync(form);
      }
      setForm(emptyAccount);
      setEditingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "帳戶儲存失敗。");
    }
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      currency: account.currency,
      openingBalance: account.openingBalance,
      type: account.type,
      creditLimit: account.creditLimit,
      creditLimitGroup: account.creditLimitGroup,
      isSharedToHousehold: account.isSharedToHousehold,
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="帳戶" description="管理現金、銀行、信用卡與投資帳戶，讓淨值和收支有可靠基礎。" />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card title={isEditing ? "編輯帳戶" : "新增帳戶"}>
          <div className="grid gap-3">
            <Field label="名稱">
              <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="台幣生活帳戶" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="幣別">
                <TextInput value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="類型">
                <SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as AccountType })}>
                  {accountTypes.map((type) => <option key={type} value={type}>{accountTypeLabels[type]}</option>)}
                </SelectInput>
              </Field>
            </div>
            <Field label="期初餘額">
              <TextInput type="number" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: Number(event.target.value) })} />
            </Field>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isSharedToHousehold} onChange={(event) => setForm({ ...form, isSharedToHousehold: event.target.checked })} />
              未來納入家庭視圖
            </label>
            {message ? <StatusText>{message}</StatusText> : null}
            <div className="flex gap-2">
              <ActionButton onClick={submit}>{isEditing ? "儲存" : "新增"}</ActionButton>
              {isEditing ? <ActionButton variant="secondary" onClick={() => { setEditingId(null); setForm(emptyAccount); }}>取消</ActionButton> : null}
            </div>
          </div>
        </Card>
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
                    {account.balance.toLocaleString("zh-TW")}
                    {converted !== null && appSettings && account.currency !== appSettings.primaryCurrency ? (
                      <div className="text-xs font-normal" style={{ color: "var(--ns-muted)" }}>{formatMoney(converted, appSettings.primaryCurrency)}</div>
                    ) : null}
                  </div>
                </div>
                {account.type === "credit" ? (
                  <div className="mt-3 rounded-md p-3 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                    <div className="flex justify-between gap-3">
                      <span style={{ color: "var(--ns-muted)" }}>已用額度</span>
                      <span className="tabular">{Math.max(0, -account.balance).toLocaleString("zh-TW")} / {(account.creditLimit ?? 0).toLocaleString("zh-TW")}</span>
                    </div>
                    {groupCredit ? <div className="mt-1 flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>共用額度 {groupCredit.name}</span><span className="tabular">{groupCredit.used.toLocaleString("zh-TW")} / {groupCredit.limit.toLocaleString("zh-TW")}</span></div> : null}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <ActionButton variant="secondary" onClick={() => startEdit(account)}><PencilSimple size={16} />編輯</ActionButton>
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
          </div>
        </Card>
      </div>
    </div>
  );
}

function calculateCreditGroup(name: string, accounts: Account[]) {
  const groupRows = accounts.filter((account) => account.type === "credit" && account.creditLimitGroup === name);
  const used = groupRows.reduce((sum, account) => sum + Math.max(0, -account.balance), 0);
  const limit = Math.max(...groupRows.map((account) => account.creditLimit ?? 0), 0);
  return { name, used, limit };
}
