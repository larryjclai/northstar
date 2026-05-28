import { ArrowsClockwise, ArrowsLeftRight, CaretRight, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (isNaN(diff) || diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes || 1}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `昨天`;
  return `${days}d ago`;
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

  const colorMap = new Map(rows.map((a, i) => [a.id, CHART_COLORS[i % 5]]));

  const totalNetWorth = rows.reduce((sum, a) => {
    if (!appSettings) return sum + a.balance;
    const conv = convertCurrency(a.balance, a.currency, appSettings.primaryCurrency, appSettings);
    return sum + (conv ?? a.balance);
  }, 0);

  const currencyStats = useMemo(() => {
    const map = new Map<string, { native: number; base: number }>();
    for (const a of rows) {
      let key = a.currency;
      if (key === "BTC" || key === "ETH") key = "Crypto"; // Group crypto slightly if needed, or just keep as is.
      const curr = map.get(key) || { native: 0, base: 0 };
      curr.native += a.balance;
      const baseVal = appSettings ? (convertCurrency(a.balance, a.currency, appSettings.primaryCurrency, appSettings) ?? a.balance) : a.balance;
      curr.base += baseVal;
      map.set(key, curr);
    }
    return Array.from(map.entries())
      .map(([currency, vals]) => {
        const pct = totalNetWorth === 0 ? 0 : (Math.max(0, vals.base) / Math.max(1, totalNetWorth)) * 100;
        return {
          currency,
          native: vals.native,
          base: vals.base,
          pct,
        };
      })
      .sort((a, b) => b.base - a.base)
      .slice(0, 4); // Top 4
  }, [rows, appSettings, totalNetWorth]);

  const groupedAccounts = [
    {
      name: 'Cash & deposits',
      types: ["depository", "cash"],
    },
    {
      name: 'Investment',
      types: ["investment", "other"],
    },
    {
      name: 'Credit · liabilities',
      types: ["credit", "loan"],
    }
  ].map(group => {
    const groupRows = rows.filter(a => group.types.includes(a.type));
    const total = groupRows.reduce((sum, a) => {
      const conv = appSettings ? convertCurrency(a.balance, a.currency, appSettings.primaryCurrency, appSettings) : null;
      return sum + (conv ?? a.balance);
    }, 0);
    return { name: group.name, rows: groupRows, total };
  }).filter(g => g.rows.length > 0);

  return (
    <div style={{ padding: "24px 32px 100px", height: "100%", overflow: "auto" }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>
            {rows.length} accounts · {appSettings?.primaryCurrency ?? "TWD"} base
          </div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
            Accounts
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn" onClick={() => downloadCsv("northstar-accounts.csv", exportAccountsCsv(rows))}>
            <ArrowsClockwise size={14} />Refresh FX
          </button>
          <button className="ns-btn">
            <ArrowsLeftRight size={14} />Transfer
          </button>
          <button className="ns-btn primary" onClick={() => { cancelEdit(); setShowForm(true); }}>
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

      {/* ── Currency breakdown card ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {currencyStats.map((r, i) => {
          const isBase = appSettings?.primaryCurrency === r.currency;
          return (
            <div className="ns-card" key={r.currency} style={{ padding: 16 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{r.currency}</div>
              <div style={{ fontSize: 19, fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(r.base, appSettings?.primaryCurrency ?? "TWD")}
                {!isBase && <span className="muted" style={{ fontSize: 13 }}> · {formatNumber(r.native)}</span>}
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "var(--ns-bg-hover)", marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: r.pct + "%", height: "100%", background: CHART_COLORS[i % 5] }} />
              </div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>{r.pct.toFixed(1)}% of total</div>
            </div>
          )
        })}
      </div>

      {/* ── Account groups ── */}
      <div style={{ display: "grid", gap: 16 }}>
        {groupedAccounts.length === 0 ? (
          <div className="ns-card" style={{ padding: 40, textAlign: "center" }}>
            <div className="muted" style={{ fontSize: 14 }}>尚無帳戶 · 點擊「新增帳戶」開始</div>
          </div>
        ) : (
          groupedAccounts.map((group) => {
            const isLiability = group.name.includes("liabilities");
            return (
              <div key={group.name} className="ns-card" style={{ padding: 0 }}>
                <div
                  style={{
                    padding: "14px 22px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderBottom: "1px solid var(--ns-border)",
                  }}
                >
                  <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>
                    {group.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="dim mono" style={{ fontSize: 11 }}>{group.rows.length} accounts</span>
                    <span
                      className="num"
                      style={{
                        fontSize: 16, fontWeight: 500,
                        color: isLiability && group.total < 0 ? "var(--ns-neg)" : undefined,
                      }}
                    >
                      {formatMoney(group.total, appSettings?.primaryCurrency ?? "TWD")}
                    </span>
                  </div>
                </div>

                {group.rows.map((account) => {
                  const converted = appSettings
                    ? convertCurrency(account.balance, account.currency, appSettings.primaryCurrency, appSettings)
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
                          synced {timeAgo(account.updatedAt)}
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
                          {formatMoney(converted ?? account.balance, appSettings?.primaryCurrency ?? "TWD")}
                        </div>
                        {converted !== null && appSettings && account.currency !== appSettings.primaryCurrency ? (
                          <div className="muted mono" style={{ fontSize: 11.5 }}>
                            {formatNumber(account.balance)}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <button
                          className="ns-btn ghost"
                          style={{ padding: 6 }}
                          onClick={() => startEdit(account)}
                          title="編輯"
                        >
                          <PencilSimple size={14} />
                        </button>
                        <button
                          className="ns-btn ghost"
                          style={{ padding: 6, color: "var(--ns-neg)" }}
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

function buildConfiguredCurrencyOptions(settings: AppSettings | undefined) {
  const values = [
    settings?.primaryCurrency ?? "TWD",
    ...(settings?.exchangeRates.flatMap((r) => [r.from, r.to]) ?? []),
  ];
  return [...new Set(values.map((v) => v.trim().toUpperCase()).filter(Boolean))];
}
