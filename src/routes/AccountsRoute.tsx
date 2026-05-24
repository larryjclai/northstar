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

type AccountFormState = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "isSharedToHousehold">;

const emptyAccount: AccountFormState = {
  name: "",
  currency: "TWD",
  openingBalance: 0,
  type: "depository",
  isSharedToHousehold: false,
};

const accountTypes: AccountType[] = ["depository", "cash", "credit", "loan", "investment", "other"];

export function AccountsRoute() {
  const { accounts } = useFinanceData();
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
  const isEditing = Boolean(editingId);

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
                  {accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </SelectInput>
              </Field>
            </div>
            <Field label="期初餘額">
              <TextInput type="number" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: Number(event.target.value) })} />
            </Field>
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
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((account) => (
              <div key={account.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                      <Bank size={20} weight="duotone" />
                    </div>
                    <div>
                      <div className="font-semibold">{account.name}</div>
                      <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{account.type} · {account.currency}</div>
                    </div>
                  </div>
                  <div className="tabular text-right font-semibold">{account.balance.toLocaleString("zh-TW")}</div>
                </div>
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
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
