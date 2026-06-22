import { ArrowsClockwise, CaretDown, CaretRight, Check, DownloadSimple, ListChecks, PencilSimple, Percent, Plus, Scales, Trash, X } from "@phosphor-icons/react";
import { ReactNode, useMemo, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { AppSelect } from "../components/AppSelect";
import { IconPicker } from "../components/IconPicker";
import { Glyph, DEFAULT_ACCOUNT_ICON } from "../lib/icons";
import { BankLogo } from "../components/BankLogo";
import { openOnboarding } from "../components/OnboardingOverlay";
import { downloadCsv, exportAccountsCsv } from "../data/csv";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository } from "../data/repositories";
import type { Account, AccountType, AppSettings } from "../domain";
import { convertCurrency, formatNumber, nowAsDatetimeLocal } from "../domain";
import { creditBalanceLabel } from "../domain/dashboardSummary";
import { BANK_BRANDS, resolveBankBrand } from "../domain/bankBrands";
import { useUiPreferences } from "../state/uiPreferences";
import { useNumericField } from "../hooks/useNumericField";

type AccountFormState = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "statementDay" | "paymentDueDay" | "creditPaymentPaidUntil" | "isSharedToHousehold" | "loanStartDate" | "annualInterestRate" | "loanTerm" | "iconName" | "color" | "bankBrandDomain"> & { customGroup: string };

