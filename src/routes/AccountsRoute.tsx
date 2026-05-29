import { DownloadSimple, PencilSimple, Plus, Scales, Trash, X } from "@phosphor-icons/react";
import { ReactNode, useMemo, useState } from "react";
import { downloadCsv, exportAccountsCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { Account, AccountType, AppSettings } from "../domain";
import { convertCurrency, formatNumber, nowAsDatetimeLocal } from "../domain";
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

// Display grouping that mirrors the prototype (Cash / Investment / Credit·liabilities / Other).
const GROUP_ORDER: { key: string; label: string; types: AccountType[] }[] = [
  { key: "cash", label: "現金 / 存款", types: ["depository", "cash"] },
  { key: "investment", label: "投資 / 券商", types: ["investment"] },
  { key: "credit", label: "信用卡 / 負債", types: ["credit", "loan"] },
  { key: "other", label: "其他", types: ["other"] },
];

const MARK_COLORS = ["var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)", "var(--ns-chart-4)", "var(--ns-chart-5)"];

export function AccountsRoute() {
  const { accounts, settings } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [typeStep, setTypeStep] = useState<AccountType | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyAccount);
  const [message, setMessage] = useState("");
  const [adjustingAccountId, setAdjustingAccountId] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustDate, setAdjustDate] = useState("");
  const [adjustMessage, setAdjustMessage] = useState("");

  const createAccount = useRepositoryMutation((repository, input: AccountFormState) => repository.createAccount(input), ["accounts"]);
  const updateAccount = useRepositoryMutation((repository, input: AccountFormState & { id: string }) => repository.updateAccount(input.id, input), ["accounts"]);
  const deleteAccount = useRepositoryMutation((repository, id: string) => repository.deleteAccount(id), ["accounts"]);
  const adjustBalance = useRepositoryMutation(
    (repository, input: { accountId: string; targetBalance: number; date: string; note: string }) =>
      repository.adjustAccountBalance(input.accountId, input.targetBalance, input.date, input.note),
    ["accounts", "ledger"],
  );

  const rows = accounts.data ?? [];
  const appSettings = settings.data;
  const primaryCurrency = appSettings?.primaryCurrency ?? "TWD";
  const currencyOptions = useMemo(() => buildConfiguredCurrencyOptions(appSettings), [appSettings]);
  const selectedCurrency = currencyOptions.includes(form.currency) ? form.currency : currencyOptions[0];
  const isEditing = Boolean(editingId);

  const toBase = (value: number, currency: string) =>
    appSettings ? convertCurrency(value, currency, primaryCurrency, appSettings) ?? value : value;

  // Currency breakdown (by native currency, valued in base).
  const currencyBreakdown = useMemo(() => {
    const byCcy = new Map<string, { base: number; native: number }>();
    for (const a of rows) {
      const cur = byCcy.get(a.currency) ?? { base: 0, native: 0 };
      cur.base += toBase(a.balance, a.currency);
      cur.native += a.balance;
      byCcy.set(a.currency, cur);
    }
    const totalAbs = [...byCcy.values()].reduce((s, v) => s + Math.abs(v.base), 0) || 1;
    return [...byCcy.entries()]
      .map(([ccy, v], i) => ({ ccy, ...v, pct: (Math.abs(v.base) / totalAbs) * 100, color: MARK_COLORS[i % MARK_COLORS.length] }))
      .sort((a, b) => Math.abs(b.base) - Math.abs(a.base))
      .slice(0, 4);
  }, [rows, appSettings]);

  const groups = useMemo(() => {
    return GROUP_ORDER.map((g) => {
      const groupRows = rows.filter((a) => g.types.includes(a.type));
      const total = groupRows.reduce((s, a) => s + toBase(a.balance, a.currency), 0);
      return { ...g, rows: groupRows, total };
    }).filter((g) => g.rows.length > 0);
  }, [rows, appSettings]);

  function openCreate() {
    setEditingId(null);
    setTypeStep(null);
    setForm(emptyAccount);
    setMessage("");
    setDrawerOpen(true);
  }
  function startEdit(account: Account) {
    setEditingId(account.id);
    setTypeStep(account.type);
    setForm({
      name: account.name, currency: account.currency, openingBalance: account.openingBalance, type: account.type,
      creditLimit: account.creditLimit, creditLimitGroup: account.creditLimitGroup, isSharedToHousehold: account.isSharedToHousehold,
      loanStartDate: account.loanStartDate, annualInterestRate: account.annualInterestRate, loanTerm: account.loanTerm,
    });
    setMessage("");
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setTypeStep(null);
    setForm(emptyAccount);
    setMessage("");
  }

  async function submit() {
    setMessage("");
    if (!form.name.trim()) { setMessage("請輸入帳戶名稱。"); return; }
    try {
      const payload = { ...form, currency: selectedCurrency };
      if (editingId) await updateAccount.mutateAsync({ ...payload, id: editingId });
      else await createAccount.mutateAsync(payload);
      closeDrawer();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "帳戶儲存失敗。");
    }
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
    if (Number.isNaN(target)) { setAdjustMessage("請輸入有效的目標餘額。"); return; }
    try {
      await adjustBalance.mutateAsync({ accountId: adjustingAccountId!, targetBalance: target, date: adjustDate, note: adjustNote.trim() || "手動調整餘額" });
      setAdjustingAccountId(null);
    } catch (error) {
      setAdjustMessage(error instanceof Error ? error.message : "調整失敗。");
    }
  }
  const adjustingAccount = adjustingAccountId ? rows.find((r) => r.id === adjustingAccountId) : null;

  return (
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{rows.length} accounts · {primaryCurrency} base</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>帳戶</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn" onClick={() => downloadCsv("northstar-accounts.csv", exportAccountsCsv(rows))}><DownloadSimple size={14} />匯出</button>
          <button className="ns-btn primary" onClick={openCreate}><Plus size={14} weight="bold" />新增帳戶</button>
        </div>
      </div>

      {/* Currency breakdown */}
      {currencyBreakdown.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {currencyBreakdown.map((c) => (
            <div className="ns-card" key={c.ccy} style={{ padding: 16 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{c.ccy}</div>
              <div style={{ fontSize: 19, fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums" }}>{formatNumber(c.base)}</div>
              <div style={{ height: 6, borderRadius: 99, background: "var(--ns-bg-hover)", marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${c.pct}%`, height: "100%", background: c.color }} />
              </div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>{c.pct.toFixed(1)}% of total</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Account groups */}
      {rows.length === 0 ? (
        <div className="ns-card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒有帳戶</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 18 }}>新增銀行、現金、信用卡或券商帳戶，淨值與收支才有可靠基礎。</div>
          <button className="ns-btn primary" onClick={openCreate}><Plus size={14} weight="bold" />新增第一個帳戶</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {groups.map((g) => (
            <div key={g.key} className="ns-card" style={{ padding: 0 }}>
              <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
                <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>{g.label}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span className="dim mono" style={{ fontSize: 11 }}>{g.rows.length} accounts</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 500, color: g.total < 0 ? "var(--ns-neg)" : undefined }}>
                    {g.total < 0 ? "−" : ""}{formatNumber(Math.abs(g.total))}
                  </span>
                </div>
              </div>
              {g.rows.map((a, i) => {
                const base = toBase(a.balance, a.currency);
                const groupCredit = a.type === "credit" && a.creditLimitGroup ? calculateCreditGroup(a.creditLimitGroup, rows) : null;
                return (
                  <div key={a.id} className="ns-acct-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", borderTop: i ? "1px solid var(--ns-border)" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "var(--ns-r-sm)", flexShrink: 0, background: MARK_COLORS[i % MARK_COLORS.length], color: "var(--ns-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}>
                      {a.name.slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                        <span className="ns-pill" style={{ fontSize: 10.5, padding: "2px 7px" }}>{a.currency}</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {accountTypeLabels[a.type]}
                        {a.type === "credit" && a.creditLimit ? ` · 額度 ${formatNumber(a.creditLimit)}` : ""}
                        {groupCredit ? ` · 共用 ${groupCredit.name}` : ""}
                        {a.type === "loan" && a.annualInterestRate !== null ? ` · 年利率 ${a.annualInterestRate}%` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="num" style={{ fontSize: 15, fontWeight: 500, color: a.balance < 0 ? "var(--ns-neg)" : undefined }}>
                        {a.balance < 0 ? "−" : ""}{formatNumber(Math.abs(base))}
                      </div>
                      {a.currency !== primaryCurrency ? <div className="muted mono" style={{ fontSize: 11.5 }}>{formatNumber(a.balance)} {a.currency}</div> : null}
                    </div>
                    <div className="ns-acct-actions" style={{ display: "flex", gap: 4 }}>
                      <button className="ns-btn ghost icon" title="編輯" onClick={() => startEdit(a)}><PencilSimple size={14} /></button>
                      <button className="ns-btn ghost icon" title="調整餘額" onClick={() => openAdjust(a)}><Scales size={14} /></button>
                      <button className="ns-btn ghost icon" title="刪除" style={{ color: "var(--ns-neg)" }} onClick={async () => { try { await deleteAccount.mutateAsync(a.id); } catch (e) { setMessage(e instanceof Error ? e.message : "刪除失敗。"); } }}><Trash size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {message ? <div className="ns-card" style={{ padding: "10px 16px", color: "var(--ns-neg)", fontSize: 13 }}>{message}</div> : null}
        </div>
      )}

      {/* Add / edit drawer */}
      {drawerOpen ? (
        <AccountDrawer
          isEditing={isEditing}
          typeStep={typeStep}
          setTypeStep={(t) => { setTypeStep(t); setForm({ ...emptyAccount, type: t }); setMessage(""); }}
          form={form}
          setForm={setForm}
          selectedCurrency={selectedCurrency}
          currencyOptions={currencyOptions}
          message={message}
          pending={createAccount.isPending || updateAccount.isPending}
          onSubmit={submit}
          onClose={closeDrawer}
        />
      ) : null}

      {/* Adjust modal */}
      {adjustingAccount ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} onClick={() => setAdjustingAccountId(null)}>
          <div className="ns-card" style={{ width: "100%", maxWidth: 420, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ns-border)" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>調整餘額 · {adjustingAccount.name}</h2>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>目前餘額：{formatNumber(adjustingAccount.balance)} {adjustingAccount.currency}</div>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <DrawerField label="目標餘額">
                <input className="ns-input" type="number" value={adjustTarget} onChange={(e) => setAdjustTarget(e.target.value)} />
              </DrawerField>
              <DrawerField label="調整時間">
                <input className="ns-input" type="datetime-local" value={adjustDate} onChange={(e) => setAdjustDate(e.target.value)} />
              </DrawerField>
              <DrawerField label="備註（選填）">
                <input className="ns-input" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="例如：對帳後修正" />
              </DrawerField>
              {adjustMessage ? <div style={{ color: "var(--ns-neg)", fontSize: 13 }}>{adjustMessage}</div> : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={submitAdjust} disabled={adjustBalance.isPending}>{adjustBalance.isPending ? "調整中…" : "確認調整"}</button>
                <button className="ns-btn" onClick={() => setAdjustingAccountId(null)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountDrawer({
  isEditing, typeStep, setTypeStep, form, setForm, selectedCurrency, currencyOptions, message, pending, onSubmit, onClose,
}: {
  isEditing: boolean;
  typeStep: AccountType | null;
  setTypeStep: (t: AccountType) => void;
  form: AccountFormState;
  setForm: (v: AccountFormState) => void;
  selectedCurrency: string;
  currencyOptions: string[];
  message: string;
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(480px, 100%)", background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)", display: "flex", flexDirection: "column", boxShadow: "-20px 0 60px rgba(0,0,0,0.4)" }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 600 }}>
            {isEditing ? "編輯帳戶" : typeStep ? `新增${accountTypeLabels[typeStep]}` : "新增帳戶"}
          </h2>
          <div style={{ flex: 1 }} />
          <button className="ns-btn ghost icon" onClick={onClose} aria-label="關閉"><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {!typeStep && !isEditing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>請先選擇帳戶種類：</div>
              {accountTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeStep(type)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderRadius: "var(--ns-r-md)", background: "var(--ns-bg-card)", border: "1px solid var(--ns-border)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 600 }}>{accountTypeLabels[type].slice(0, 1)}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ns-fg)" }}>{accountTypeLabels[type]}</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{accountTypeDescriptions[type]}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DrawerField label="名稱">
                <input className="ns-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="台幣生活帳戶" />
              </DrawerField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <DrawerField label="幣別">
                  <select className="ns-input" style={{ appearance: "none" }} value={selectedCurrency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </DrawerField>
                <DrawerField label="期初餘額">
                  <input className="ns-input" type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                </DrawerField>
              </div>

              {form.type === "credit" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <DrawerField label="信用額度">
                    <input className="ns-input" type="number" value={form.creditLimit ?? ""} onChange={(e) => setForm({ ...form, creditLimit: e.target.value ? Number(e.target.value) : null })} placeholder="120000" />
                  </DrawerField>
                  <DrawerField label="共用額度群組">
                    <input className="ns-input" value={form.creditLimitGroup} onChange={(e) => setForm({ ...form, creditLimitGroup: e.target.value })} placeholder="玉山信用卡" />
                  </DrawerField>
                </div>
              ) : null}

              {form.type === "loan" ? (
                <>
                  <DrawerField label="貸款開始日期">
                    <input className="ns-input" type="date" value={form.loanStartDate ?? ""} onChange={(e) => setForm({ ...form, loanStartDate: e.target.value || null })} />
                  </DrawerField>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <DrawerField label="年利率（%）">
                      <input className="ns-input" type="number" step="0.01" value={form.annualInterestRate ?? ""} onChange={(e) => setForm({ ...form, annualInterestRate: e.target.value ? Number(e.target.value) : null })} placeholder="2.5" />
                    </DrawerField>
                    <DrawerField label="貸款期限（月）">
                      <input className="ns-input" type="number" value={form.loanTerm ?? ""} onChange={(e) => setForm({ ...form, loanTerm: e.target.value ? Number(e.target.value) : null })} placeholder="240" />
                    </DrawerField>
                  </div>
                </>
              ) : null}

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.isSharedToHousehold} onChange={(e) => setForm({ ...form, isSharedToHousehold: e.target.checked })} />
                未來納入家庭視圖
              </label>

              {message ? <div style={{ color: "var(--ns-neg)", fontSize: 13 }}>{message}</div> : null}
            </div>
          )}
        </div>

        {(typeStep || isEditing) ? (
          <div style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 8 }}>
            <button className="ns-btn ghost" style={{ flex: "0 0 80px", justifyContent: "center" }} onClick={onClose}>取消</button>
            <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={onSubmit} disabled={pending}>
              {pending ? "儲存中…" : isEditing ? "儲存變更" : "新增帳戶"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>{label}</label>
      {children}
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
