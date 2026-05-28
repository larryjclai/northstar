import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Field, SelectInput, TextInput } from "../components/Field";
import { StatusText } from "../components/StatusText";
import { downloadCsv, exportAccountsCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { Account, AccountType, AppSettings } from "../domain";
import { convertCurrency, formatMoney, formatNumber } from "../domain";

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

const CHART_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
];

function Mark({ label, color, size = 36 }: { label: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        background: color, color: "var(--ns-bg)",
        borderRadius: "var(--ns-r-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--ns-font-display)",
        fontWeight: 600, fontSize: size <= 28 ? 11 : 13, letterSpacing: "0.02em",
      }}
    >
      {label.slice(0, 2)}
    </div>
  );
}

export function AccountsRoute() {
  const { accounts, settings } = useFinanceData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyAccount);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  const createAccount = useRepositoryMutation(
    (repository, input: AccountFormState) => repository.createAccount(input),
    ["accounts"],
  );
  const updateAccount = useRepositoryMutation(
    (repository, input: AccountFormState & { id: string }) => repository.updateAccount(input.id, input),
    ["accounts"],
  );
  const deleteAccount = useRepositoryMutation(
    (repository, id: string) => repository.deleteAccount(id),
    ["accounts"],
  );

  const rows = accounts.data ?? [];
  const appSettings = settings.data;
  const currencyOptions = useMemo(() => buildConfiguredCurrencyOptions(appSettings), [appSettings]);
  const selectedCurrency = currencyOptions.includes(form.currency) ? form.currency : currencyOptions[0];
  const isEditing = Boolean(editingId);
  const groupedAccounts = accountTypes
    .map((type) => ({ type, rows: rows.filter((a) => a.type === type) }))
    .filter((g) => g.rows.length);

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
      setShowForm(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "帳戶儲存失敗。");
    }
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setShowForm(true);
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

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyAccount);
    setShowForm(false);
    setMessage("");
  }

  // Assign stable color index per account (by position in flat list)
  const colorMap = new Map(rows.map((a, i) => [a.id, CHART_COLORS[i % 5]]));

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>
            {rows.length} 個帳戶 · {appSettings?.primaryCurrency ?? "TWD"} base
          </div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            帳戶
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="ns-btn"
            onClick={() => downloadCsv("northstar-accounts.csv", exportAccountsCsv(rows))}
          >
            匯出 CSV
          </button>
          <button
            className="ns-btn primary"
            onClick={() => { cancelEdit(); setShowForm(true); }}
          >
            <Plus size={14} weight="bold" />新增帳戶
          </button>
        </div>
      </div>

      {/* ── Inline form (shown when adding/editing) ── */}
      {showForm && (
        <div className="ns-card" style={{ marginBottom: 20, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 600 }}>
              {isEditing ? "編輯帳戶" : "新增帳戶"}
            </h3>
            <button className="ns-btn ghost" onClick={cancelEdit} style={{ padding: 6 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            <Field label="名稱">
              <TextInput
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="台幣生活帳戶"
              />
            </Field>
            <Field label="幣別">
              <SelectInput
                value={selectedCurrency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectInput>
            </Field>
            <Field label="類型">
              <SelectInput
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
              >
                {accountTypes.map((t) => <option key={t} value={t}>{accountTypeLabels[t]}</option>)}
              </SelectInput>
            </Field>
            <Field label="期初餘額">
              <TextInput
                type="number"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
              />
            </Field>
            {form.type === "credit" && (
              <>
                <Field label="信用額度">
                  <TextInput
                    type="number"
                    value={form.creditLimit ?? ""}
                    onChange={(e) => setForm({ ...form, creditLimit: e.target.value ? Number(e.target.value) : null })}
                    placeholder="120000"
                  />
                </Field>
                <Field label="共用額度群組">
                  <TextInput
                    value={form.creditLimitGroup}
                    onChange={(e) => setForm({ ...form, creditLimitGroup: e.target.value })}
                    placeholder="玉山信用卡"
                  />
                </Field>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={form.isSharedToHousehold}
              onChange={(e) => setForm({ ...form, isSharedToHousehold: e.target.checked })}
            />
            未來納入家庭視圖
          </label>
          {message ? <div style={{ marginTop: 8 }}><StatusText>{message}</StatusText></div> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="ns-btn primary" onClick={submit}>
              {isEditing ? "儲存" : "新增"}
            </button>
            <button className="ns-btn" onClick={cancelEdit}>取消</button>
          </div>
        </div>
      )}

      {/* ── Account groups ── */}
      <div style={{ display: "grid", gap: 16 }}>
        {groupedAccounts.length === 0 ? (
          <div className="ns-card" style={{ padding: 40, textAlign: "center" }}>
            <div className="muted" style={{ fontSize: 14 }}>尚無帳戶 · 點擊「新增帳戶」開始</div>
          </div>
        ) : (
          groupedAccounts.map((group) => {
            const groupTotal = group.rows.reduce((sum, a) => {
              if (!appSettings) return sum + a.balance;
              const conv = convertCurrency(a.balance, a.currency, appSettings.primaryCurrency, appSettings);
              return sum + (conv ?? a.balance);
            }, 0);
            const isLiability = group.type === "credit" || group.type === "loan";

            return (
              <div key={group.type} className="ns-card" style={{ padding: 0 }}>
                {/* Group header */}
                <div
                  style={{
                    padding: "14px 22px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderBottom: "1px solid var(--ns-border)",
                  }}
                >
                  <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>
                    {accountTypeLabels[group.type]}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="dim mono" style={{ fontSize: 11 }}>{group.rows.length} 個帳戶</span>
                    <span
                      className="num"
                      style={{
                        fontSize: 16, fontWeight: 500,
                        color: isLiability && groupTotal < 0 ? "var(--ns-neg)" : undefined,
                      }}
                    >
                      {formatMoney(groupTotal, appSettings?.primaryCurrency ?? "TWD")}
                    </span>
                  </div>
                </div>

                {/* Account rows */}
                {group.rows.map((account) => {
                  const converted = appSettings
                    ? convertCurrency(account.balance, account.currency, appSettings.primaryCurrency, appSettings)
                    : null;
                  const groupCredit =
                    account.type === "credit" && account.creditLimitGroup
                      ? calculateCreditGroup(account.creditLimitGroup, rows)
                      : null;
                  const initials = account.name.replace(/\s+/g, "").slice(0, 2).toUpperCase();
                  const color = colorMap.get(account.id) ?? CHART_COLORS[0];
                  const isNegative = account.balance < 0;

                  return (
                    <div key={account.id} className="ns-row" style={{ gap: 14 }}>
                      <Mark label={initials} color={isNegative ? "var(--ns-neg)" : color} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 500 }}>{account.name}</span>
                          <span className="ns-pill" style={{ fontSize: 10.5, padding: "2px 7px" }}>{account.currency}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {accountTypeLabels[account.type]}
                          {groupCredit ? ` · 已用 ${formatNumber(groupCredit.used)} / ${formatNumber(groupCredit.limit)}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          className="num"
                          style={{
                            fontSize: 15, fontWeight: 500,
                            color: isNegative ? "var(--ns-neg)" : undefined,
                          }}
                        >
                          {formatNumber(account.balance)} {account.currency}
                        </div>
                        {converted !== null && appSettings && account.currency !== appSettings.primaryCurrency ? (
                          <div className="muted mono" style={{ fontSize: 11.5 }}>
                            {formatMoney(converted, appSettings.primaryCurrency)}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="ns-btn ghost"
                          style={{ padding: 7 }}
                          onClick={() => startEdit(account)}
                          title="編輯"
                        >
                          <PencilSimple size={14} />
                        </button>
                        <button
                          className="ns-btn ghost"
                          style={{ padding: 7, color: "var(--ns-neg)" }}
                          onClick={async () => {
                            try {
                              await deleteAccount.mutateAsync(account.id);
                            } catch (error) {
                              setMessage(error instanceof Error ? error.message : "刪除失敗。");
                            }
                          }}
                          title="刪除"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function calculateCreditGroup(name: string, accounts: Account[]) {
  const groupRows = accounts.filter((a) => a.type === "credit" && a.creditLimitGroup === name);
  const used = groupRows.reduce((sum, a) => sum + Math.max(0, -a.balance), 0);
  const limit = Math.max(...groupRows.map((a) => a.creditLimit ?? 0), 0);
  return { name, used, limit };
}

function buildConfiguredCurrencyOptions(settings: AppSettings | undefined) {
  const values = [
    settings?.primaryCurrency ?? "TWD",
    ...(settings?.exchangeRates.flatMap((r) => [r.from, r.to]) ?? []),
  ];
  return [...new Set(values.map((v) => v.trim().toUpperCase()).filter(Boolean))];
}
