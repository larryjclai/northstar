import { CaretRight, CheckCircle, Circle, CurrencyCircleDollar, PencilSimple, CalendarPlus } from "@phosphor-icons/react";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { ModalShell } from "../components/ModalShell";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { buildStatementPeriods, formatNumber, todayInTimezone } from "../domain";
import type { Account, LedgerTransaction, StatementPeriod } from "../domain";
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
  const payablePeriods = useMemo(
    () => periods
      .filter((p) => !p.isCurrent && !p.isPaid && p.dueDate)
      .sort((a, b) => a.end.localeCompare(b.end)),
    [periods],
  );
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

  async function markPaid(dueDate: string) {
    if (!account?.paymentDueDay || !dueDate) return;
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

  async function handlePay(payAccountId: string, payAmount: number, creditAmount: number, dueDate: string) {
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
      await markPaid(dueDate);
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
          <h3 className="text-[17px] font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>
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
  const hasUnpaidClosed = payablePeriods.length > 0;
  const isPaid = account.creditPaymentPaidUntil != null && !hasUnpaidClosed;
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
      <div className="text-body flex items-center gap-2" style={{ marginBottom: 18, color: "var(--ns-fg-muted)" }}>
        <span style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/accounts" })}>帳戶</span>
        <CaretRight size={13} />
        <span className="font-medium" style={{ color: "var(--ns-fg)" }}>{account.name} · 對帳</span>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4 mb-5">
        <div>
          <div className="text-xs ns-field-label">Reconciliation · {account.currency}</div>
          <h1 className="text-[26px] m-0 font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>{account.name} 對帳</h1>
          <p className="muted text-body mt-1 mb-0">
            依結帳日將交易分期核對。
            {account.statementDay ? ` 結帳日每月 ${account.statementDay} 號。` : ""}
            {account.paymentDueDay ? ` 繳款日每月 ${account.paymentDueDay} 號。` : ""}
          </p>
        </div>
        <div className="flex gap-2">
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
        <Card className="p-4">
          <div className="text-xs mb-2 font-medium" style={{ color: "var(--ns-fg-muted)" }}>本期消費</div>
          <div className="num text-[19px]" style={{ color: currentSpend > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(currentSpend)}</div>
          {currentRefunds > 0.5 ? (
            <div className="muted text-caption mt-1">
              退款 −NT${formatNumber(currentRefunds)} · 淨額 NT${formatNumber(currentNet)}
            </div>
          ) : null}
        </Card>
        <Card className="p-4">
          <div className="text-xs mb-2 font-medium" style={{ color: "var(--ns-fg-muted)" }}>本期已對帳 / 筆數</div>
          <div className="num text-[19px]">{currentReconciled} / {currentCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs mb-2 font-medium" style={{ color: "var(--ns-fg-muted)" }}>卡片未繳總額</div>
          <div className="num text-[19px]" style={{ color: owed > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(owed)}</div>
        </Card>
      </div>
      {currentUnreconciled > 0 ? (
        <div className="muted text-xs mb-3">本期尚有 NT${formatNumber(currentUnreconciled)} 未對帳。</div>
      ) : null}

      {/* Statement periods */}
      {periods.length === 0 ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}><div className="muted text-body text-center" style={{ padding: 40 }}>此帳戶尚無交易紀錄。</div></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {periods.map((period) => {
            const open = isOpen(period.key);
            const unreconciled = period.rows.filter((r) => !r.isReviewed).length;
            return (
              <Card key={period.key} className="p-0">
                <div
                  onClick={() => toggleExpand(period.key)}
                  className="flex items-center gap-3"
                  style={{ padding: "14px 18px", cursor: "pointer", borderBottom: open ? "1px solid var(--ns-border)" : "none" }}
                >
                  <CaretRight size={14} className="ns-caret-rotate" style={{ transform: open ? "rotate(90deg)" : "none" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm flex items-center gap-2 font-medium">
                      {period.isCurrent ? <Badge variant="outline" className="rounded-full text-micro" style={{ padding: "2px 7px" }}>本期</Badge> : null}
                      {period.label}
                      {period.isPaid ? <Badge variant="outline" className="rounded-full text-micro" style={{ padding: "2px 7px", color: "var(--ns-pos)", borderColor: "var(--ns-pos)" }}>已繳款</Badge> : null}
                    </div>
                    <div className="muted text-caption" style={{ marginTop: 2 }}>
                      {period.rows.length} 筆 · 已對帳 {period.reconciledCount}/{period.rows.length}
                      {period.dueDate ? ` · 繳款日 ${period.dueDate.slice(5)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[15px] font-medium" style={{ color: period.spend > 0 ? "var(--ns-neg)" : "var(--ns-fg-dim)" }}>
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
                    <div className="muted text-body ns-expand-in" style={{ padding: "16px 18px" }}>本期尚無交易。</div>
                  ) : (
                    period.rows.map((row, i) => (
                      <div
                        key={row.id}
                        onClick={() => toggle(row.id, row.isReviewed)}
                        className="flex items-center gap-3.5 px-5 py-3 ns-expand-in"
                        style={{ borderTop: i ? "1px solid var(--ns-border)" : "none", cursor: "pointer", opacity: row.isReviewed ? 0.6 : 1 }}
                      >
                        {row.isReviewed ? <CheckCircle size={20} weight="fill" className="shrink-0" style={{ color: "var(--ns-accent)" }} /> : <Circle size={20} className="shrink-0" style={{ color: "var(--ns-fg-dim)" }} />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{row.merchant || row.name || row.category || "交易"}</div>
                          <div className="muted text-caption">
                            {row.date.slice(0, 10)}{row.category ? ` · ${row.category}` : ""}
                            {row.postDate ? <Badge variant="outline" className="rounded-full text-micro ml-1.5" style={{ padding: "1px 6px", color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>延後 {row.postDate.slice(5, 10)}</Badge> : null}
                          </div>
                        </div>
                        <div className="num text-sm" style={{ color: row.amount < 0 ? "var(--ns-neg)" : "var(--ns-pos)", whiteSpace: "nowrap" }}>
                          {row.amount < 0 ? "−" : "+"}NT${formatNumber(Math.abs(row.amount))}
                        </div>
                        {row.amount < 0 ? (
                          <Button
                            variant="ghost"
                            size="icon-sm" aria-label="延後入帳"
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
                          size="icon-sm" aria-label="編輯交易"
                          title="編輯交易"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ to: "/cash-flow", search: { account: accountId, tx: row.id, from: "reconcile" } });
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
          payablePeriods={payablePeriods}
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
  payablePeriods,
  pending,
  onCancel,
  onConfirm,
}: {
  owed: number;
  currency: string;
  payingAccounts: Account[];
  payablePeriods: StatementPeriod<LedgerTransaction>[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (payAccountId: string, payAmount: number, creditAmount: number, dueDate: string) => void;
}) {
  const [payAccountId, setPayAccountId] = useState(payingAccounts[0]?.id ?? "");
  const [periodKey, setPeriodKey] = useState(payablePeriods[0]?.key ?? "");
  const selected = payablePeriods.find((p) => p.key === periodKey) ?? payablePeriods[0];
  const [payAmount, setPayAmount] = useState(String(selected ? Math.max(0, -selected.total) : owed));
  const [creditAmount, setCreditAmount] = useState("0");
  const noAccounts = payingAccounts.length === 0;
  const pay = Math.max(0, Number(payAmount) || 0);
  const credit = Math.max(0, Number(creditAmount) || 0);
  // A real transfer needs a paying account; a 0-pay / 0-credit confirm just suppresses the reminder.
  const canConfirm = !pending && selected != null && selected.dueDate != null && (pay === 0 || (!noAccounts && payAccountId !== ""));
  return (
    <ModalShell
      variant="center"
      title="信用卡繳款"
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="p-5"
      panelStyle={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)" }}
    >
      {(dismiss) => (<>
        <div className="text-[15px] font-semibold mb-1">信用卡繳款</div>
        <div className="text-xs mb-4" style={{ color: "var(--ns-fg-muted)", lineHeight: 1.6 }}>
          未繳總額 NT${formatNumber(owed)} · 從帳戶轉帳繳款，可選填帳單折抵 / 回饋。
        </div>

        <div className="mb-3.5">
          <div className="text-xs font-medium mb-1.5">繳款期別</div>
          {payablePeriods.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>目前沒有已結帳、待繳的帳單。</div>
          ) : (
            <select
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              className="w-full px-2.5 py-2"
              style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
            >
              {payablePeriods.map((p) => (
                <option key={p.key} value={p.key}>{p.label}（繳款日 {p.dueDate?.slice(5)}）</option>
              ))}
            </select>
          )}
        </div>

        <div className="mb-3.5">
          <div className="text-xs font-medium mb-1.5">付款帳戶</div>
          {noAccounts ? (
            <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>沒有可扣款的同幣別帳戶（{currency}）。</div>
          ) : (
            <select
              value={payAccountId}
              onChange={(e) => setPayAccountId(e.target.value)}
              className="w-full px-2.5 py-2"
              style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
            >
              {payingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="mb-3.5">
          <div className="text-xs font-medium mb-1.5">繳款金額</div>
          <input
            type="number"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            min={0}
            className="w-full px-2.5 py-2"
            style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
          />
        </div>

        <div className="mb-1">
          <div className="text-xs font-medium mb-1.5">帳單折抵 / 回饋（選填）</div>
          <input
            type="number"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            min={0}
            className="w-full px-2.5 py-2"
            style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
          />
        </div>

        <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
          <Button variant="outline" onClick={dismiss} disabled={pending}>取消</Button>
          <Button onClick={() => onConfirm(payAccountId, pay, credit, selected!.dueDate!)} disabled={!canConfirm}>
            <CurrencyCircleDollar size={14} weight="fill" />確認繳款
          </Button>
        </div>
      </>)}
    </ModalShell>
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
    <ModalShell
      variant="center"
      title="延後入帳"
      onClose={onCancel}
      style={{ zIndex: 1000 }}
      panelClassName="p-5"
      panelStyle={{ width: "min(420px, 96vw)", background: "var(--ns-bg-elev)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-lg)", boxShadow: "var(--ns-shadow-xl)" }}
    >
      {(dismiss) => (<>
        <div className="text-[15px] font-semibold mb-1">延後入帳</div>
        <div className="text-xs mb-4" style={{ color: "var(--ns-fg-muted)", lineHeight: 1.6 }}>
          選擇入帳日；這筆消費會歸到該日所屬的帳單週期。仍會立即計為負債，餘額不變。
        </div>

        <div className="mb-1">
          <div className="text-xs font-medium mb-1.5">入帳日</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2.5 py-2"
            style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)", fontFamily: "var(--ns-font-mono)" }}
          />
        </div>

        <div className="flex justify-end gap-2 flex-wrap" style={{ marginTop: 18 }}>
          <Button variant="outline" onClick={dismiss} disabled={pending}>取消</Button>
          {hasDefer ? (
            <Button variant="outline" onClick={() => onConfirm(null)} disabled={pending}>改回當下入帳</Button>
          ) : null}
          <Button onClick={() => onConfirm(date)} disabled={pending || !date}>
            <CalendarPlus size={14} weight="fill" />確認延後
          </Button>
        </div>
      </>)}
    </ModalShell>
  );
}
