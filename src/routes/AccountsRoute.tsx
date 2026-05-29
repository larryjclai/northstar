import { DownloadSimple, PencilSimple, Plus, Scales, Trash, X } from "@phosphor-icons/react";
import { ReactNode, useMemo, useState, useEffect } from "react";
import EmojiPicker from "emoji-picker-react";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { downloadCsv, exportAccountsCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { Account, AccountType, AppSettings } from "../domain";
import { convertCurrency, formatNumber, nowAsDatetimeLocal } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";

type AccountFormState = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "statementDay" | "paymentDueDay" | "isSharedToHousehold" | "loanStartDate" | "annualInterestRate" | "loanTerm" | "iconName" | "color">;

const emptyAccount: AccountFormState = {
  name: "",
  currency: "TWD",
  openingBalance: 0,
  type: "depository",
  creditLimit: null,
  creditLimitGroup: "",
  statementDay: null,
  paymentDueDay: null,
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
};

const accountTypes: AccountType[] = ["depository", "cash", "credit", "loan", "investment", "alternative", "other"];
const accountTypeLabels: Record<AccountType, string> = {
  depository: "銀行帳戶",
  cash: "現金",
  credit: "信用卡",
  loan: "貸款",
  investment: "投資",
  alternative: "實體資產",
  other: "其他",
};
const accountTypeDescriptions: Record<AccountType, string> = {
  depository: "支票、存款帳戶",
  cash: "實體現金",
  credit: "信用卡、預付卡",
  loan: "房貸、車貸、學貸",
  investment: "券商、基金帳戶",
  alternative: "房產、貴金屬、汽車（手動更新市值）",
  other: "其他類型",
};

const ACCOUNT_COLORS = ["#f0c050", "#6fb3ff", "#a99cff", "#6ee49a", "#ff7d6b", "#34c5b0", "#f0a050", "#9fe870", "#d97a9c", "#868685"];

// Display grouping that mirrors the prototype (Cash / Investment / Credit·liabilities / Other).
const GROUP_ORDER: { key: string; label: string; types: AccountType[] }[] = [
  { key: "cash", label: "現金 / 存款", types: ["depository", "cash"] },
  { key: "investment", label: "投資 / 券商", types: ["investment"] },
  { key: "alternative", label: "實體資產 / 其他資產", types: ["alternative"] },
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
      iconName: account.iconName ?? null, color: account.color ?? null,
      statementDay: account.statementDay ?? null, paymentDueDay: account.paymentDueDay ?? null,
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
                    <div style={{ width: 36, height: 36, borderRadius: "var(--ns-r-sm)", flexShrink: 0, background: a.color || MARK_COLORS[i % MARK_COLORS.length], color: a.iconName ? undefined : "var(--ns-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: a.iconName ? 18 : 13 }}>
                      {a.iconName || a.name.slice(0, 2)}
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
  onSubmit: () => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [importMethod, setImportMethod] = useState('skip');
  const [csvDropped, setCsvDropped] = useState(false);

  // If we open in edit mode, go straight to step 1
  useEffect(() => {
    if (isEditing) {
      setStep(1);
    } else if (step === 0 && typeStep) {
      setStep(1);
    }
  }, [isEditing, typeStep]);

  const stepLabels = ['帳戶類型', '基本資料', '初始餘額', '完成'];

  async function handleNext() {
    if (step === 2 || isEditing) {
      await onSubmit();
      if (!isEditing) setStep(3);
    } else {
      setStep(s => s + 1);
    }
  }

  function handleBack() {
    if (step === 0) onClose();
    else if (step === 1 && !isEditing) {
      setTypeStep(null as any);
      setStep(0);
    }
    else if (step === 1 && isEditing) onClose();
    else setStep(s => s - 1);
  }

  const canAdvance = step === 0 ? !!typeStep : step === 1 ? !!form.name.trim() : true;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(520px, 100%)", background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)", display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px rgba(0,0,0,0.45)" }}
      >
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--ns-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent)", color: "var(--ns-accent-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={16} weight="bold" />
              </div>
              <h2 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 600 }}>
                {isEditing ? "編輯帳戶" : "新增帳戶"}
              </h2>
            </div>
            <button className="ns-btn ghost icon" onClick={onClose} aria-label="關閉"><X size={16} /></button>
          </div>
          {!isEditing && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {stepLabels.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < stepLabels.length - 1 ? 1 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                      background: i < step ? 'var(--ns-accent)' : i === step ? 'var(--ns-fg)' : 'var(--ns-bg-hover)',
                      color: i < step ? 'var(--ns-accent-fg)' : i === step ? 'var(--ns-bg)' : 'var(--ns-fg-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--ns-font-mono)', fontWeight: 700, fontSize: 10,
                    }}>
                      {i < step ? "✓" : i + 1}
                    </div>
                    <span style={{
                      fontSize: 11.5, whiteSpace: 'nowrap',
                      color: i === step ? 'var(--ns-fg)' : 'var(--ns-fg-dim)',
                      fontWeight: i === step ? 500 : 400,
                    }}>{s}</span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div style={{
                      flex: 1, height: 1, margin: '0 6px', minWidth: 8,
                      background: i < step ? 'var(--ns-accent)' : 'var(--ns-border)',
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {step === 0 && !isEditing && (
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 1 of 4</div>
              <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>選擇帳戶類型</h3>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>帳戶類型決定記帳方式與報表歸類，之後仍可更改。</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {accountTypes.map((type) => (
                  <div key={type} onClick={() => setTypeStep(type)} style={{
                    padding: '14px 16px', borderRadius: 'var(--ns-r-md)',
                    background: typeStep === type ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
                    border: typeStep === type ? '1.5px solid var(--ns-accent)' : '1px solid var(--ns-border)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--ns-r-sm)', flexShrink: 0,
                      background: typeStep === type ? 'var(--ns-accent)' : 'var(--ns-bg-elev)',
                      color: typeStep === type ? 'var(--ns-accent-fg)' : 'var(--ns-fg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {accountTypeLabels[type].slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{accountTypeLabels[type]}</div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{accountTypeDescriptions[type]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              {!isEditing && <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 2 of 4</div>}
              <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
                {isEditing ? "帳戶基本資料" : "帳戶基本資料"}
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                <DrawerField label="名稱 *">
                  <input className="ns-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：玉山活存、富邦證券" />
                </DrawerField>
                <DrawerField label="幣別">
                  <select className="ns-input" style={{ appearance: "none" }} value={selectedCurrency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </DrawerField>

                <DrawerField label="圖示與顏色（選填）">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Popover>
                      <PopoverTrigger style={{ width: 40, height: 40, borderRadius: "var(--ns-r-sm)", fontSize: 20, background: form.color || "var(--ns-bg-hover)", border: "1px solid var(--ns-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {form.iconName || "＋"}
                      </PopoverTrigger>
                      <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
                        <EmojiPicker onEmojiClick={(e) => setForm({ ...form, iconName: e.emoji })} width={300} height={400} />
                      </PopoverContent>
                    </Popover>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ACCOUNT_COLORS.map((c) => (
                        <div key={c} onClick={() => setForm({ ...form, color: c })} style={{ width: 22, height: 22, borderRadius: 99, background: c, cursor: "pointer", outline: form.color === c ? "2px solid var(--ns-fg)" : "none", outlineOffset: 2 }} />
                      ))}
                    </div>
                    {(form.iconName || form.color) ? (
                      <button type="button" className="ns-btn ghost" style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto" }} onClick={() => setForm({ ...form, iconName: null, color: null })}>清除</button>
                    ) : null}
                  </div>
                </DrawerField>

                {form.type === "credit" ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <DrawerField label="信用額度">
                        <input className="ns-input" type="number" value={form.creditLimit ?? ""} onChange={(e) => setForm({ ...form, creditLimit: e.target.value ? Number(e.target.value) : null })} placeholder="120000" />
                      </DrawerField>
                      <DrawerField label="共用額度群組">
                        <input className="ns-input" value={form.creditLimitGroup} onChange={(e) => setForm({ ...form, creditLimitGroup: e.target.value })} placeholder="玉山信用卡" />
                      </DrawerField>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <DrawerField label="結帳日（每月）">
                        <input className="ns-input" type="number" min={1} max={31} value={form.statementDay ?? ""} onChange={(e) => setForm({ ...form, statementDay: e.target.value ? Math.min(31, Math.max(1, Number(e.target.value))) : null })} placeholder="例：5" />
                      </DrawerField>
                      <DrawerField label="繳款日（每月）">
                        <input className="ns-input" type="number" min={1} max={31} value={form.paymentDueDay ?? ""} onChange={(e) => setForm({ ...form, paymentDueDay: e.target.value ? Math.min(31, Math.max(1, Number(e.target.value))) : null })} placeholder="例：22" />
                      </DrawerField>
                    </div>
                  </>
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

                {/* Household toggle removed temporarily as feature is not released */}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 3 of 4</div>
              <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>初始餘額與匯入</h3>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
                設定今天的帳戶餘額。也可以直接匯入 CSV 交易紀錄。
              </p>

              <div style={{ marginBottom: 20 }}>
                <DrawerField label={`${form.type === "alternative" ? "目前市值" : "當前餘額"}（${form.currency}）`}>
                  <input className="ns-input" style={{ fontSize: 22, fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', height: 56 }} type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                </DrawerField>
                {form.type === "alternative" && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>輸入此資產目前的估計市值，日後可用「調整餘額」手動更新。</div>
                )}
                {form.type === 'credit' && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    信用卡餘額請輸入「本期消費應還金額」，系統會記錄為負數（負債）
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>交易紀錄匯入 <span className="dim">（選填）</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: 'skip', label: '先跳過，稍後手動新增', sub: '' },
                    { id: 'csv', label: '匯入 CSV 交易紀錄', sub: '支援富邦、玉山、永豐、IBKR 等格式' },
                  ].map(m => (
                    <div key={m.id} onClick={() => setImportMethod(m.id)} style={{
                      padding: '13px 16px', borderRadius: 'var(--ns-r-md)',
                      background: importMethod === m.id ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
                      border: importMethod === m.id ? '1.5px solid var(--ns-accent)' : '1px solid var(--ns-border)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.label}</div>
                        {m.sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.sub}</div>}
                      </div>
                      {importMethod === m.id && <div style={{ color: 'var(--ns-accent)' }}>✓</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 99, background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px color-mix(in srgb, var(--ns-accent) 38%, transparent)', marginBottom: 20 }}>
                <Plus size={32} />
              </div>
              <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>帳戶已建立</h2>
              <p className="muted" style={{ fontSize: 13.5, margin: '0 0 28px', lineHeight: 1.6, maxWidth: 340 }}>
                <strong style={{ color: 'var(--ns-fg)' }}>{form.name || '新帳戶'}</strong> 已加入 Northstar。<br />所有資料只存在這台電腦。
              </p>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 8 }}>
          {step < 3 ? (
            <>
              <button className="ns-btn ghost" style={{ flex: "0 0 90px", justifyContent: "center" }} onClick={handleBack}>
                {step === 0 || (step === 1 && isEditing) ? "取消" : "← 上一步"}
              </button>
              <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center", opacity: canAdvance ? 1 : 0.45 }} onClick={() => canAdvance && handleNext()} disabled={pending}>
                {pending ? "處理中…" : step === 2 || isEditing ? "儲存" : "下一步 →"}
              </button>
            </>
          ) : (
            <>
              <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>完成</button>
            </>
          )}
        </div>
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