const emptyAccount: AccountFormState = {
  name: "",
  currency: "TWD",
  openingBalance: 0,
  type: "depository",
  creditLimit: null,
  creditLimitGroup: "",
  statementDay: null,
  paymentDueDay: null,
  creditPaymentPaidUntil: null,
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
  bankBrandDomain: null,
  customGroup: "",
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
  const { accounts, settings, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const navigate = useNavigate();
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [recalculating, setRecalculating] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // "all" | a GROUP_ORDER key

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
      const groupRows = rows
        .filter((a) => g.types.includes(a.type))
        .sort((a, b) => (a.customGroup || "未分組").localeCompare(b.customGroup || "未分組") || a.name.localeCompare(b.name));
      const total = groupRows.reduce((s, a) => s + toBase(a.balance, a.currency), 0);
      return { ...g, rows: groupRows, total };
    }).filter((g) => g.rows.length > 0);
  }, [rows, appSettings]);

  const visibleGroups = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    return groups
      .filter((g) => typeFilter === "all" || g.key === typeFilter)
      .map((g) => ({ ...g, rows: q ? g.rows.filter((a) => a.name.toLowerCase().includes(q)) : g.rows }))
      .filter((g) => g.rows.length > 0);
  }, [groups, accountQuery, typeFilter]);

  // Balance-sheet totals (in base currency). assets = positive balances,
  // liabilities = the magnitude of negative balances, so assets − liabilities
  // = net worth. `gross` is the denominator for each account's weight bar.
  const totals = useMemo(() => {
    let assets = 0, liabilities = 0;
    for (const a of rows) {
      const b = toBase(a.balance, a.currency);
      if (b >= 0) assets += b; else liabilities += -b;
    }
    return { assets, liabilities, net: assets - liabilities, gross: assets + liabilities };
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
      bankBrandDomain: account.bankBrandDomain ?? null,
      statementDay: account.statementDay ?? null, paymentDueDay: account.paymentDueDay ?? null,
      creditPaymentPaidUntil: account.creditPaymentPaidUntil ?? null,
      customGroup: account.customGroup ?? "",
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

  async function recalculate() {
    setRecalculating(true);
    setMessage("");
    try {
      const repository = await getFinanceRepository();
      const report = await repository.recalculateDerivedData();
      await accounts.refetch();
      setMessage(`重新計算完成：修正 ${report.changedAccounts} 個帳戶、${report.changedAssets} 個持倉。${report.incompleteTransferGroupIds.length ? ` 發現 ${report.incompleteTransferGroupIds.length} 組不完整轉帳。` : ""}${report.missingFxPairs.length ? ` 缺少匯率：${report.missingFxPairs.join("、")}。` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新計算失敗。");
    } finally {
      setRecalculating(false);
    }
  }

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[320px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px]" style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{rows.length} accounts · {primaryCurrency} base</div>
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>帳戶</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={recalculate} loading={recalculating}><ArrowsClockwise size={14} />{recalculating ? "計算中…" : "重新計算"}</Button>
          <Button variant="outline" onClick={() => downloadCsv("northstar-accounts.csv", exportAccountsCsv(rows))}><DownloadSimple size={14} />匯出</Button>
          <Button onClick={openCreate}><Plus size={14} weight="bold" />新增帳戶</Button>
        </div>
      </div>

      {/* Balance-sheet summary — always a full 3-up so a single-currency user
          doesn't see one lonely card in a 4-wide grid. */}
      {rows.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 14, marginBottom: 14 }}>
          {([
            { label: "總資產", value: totals.assets, color: "var(--ns-chart-2)", tone: undefined },
            { label: "總負債", value: totals.liabilities, color: "var(--ns-chart-5)", tone: "neg" as const },
            { label: "淨值", value: totals.net, color: "var(--ns-chart-1)", tone: totals.net < 0 ? "neg" as const : undefined },
          ]).map((c) => (
            <Card key={c.label} style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <div style={{ width: 4, height: 38, borderRadius: 99, background: c.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{c.label}</div>
                <div className={`text-xl${c.tone === "neg" ? " neg" : ""}`} style={{ fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {c.tone === "neg" && c.value !== 0 ? "−" : ""}{formatNumber(Math.abs(c.value))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Currency split — only meaningful with more than one currency. */}
      {currencyBreakdown.length > 1 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: 14, marginBottom: 20 }}>
          {currencyBreakdown.map((c) => (
            <Card key={c.ccy} style={{ padding: 16 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{c.ccy}</div>
              <div className="text-[19px]" style={{ fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums" }}>{formatNumber(c.base)}</div>
              <div style={{ height: 6, borderRadius: 99, background: "var(--ns-bg-hover)", marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${c.pct}%`, height: "100%", background: c.color }} />
              </div>
              <div className="mono dim text-caption" style={{ marginTop: 4 }}>{c.pct.toFixed(1)}% of total</div>
            </Card>
          ))}
        </div>
      ) : <div style={{ marginBottom: 6 }} />}

      {/* Search + type filter — only shown when there are enough accounts */}
      {rows.length > 5 ? (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            className="ns-input"
            type="search"
            value={accountQuery}
            onChange={(e) => setAccountQuery(e.target.value)}
            placeholder="搜尋帳戶名稱…"
            style={{ flex: "1 1 180px", minWidth: 0 }}
          />
          <AppSelect
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
            options={[
              { value: "all", label: "全部類型" },
              ...GROUP_ORDER.map((g) => ({ value: g.key, label: g.label })),
            ]}
            style={{ flex: "0 0 auto", minWidth: 140, height: 40 }}
          />
        </div>
      ) : null}

      {/* Account groups */}
      {rows.length === 0 ? (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒有帳戶</div>
          <div className="muted text-body" style={{ marginBottom: 18 }}>新增銀行、現金、信用卡或券商帳戶，或用導覽選擇 CSV 匯入與示範資料。</div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={openCreate}><Plus size={14} weight="bold" />新增第一個帳戶</Button>
            <Button variant="outline" onClick={openOnboarding}>開啟導覽</Button>
          </div>
        </Card>
      ) : visibleGroups.length === 0 ? (
        <div className="muted text-body" style={{ padding: "24px 0", textAlign: "center" }}>找不到符合的帳戶</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {visibleGroups.map((g) => (
            <Card key={g.key} style={{ padding: 0 }}>
              <div onClick={() => setCollapsedGroups((current) => {
                const next = new Set(current);
                if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                return next;
              })} style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)", cursor: "pointer" }}>
                <h3 className="text-[15px]" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500, display: "flex", alignItems: "center", gap: 7 }}>{collapsedGroups.has(g.key) ? <CaretRight size={14} /> : <CaretDown size={14} />}{g.label}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span className="dim mono text-caption">{g.rows.length} accounts</span>
                  <span className="num text-base" style={{ fontWeight: 500, color: g.total < 0 ? "var(--ns-neg)" : undefined }}>
                    {g.total < 0 ? "−" : ""}{formatNumber(Math.abs(g.total))}
                  </span>
                </div>
              </div>
              {!collapsedGroups.has(g.key) && g.rows.map((a, i) => {
                const base = toBase(a.balance, a.currency);
                const groupCredit = a.type === "credit" && a.creditLimitGroup ? calculateCreditGroup(a.creditLimitGroup, rows) : null;
                const subgroup = a.customGroup || "未分組";
                const showSubgroup = i === 0 || (g.rows[i - 1].customGroup || "未分組") !== subgroup;

                // Accent color: user color > brand color > chart palette fallback
                const brand = resolveBankBrand(a.name, a.bankBrandDomain);
                const accentColor = a.color || brand?.brandColor || MARK_COLORS[i % MARK_COLORS.length];

                // Credit utilization bar (per-card; group limit used when set)
                const creditLimit = groupCredit?.limit || a.creditLimit;
                const creditUsed = groupCredit ? groupCredit.used : Math.max(0, -a.balance);
                const utilPct = a.type === "credit" && creditLimit ? Math.min(100, (creditUsed / creditLimit) * 100) : null;
                const utilBarColor = utilPct !== null && utilPct >= 80 ? "var(--ns-neg)" : accentColor;

                return (
                  <div key={a.id}>
                  {showSubgroup ? <div className="ns-eyebrow" style={{ padding: "10px 22px 4px", borderTop: i ? "1px solid var(--ns-border)" : "none" }}>{subgroup}</div> : null}
                  <div
                    className="ns-acct-row"
                    style={{
                      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, rowGap: 10,
                      padding: "12px 18px",
                      borderTop: !showSubgroup && i ? "1px solid var(--ns-border)" : "none",
                    }}
                  >
                    <div style={{ position: "relative", width: 36, height: 36, borderRadius: "var(--ns-r-sm)", flexShrink: 0, background: a.color || brand?.brandColor || MARK_COLORS[i % MARK_COLORS.length], color: "var(--ns-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, overflow: "hidden" }}>
                      <Glyph name={a.iconName || DEFAULT_ACCOUNT_ICON[a.type]} size={20} color="var(--ns-bg)" fallbackText={a.name.slice(0, 2)} />
                      <BankLogo accountName={a.name} bankBrandDomain={a.bankBrandDomain} size={36} />
                    </div>
                    <div
                      style={{ minWidth: 0, maxWidth: 280, flexShrink: 1, cursor: "pointer" }}
                      onClick={() => navigate({ to: "/cash-flow", search: { account: a.id } })}
                      title={`查看「${a.name}」的交易紀錄`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="ns-acct-name text-sm" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                        <Badge variant="outline" className="rounded-full">{a.currency}</Badge>
                      </div>
                      <div className="muted text-xs" style={{ marginTop: 2 }}>
                        {accountTypeLabels[a.type]}
                        {a.type === "credit" && a.creditLimit ? ` · 額度 ${formatNumber(a.creditLimit)}` : ""}
                        {groupCredit ? ` · 共用 ${groupCredit.name}` : ""}
                        {a.type === "loan" && a.annualInterestRate !== null ? ` · 年利率 ${a.annualInterestRate}%` : ""}
                        {a.type === "credit" && a.paymentDueDay ? ` · 繳款 ${a.paymentDueDay} 日` : ""}
                      </div>
                      {utilPct !== null ? (
                        <div style={{ marginTop: 5 }}>
                          <div style={{ height: 3, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                            <div style={{ width: `${utilPct}%`, height: "100%", borderRadius: 99, background: utilBarColor, transition: "width 0.3s ease" }} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {/* Amount + actions travel together as the right cluster so
                        they wrap to a second line as a unit on a narrow phone
                        instead of forcing the row (and card) wider than screen. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
                      <div style={{ textAlign: "right" }}>
                        {a.type === "credit" ? (() => {
                          const cb = creditBalanceLabel(a.balance);
                          const toneColor = cb.state === "owed" ? "var(--ns-neg)" : cb.state === "credit" ? "var(--ns-pos)" : "var(--ns-fg-dim)";
                          return (
                            <>
                              <div className="num text-[15px]" style={{ fontWeight: 500, color: toneColor }}>
                                {cb.state === "owed" ? "−" : cb.state === "credit" ? "+" : ""}{formatNumber(Math.abs(toBase(cb.state === "zero" ? 0 : a.balance, a.currency)))}
                              </div>
                              <div className="muted text-caption">{cb.label}</div>
                            </>
                          );
                        })() : (
                          <>
                            <div className="num text-[15px]" style={{ fontWeight: 500, color: a.balance < 0 ? "var(--ns-neg)" : undefined }}>
                              {a.balance < 0 ? "−" : ""}{formatNumber(Math.abs(base))}
                            </div>
                            {a.currency !== primaryCurrency ? <div className="muted mono text-caption">{formatNumber(a.balance)} {a.currency}</div> : null}
                          </>
                        )}
                      </div>
                      <div className="ns-acct-actions" style={{ display: "flex", gap: 4 }}>
                        {a.type === "credit" ? (
                          <Button variant="ghost" size="icon-sm" title="對帳" onClick={() => navigate({ to: "/cash-flow/reconcile/$accountId", params: { accountId: a.id } })}><ListChecks size={14} /></Button>
                        ) : null}
                        {a.type === "investment" ? (
                          <Button variant="ghost" size="icon-sm" title="交易成本設定" onClick={() => navigate({ to: "/settings", search: { tab: "tradingFees" } })}><Percent size={14} /></Button>
                        ) : null}
                        <Button variant="ghost" size="icon-sm" title="編輯" onClick={() => startEdit(a)}><PencilSimple size={14} /></Button>
                        <Button variant="ghost" size="icon-sm" title="調整餘額" onClick={() => openAdjust(a)}><Scales size={14} /></Button>
                        <Button variant="ghost" size="icon-sm" title="刪除" style={{ color: "var(--ns-neg)" }} onClick={async () => { try { await deleteAccount.mutateAsync(a.id); } catch (e) { setMessage(e instanceof Error ? e.message : "刪除失敗。"); } }}><Trash size={14} /></Button>
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })}
            </Card>
          ))}
        </div>
      )}
      {message ? <Card className="text-body" style={{ padding: "10px 16px", marginTop: 16, color: "var(--ns-fg-muted)" }}>{message}</Card> : null}

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
          <Card style={{ width: "100%", maxWidth: 420, padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ns-border)" }}>
              <h2 className="text-base" style={{ margin: 0, fontWeight: 600 }}>調整餘額 · {adjustingAccount.name}</h2>
              <div className="muted text-xs" style={{ marginTop: 2 }}>目前餘額：{formatNumber(adjustingAccount.balance)} {adjustingAccount.currency}</div>
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
              {adjustMessage ? <div className="text-body" style={{ color: "var(--ns-neg)" }}>{adjustMessage}</div> : null}
              <div style={{ display: "flex", gap: 8 }}>
                <Button className="flex-1 justify-center" onClick={submitAdjust} loading={adjustBalance.isPending}>{adjustBalance.isPending ? "調整中…" : "確認調整"}</Button>
                <Button variant="outline" onClick={() => setAdjustingAccountId(null)}>取消</Button>
              </div>
            </div>
          </Card>
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

  const openingBalanceField = useNumericField(form.openingBalance, (v) => setForm({ ...form, openingBalance: v }));

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
              <h2 className="text-lg" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
                {isEditing ? "編輯帳戶" : "新增帳戶"}
              </h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉"><X size={16} /></Button>
          </div>
          {!isEditing && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {stepLabels.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < stepLabels.length - 1 ? 1 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div className="text-micro" style={{
                      width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                      background: i < step ? 'var(--ns-accent)' : i === step ? 'var(--ns-fg)' : 'var(--ns-bg-hover)',
                      color: i < step ? 'var(--ns-accent-fg)' : i === step ? 'var(--ns-bg)' : 'var(--ns-fg-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--ns-font-mono)', fontWeight: 700,
                    }}>
                      {i < step ? <Check size={12} weight="bold" /> : i + 1}
                    </div>
                    <span className="text-caption" style={{
                      whiteSpace: 'nowrap',
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
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>步驟 1 / 4</div>
              <h3 className="text-xl" style={{ fontFamily: 'var(--ns-font-display)', fontWeight: 600, margin: '0 0 6px' }}>選擇帳戶類型</h3>
              <p className="muted text-body" style={{ margin: '0 0 20px', lineHeight: 1.5 }}>帳戶類型決定記帳方式與報表歸類，之後仍可更改。</p>
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
                      <div className="text-body" style={{ fontWeight: 500 }}>{accountTypeLabels[type]}</div>
                      <div className="muted text-caption" style={{ marginTop: 2 }}>{accountTypeDescriptions[type]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              {!isEditing && <div className="ns-eyebrow" style={{ marginBottom: 6 }}>步驟 2 / 4</div>}
              <h3 className="text-xl" style={{ fontFamily: 'var(--ns-font-display)', fontWeight: 600, margin: '0 0 6px' }}>
                {isEditing ? "帳戶基本資料" : "帳戶基本資料"}
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                <DrawerField label="名稱 *">
                  <input className="ns-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：玉山活存、富邦證券" />
                </DrawerField>
                <DrawerField label="幣別">
                  <AppSelect
                    value={selectedCurrency}
                    onChange={(currency) => setForm({ ...form, currency })}
                    options={currencyOptions.map((currency) => ({ value: currency, label: currency }))}
                    searchPlaceholder="搜尋幣別…"
                    style={{ width: "100%", height: 40 }}
                  />
                </DrawerField>
                <DrawerField label="自訂群組（選填）">
                  <input className="ns-input" value={form.customGroup} onChange={(e) => setForm({ ...form, customGroup: e.target.value })} placeholder="例：台灣、海外、家庭" />
                </DrawerField>

                <DrawerField label="Logo、圖示與顏色（選填）">
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <AppSelect
                      value={form.bankBrandDomain ?? "auto"}
                      onChange={(value) => setForm({ ...form, bankBrandDomain: value === "auto" ? null : value })}
                      options={[
                        { value: "auto", label: "自動判讀", description: "依帳戶名稱關鍵字判斷；不需要完全一模一樣" },
                        ...BANK_BRANDS.map((brand) => ({
                          value: brand.domain,
                          label: brand.label,
                          description: brand.domain,
                        })),
                      ]}
                      searchPlaceholder="搜尋銀行、券商或網域…"
                      style={{ width: "100%", height: 40 }}
                    />
                    <div className="muted text-xs">
                      Logo 顯示需在設定開啟「銀行／券商 Logo」。手選品牌會優先於名稱自動判讀；圖示是 logo 無法載入時的備援。
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Popover>
                      <PopoverTrigger className="text-xl" style={{ width: 40, height: 40, borderRadius: "var(--ns-r-sm)", color: form.color ? "var(--ns-bg)" : undefined, background: form.color || "var(--ns-bg-hover)", border: "1px solid var(--ns-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Glyph name={form.iconName || DEFAULT_ACCOUNT_ICON[form.type]} size={20} color={form.color ? "var(--ns-bg)" : undefined} fallbackText="＋" />
                      </PopoverTrigger>
                      <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
                        <IconPicker value={form.iconName} onSelect={(name) => setForm({ ...form, iconName: name })} />
                      </PopoverContent>
                    </Popover>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ACCOUNT_COLORS.map((c) => (
                        <div key={c} onClick={() => setForm({ ...form, color: c })} style={{ width: 22, height: 22, borderRadius: 99, background: c, cursor: "pointer", outline: form.color === c ? "2px solid var(--ns-fg)" : "none", outlineOffset: 2 }} />
                      ))}
                    </div>
                    {(form.iconName || form.color) ? (
                      <Button type="button" variant="ghost" size="xs" onClick={() => setForm({ ...form, iconName: null, color: null })}>清除</Button>
                    ) : null}
                    </div>
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
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>步驟 3 / 4</div>
              <h3 className="text-xl" style={{ fontFamily: 'var(--ns-font-display)', fontWeight: 600, margin: '0 0 6px' }}>初始餘額與匯入</h3>
              <p className="muted text-body" style={{ margin: '0 0 18px', lineHeight: 1.5 }}>
                設定今天的帳戶餘額。也可以直接匯入 CSV 交易紀錄。
              </p>

              <div style={{ marginBottom: 20 }}>
                <DrawerField label={`${form.type === "alternative" ? "目前市值" : "期初餘額"}（${form.currency}）`}>
                  <input
                    className="ns-input text-stat"
                    style={{ fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', height: 56 }}
                    placeholder="0"
                    {...openingBalanceField}
                  />
                </DrawerField>
                {form.type === "alternative" && (
                  <div className="muted text-xs" style={{ marginTop: 6 }}>輸入此資產目前的估計市值，日後可用「調整餘額」手動更新。</div>
                )}
                {form.type === 'credit' && (
                  <div className="muted text-xs" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    信用卡尚未繳清的金額請以負數輸入（例：輸入 −302 表示尚欠 302）；已結清請填 0。
                  </div>
                )}
                {form.type !== "alternative" && form.type !== "credit" && (
                  <div className="muted text-xs" style={{ marginTop: 6 }}>
                    這是帳戶的起始餘額；目前餘額 = 期初餘額 + 已結算交易。若要直接修正目前餘額，請用帳戶列的「調整餘額」。
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs" style={{ display: 'block', color: 'var(--ns-fg-muted)', marginBottom: 8 }}>交易紀錄匯入 <span className="dim">（選填）</span></label>
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
                        <div className="text-body" style={{ fontWeight: 500 }}>{m.label}</div>
                        {m.sub && <div className="muted text-xs" style={{ marginTop: 2 }}>{m.sub}</div>}
                      </div>
                      {importMethod === m.id && <Check size={15} weight="bold" style={{ color: 'var(--ns-accent)' }} />}
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
              <h2 className="text-[24px]" style={{ fontFamily: 'var(--ns-font-display)', fontWeight: 600, margin: '0 0 8px' }}>帳戶已建立</h2>
              <p className="muted text-body" style={{ margin: '0 0 28px', lineHeight: 1.6, maxWidth: 340 }}>
                <strong style={{ color: 'var(--ns-fg)' }}>{form.name || '新帳戶'}</strong> 已加入 Northstar。<br />所有資料只存在這台電腦。
              </p>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 8 }}>
          {step < 3 ? (
            <>
              <Button variant="outline" className="shrink-0 grow-0 basis-[90px] justify-center" onClick={handleBack}>
                {step === 0 || (step === 1 && isEditing) ? "取消" : "← 上一步"}
              </Button>
              <Button className="flex-1 justify-center" style={{ opacity: canAdvance ? 1 : 0.45 }} onClick={() => canAdvance && handleNext()} disabled={pending} loading={pending}>
                {pending ? "處理中…" : step === 2 || isEditing ? "儲存" : "下一步 →"}
              </Button>
            </>
          ) : (
            <>
              <Button className="flex-1 justify-center" onClick={onClose}>完成</Button>
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
