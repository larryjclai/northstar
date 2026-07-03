import { CaretRight, CaretDown, CheckCircle, Circle, CurrencyCircleDollar, PencilSimple, CalendarPlus } from "@phosphor-icons/react";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { buildStatementPeriods, formatNumber, todayInTimezone } from "../domain";
import type { Account, LedgerTransaction } from "../domain";
import { useToast } from "../components/Toast";
import { useUiPreferences } from "../state/uiPreferences";
import type { AccountDraft, TransferDraft, LedgerDraft } from "../data/repositories";

export function ReconcileRoute() {
  const { accountId } = useParams({ from: "/cash-flow/reconcile/$accountId" });
  const navigate = useNavigate();
  const toast = useToast();
  const timezone = useUiPreferences((s) => s.timezone);
  const { accounts, ledger, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  // Per-period open/closed override. Absent → falls back to the default (the
  // current period starts open, past periods start collapsed).
  const [expandOverride, setExpandOverride] = useState<Record<string, boolean>>({});

  const setReviewed = useRepositoryMutation(
    (repository, input: { id: string; reviewed: boolean }) => repository.setLedgerReviewed(input.id, input.reviewed),
    ["ledger"],
  );
  const setPostDate = useRepositoryMutation(
    (repository, input: { id: string; postDate: string | null }) => repository.setLedgerPostDate(input.id, input.postDate),
    ["ledger"],
  );
  const [deferRow, setDeferRow] = useState<LedgerTransaction | null>(null);
  const updateAccount = useRepositoryMutation(
    (repository, input: { id: string } & AccountDraft) => repository.updateAccount(input.id, input),
    ["accounts"],
  );
  const createTransfer = useRepositoryMutation(
    (repository, input: TransferDraft) => repository.createTransfer(input),
    ["accounts", "ledger"],
  );
  const createLedger = useRepositoryMutation(
    (repository, input: LedgerDraft) => repository.createLedgerTransaction(input),
    ["accounts", "ledger"],
  );
  const [payOpen, setPayOpen] = useState(false);

  const account = (accounts.data ?? []).find((a) => a.id === accountId);
  const rows = useMemo(
    () => (ledger.data ?? [])
      .filter((row) => row.accountId === accountId && row.deletedAt === null && row.entryType !== "transfer")
      .sort((a, b) => b.date.localeCompare(a.date)),
    [ledger.data, accountId],
  );

  const today = todayInTimezone(timezone);
  const periods = useMemo(
    () => account
      ? buildStatementPeriods(rows, {
          statementDay: account.statementDay,
          paymentDueDay: account.paymentDueDay,
          creditPaymentPaidUntil: account.creditPaymentPaidUntil,
          today,
        })
      : [],
    [rows, account, today],
  );

  const currentPeriod = periods.find((p) => p.isCurrent) ?? periods[0];
  const defaultOpen = (key: string) => key === currentPeriod?.key;
  const isOpen = (key: string) => (key in expandOverride ? expandOverride[key] : defaultOpen(key));

  function toggleExpand(key: string) {
    // Flip relative to the current open state so every period — including the
    // current one (which defaults open) — can be collapsed and re-expanded (B7).
    setExpandOverride((current) => ({ ...current, [key]: !isOpen(key) }));
  }

  async function toggle(id: string, current: boolean) {
    try {
      await setReviewed.mutateAsync({ id, reviewed: !current });
    } catch {
      toast.error("更新失敗");
    }
  }

  async function applyDefer(id: string, postDate: string | null) {
    try {
      await setPostDate.mutateAsync({ id, postDate });
      toast.success(postDate ? `已設定延後入帳 ${postDate}` : "已改回當下入帳");
      setDeferRow(null);
    } catch {
      toast.error("更新失敗");
    }
  }

  async function markAll(periodKey: string, reviewed: boolean) {
    const period = periods.find((p) => p.key === periodKey);
    if (!period) return;
    const targets = period.rows.filter((r) => r.isReviewed !== reviewed);
    try {
      for (const row of targets) await setReviewed.mutateAsync({ id: row.id, reviewed });
      toast.success(reviewed ? "已標記本期已對帳" : "已清除對帳狀態");
    } catch {
      toast.error("更新失敗");
    }
  }

  async function markPaid() {
    if (!account?.paymentDueDay) return;
    // Mark the most recently closed unpaid statement's due date as paid so the
    // reminder for that cycle is suppressed.
    const dueDate = currentPeriod?.dueDate
      ?? periods.find((p) => p.dueDate && !p.isPaid)?.dueDate;
    if (!dueDate) return;
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        name: account.name, currency: account.currency, openingBalance: account.openingBalance,
        type: account.type, creditLimit: account.creditLimit, creditLimitGroup: account.creditLimitGroup,
        statementDay: account.statementDay, paymentDueDay: account.paymentDueDay,
        creditPaymentPaidUntil: dueDate,
        isSharedToHousehold: account.isSharedToHousehold,
        loanStartDate: account.loanStartDate, annualInterestRate: account.annualInterestRate, loanTerm: account.loanTerm,
        iconName: account.iconName, color: account.color,
      });
      toast.success(`已標記繳款，提醒將在 ${dueDate} 後再次顯示`);
    } catch {
      toast.error("更新失敗");
    }
  }

  async function handlePay(payAccountId: string, payAmount: number, creditAmount: number) {
    if (!account || account.type !== "credit") return;
    const day = todayInTimezone(timezone);
    try {
      if (payAmount > 0) {
        await createTransfer.mutateAsync({
          date: day,
          sourceAccountId: payAccountId,
          destinationAccountId: account.id,
          sourceCurrency: account.currency,
          destinationCurrency: account.currency,
          sourceAmount: payAmount,
          note: "信用卡繳款",
        });
      }
      if (creditAmount > 0) {
        await createLedger.mutateAsync({
          accountId: account.id,
          counterAccountId: null,
          date: day,
          name: "帳單折抵 / 回饋",
          amount: creditAmount, // positive income → reduces card debt
          currency: account.currency,
          originalAmount: null,
          originalCurrency: null,
          category: "現金回饋",
          subcategory: "",
          merchant: "",
          entryType: "income",
          settlementStatus: "settled",
          note: "信用卡帳單折抵",
        });
      }
      await markPaid();
      setPayOpen(false);
      toast.success("已記錄繳款");
    } catch {
      toast.error("繳款失敗");
    }
  }

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-[280px]" />
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

  if (!account) {
    return <div style={{ padding: "24px 32px" }} className="muted">找不到帳戶。</div>;
  }

  const owed = Math.max(0, -account.balance);
  const isPaid = account.creditPaymentPaidUntil != null;
  // Non-credit, non-loan accounts in the same currency can pay this card (v1: no FX).
  const payingAccounts = (accounts.data ?? []).filter(
    (a) => a.deletedAt === null && a.type !== "credit" && a.type !== "loan" && a.currency === account.currency,
  );
  const currentSpend = currentPeriod?.spend ?? 0;
  // 淨額 = 毛消費 − 退款 = −total（total 為帶號加總）。退款讓「請款金額」低於刷卡金額。
  const currentNet = -(currentPeriod?.total ?? 0);
  const currentRefunds = currentSpend - currentNet;
  const currentReconciled = currentPeriod?.reconciledCount ?? 0;
  const currentCount = currentPeriod?.rows.length ?? 0;
  const currentUnreconciled = (currentPeriod?.rows ?? []).filter((r) => !r.isReviewed).reduce((s, r) => s + Math.abs(r.amount), 0);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 32px 100px" }}>
      {/* Breadcrumb */}
      <div className="text-body" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, color: "var(--ns-fg-muted)" }}>
        <span style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/accounts" })}>帳戶</span>
        <CaretRight size={13} />
        <span style={{ fontWeight: 500, color: "var(--ns-fg)" }}>{account.name} · 對帳</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="text-xs ns-field-label">Reconciliation · {account.currency}</div>
          <h1 className="text-[26px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, fontWeight: 600 }}>{account.name} 對帳</h1>
          <p className="muted text-body" style={{ marginTop: 4, marginBottom: 0 }}>
            依結帳日將交易分期核對。
            {account.statementDay ? ` 結帳日每月 ${account.statementDay} 號。` : ""}
            {account.paymentDueDay ? ` 繳款日每月 ${account.paymentDueDay} 號。` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {account.type === "credit" && account.paymentDueDay && (
            <Button
              variant={isPaid ? "default" : "outline"}
              onClick={() => setPayOpen(true)}
              loading={updateAccount.isPending}
              title={isPaid ? `已繳款至 ${account.creditPaymentPaidUntil}` : "從帳戶轉帳繳款，可選填帳單折抵 / 回饋"}
            >
              <CurrencyCircleDollar size={14} weight={isPaid ? "fill" : "regular"} />
              {isPaid ? "已繳款" : "繳款 / 標記已繳"}
            </Button>
          )}
        </div>
      </div>

      {/* Summary — current open cycle. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}>
          <div className="text-xs" style={{  marginBottom: 8 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>本期消費</div>
          <div className="num text-[19px]" style={{ color: currentSpend > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(currentSpend)}</div>
          {currentRefunds > 0.5 ? (
            <div className="muted text-caption" style={{ marginTop: 4 }}>
              退款 −NT${formatNumber(currentRefunds)} · 淨額 NT${formatNumber(currentNet)}
            </div>
          ) : null}
        </Card>
        <Card style={{ padding: 16 }}>
          <div className="text-xs" style={{  marginBottom: 8 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>本期已對帳 / 筆數</div>
          <div className="num text-[19px]">{currentReconciled} / {currentCount}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div className="text-xs" style={{  marginBottom: 8 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>卡片未繳總額</div>
          <div className="num text-[19px]" style={{ color: owed > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(owed)}</div>
        </Card>
      </div>
      {currentUnreconciled > 0 ? (
        <div className="muted text-xs" style={{ marginBottom: 12 }}>本期尚有 NT${formatNumber(currentUnreconciled)} 未對帳。</div>
      ) : null}

      {/* Statement periods */}
      {periods.length === 0 ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}><div className="muted text-body" style={{ padding: 40, textAlign: "center" }}>此帳戶尚無交易紀錄。</div></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {periods.map((period) => {
            const open = isOpen(period.key);
            const unreconciled = period.rows.filter((r) => !r.isReviewed).length;
            return (
              <Card key={period.key} style={{ padding: 0 }}>
                <div
                  onClick={() => toggleExpand(period.key)}
                  style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: open ? "1px solid var(--ns-border)" : "none" }}
                >
                  {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                      {period.isCurrent ? <Badge variant="outline" className="rounded-full text-micro" style={{ padding: "2px 7px" }}>本期</Badge> : null}
                      {period.label}
                      {period.isPaid ? <Badge variant="outline" className="rounded-full text-micro" style={{ padding: "2px 7px", color: "var(--ns-pos)", borderColor: "var(--ns-pos)" }}>已繳款</Badge> : null}
                    </div>
                    <div className="muted text-caption" style={{ marginTop: 2 }}>
                      {period.rows.length} 筆 · 已對帳 {period.reconciledCount}/{period.rows.length}
                      {period.dueDate ? ` · 繳款日 ${period.dueDate.slice(5)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="num text-[15px]" style={{ fontWeight: 500, color: period.spend > 0 ? "var(--ns-neg)" : "var(--ns-fg-dim)" }}>
                      NT${formatNumber(period.spend)}
                    </div>
                    {period.spend + period.total > 0.5 ? (
                      <div className="muted text-micro" style={{ marginTop: 1 }}>淨額 NT${formatNumber(-period.total)}</div>
                    ) : null}
                  </div>
                  {open && unreconciled > 0 ? (
                    <Button variant="ghost"
                      className="text-xs"
                      style={{ padding: "4px 10px", minHeight: "auto" }}
                      onClick={(e) => { e.stopPropagation(); markAll(period.key, true); }}
                      disabled={setReviewed.isPending}
                    >
                      全部對帳
                    </Button>
                  ) : null}
                </div>
                {open ? (
                  period.rows.length === 0 ? (
                    <div className="muted text-body" style={{ padding: "16px 18px" }}>本期尚無交易。</div>
                  ) : (
                    period.rows.map((row, i) => (
                      <div
                        key={row.id}
                        onClick={() => toggle(row.id, row.isReviewed)}
                        style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", cursor: "pointer", opacity: row.isReviewed ? 0.6 : 1 }}
                      >
                        {row.isReviewed ? <CheckCircle size={20} weight="fill" style={{ color: "var(--ns-accent)", flexShrink: 0 }} /> : <Circle size={20} style={{ color: "var(--ns-fg-dim)", flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-sm" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.merchant || row.name || row.category || "交易"}</div>
                          <div className="muted text-caption">
                            {row.date.slice(0, 10)}{row.category ? ` · ${row.category}` : ""}
                            {row.postDate ? <Badge variant="outline" className="rounded-full text-micro" style={{ marginLeft: 6, padding: "1px 6px", color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>延後 {row.postDate.slice(5, 10)}</Badge> : null}
                          </div>
                        </div>
                        <div className="num text-sm" style={{ color: row.amount < 0 ? "var(--ns-neg)" : "var(--ns-pos)", whiteSpace: "nowrap" }}>
                          {row.amount < 0 ? "−" : "+"}NT${formatNumber(Math.abs(row.amount))}
                        </div>
                        {row.amount < 0 ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="延後入帳"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeferRow(row);
                            }}
                          >
                            <CalendarPlus size={14} weight={row.postDate ? "fill" : "regular"} />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="編輯交易"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ to: "/cash-flow", search: { account: accountId, tx: row.id } });
                          }}
                        >
                          <PencilSimple size={14} />
                        </Button>
                      </div>
                    ))
                  )
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {deferRow ? (
        <DeferPostingModal
          row={deferRow}
          pending={setPostDate.isPending}
          onCancel={() => setDeferRow(null)}
          onConfirm={(postDate) => applyDefer(deferRow.id, postDate)}
        />
      ) : null}

      {payOpen && account.type === "credit" ? (
        <PayCardModal
          owed={owed}
          currency={account.currency}
          payingAccounts={payingAccounts}
          pending={createTransfer.isPending || createLedger.isPending || updateAccount.isPending}
          onCancel={() => setPayOpen(false)}
          onConfirm={handlePay}
        />
      ) : null}
    </div>
  );
}

function PayCardModal({
  owed,
  currency,
  payingAccounts,
  pending,
  onCancel,
  onConfirm,
}: {
  owed: number;
  currency: string;
  payingAccounts: Account[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (payAccountId: string, payAmount: number, creditAmount: number) => void;
}) {
  const [payAccountId, setPayAccountId] = useState(payingAccounts[0]?.id ?? "");
  const [payAmount, setPayAmount] = useState(String(owed));
  const [creditAmount, setCreditAmount] = useState("0");
  const noAccounts = payingAccounts.length === 0;
  const pay = Math.max(0, Number(payAmount) || 0);
  const credit = Math.max(0, Number(creditAmount) || 0);
  // A real transfer needs a paying account; a 0-pay / 0-credit confirm just suppresses the reminder.
  const canConfirm = !pending && (pay === 0 || (!noAccounts && payAccountId !== ""));
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)", padding: 20 }}
      >
        <div className="text-[15px]" style={{ fontWeight: 600, marginBottom: 4 }}>信用卡繳款</div>
        <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          未繳總額 NT${formatNumber(owed)} · 從帳戶轉帳繳款，可選填帳單折抵 / 回饋。
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="text-xs" style={{ fontWeight: 500, marginBottom: 6 }}>付款帳戶</div>
          {noAccounts ? (
            <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>沒有可扣款的同幣別帳戶（{currency}）。</div>
          ) : (
            <select
              value={payAccountId}
              onChange={(e) => setPayAccountId(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
            >
              {payingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="text-xs" style={{ fontWeight: 500, marginBottom: 6 }}>繳款金額</div>
          <input
            type="number"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            min={0}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
          />
        </div>

        <div style={{ marginBottom: 4 }}>
          <div className="text-xs" style={{ fontWeight: 500, marginBottom: 6 }}>帳單折抵 / 回饋（選填）</div>
          <input
            type="number"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            min={0}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
          <Button onClick={() => onConfirm(payAccountId, pay, credit)} disabled={!canConfirm}>
            <CurrencyCircleDollar size={14} weight="fill" />確認繳款
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeferPostingModal({
  row,
  pending,
  onCancel,
  onConfirm,
}: {
  row: LedgerTransaction;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (postDate: string | null) => void;
}) {
  const [date, setDate] = useState(row.postDate?.slice(0, 10) ?? row.date.slice(0, 10));
  const hasDefer = row.postDate != null;
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)", padding: 20 }}
      >
        <div className="text-[15px]" style={{ fontWeight: 600, marginBottom: 4 }}>延後入帳</div>
        <div className="text-xs" style={{ color: "var(--ns-fg-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          選擇入帳日；這筆消費會歸到該日所屬的帳單週期。仍會立即計為負債，餘額不變。
        </div>

        <div style={{ marginBottom: 4 }}>
          <div className="text-xs" style={{ fontWeight: 500, marginBottom: 6 }}>入帳日</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)", fontFamily: "var(--ns-font-mono)" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
          {hasDefer ? (
            <Button variant="outline" onClick={() => onConfirm(null)} disabled={pending}>改回當下入帳</Button>
          ) : null}
          <Button onClick={() => onConfirm(date)} disabled={pending || !date}>
            <CalendarPlus size={14} weight="fill" />確認延後
          </Button>
        </div>
      </div>
    </div>
  );
}
