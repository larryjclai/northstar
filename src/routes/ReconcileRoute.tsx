import { CaretRight, CaretDown, CheckCircle, Circle, CurrencyCircleDollar } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { buildStatementPeriods, formatNumber, todayInTimezone } from "../domain";
import { useToast } from "../components/Toast";
import { useUiPreferences } from "../state/uiPreferences";
import type { AccountDraft } from "../data/repositories";

export function ReconcileRoute() {
  const { accountId } = useParams({ from: "/cash-flow/reconcile/$accountId" });
  const navigate = useNavigate();
  const toast = useToast();
  const timezone = useUiPreferences((s) => s.timezone);
  const { accounts, ledger } = useFinanceData();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const setReviewed = useRepositoryMutation(
    (repository, input: { id: string; reviewed: boolean }) => repository.setLedgerReviewed(input.id, input.reviewed),
    ["ledger"],
  );
  const updateAccount = useRepositoryMutation(
    (repository, input: { id: string } & AccountDraft) => repository.updateAccount(input.id, input),
    ["accounts"],
  );

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
  const isOpen = (key: string) => expanded.has(key) || key === currentPeriod?.key;

  function toggleExpand(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      // The current period defaults to open; toggling it needs an explicit
      // "collapsed" marker, so we just allow opening past periods here.
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function toggle(id: string, current: boolean) {
    try {
      await setReviewed.mutateAsync({ id, reviewed: !current });
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

  if (!account) {
    return <div style={{ padding: "24px 32px" }} className="muted">找不到帳戶。</div>;
  }

  const owed = Math.max(0, -account.balance);
  const isPaid = account.creditPaymentPaidUntil != null;
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 13, color: "var(--ns-fg-muted)" }}>
        <span style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/accounts" })}>帳戶</span>
        <CaretRight size={13} />
        <span style={{ fontWeight: 500, color: "var(--ns-fg)" }}>{account.name} · 對帳</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Reconciliation · {account.currency}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 26, margin: 0, fontWeight: 600 }}>{account.name} 對帳</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            依結帳日將交易分期核對。
            {account.statementDay ? ` 結帳日每月 ${account.statementDay} 號。` : ""}
            {account.paymentDueDay ? ` 繳款日每月 ${account.paymentDueDay} 號。` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {account.type === "credit" && account.paymentDueDay && (
            <button
              className={`ns-btn${isPaid ? " primary" : ""}`}
              onClick={markPaid}
              disabled={updateAccount.isPending}
              title={isPaid ? `已繳款至 ${account.creditPaymentPaidUntil}` : "標記本期帳單已繳款，提醒面板暫時隱藏"}
            >
              <CurrencyCircleDollar size={14} weight={isPaid ? "fill" : "regular"} />
              {isPaid ? "已繳款" : "標記已繳款"}
            </button>
          )}
        </div>
      </div>

      {/* Summary — current open cycle. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <div className="ns-card" style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>本期消費</div>
          <div className="num" style={{ fontSize: 19, color: currentSpend > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(currentSpend)}</div>
          {currentRefunds > 0.5 ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              退款 −NT${formatNumber(currentRefunds)} · 淨額 NT${formatNumber(currentNet)}
            </div>
          ) : null}
        </div>
        <div className="ns-card" style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>本期已對帳 / 筆數</div>
          <div className="num" style={{ fontSize: 19 }}>{currentReconciled} / {currentCount}</div>
        </div>
        <div className="ns-card" style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>卡片未繳總額</div>
          <div className="num" style={{ fontSize: 19, color: owed > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(owed)}</div>
        </div>
      </div>
      {currentUnreconciled > 0 ? (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>本期尚有 NT${formatNumber(currentUnreconciled)} 未對帳。</div>
      ) : null}

      {/* Statement periods */}
      {periods.length === 0 ? (
        <div className="ns-card"><div className="muted" style={{ padding: 40, textAlign: "center", fontSize: 13 }}>此帳戶尚無交易紀錄。</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {periods.map((period) => {
            const open = isOpen(period.key);
            const unreconciled = period.rows.filter((r) => !r.isReviewed).length;
            return (
              <div key={period.key} className="ns-card" style={{ padding: 0 }}>
                <div
                  onClick={() => toggleExpand(period.key)}
                  style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: open ? "1px solid var(--ns-border)" : "none" }}
                >
                  {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 500 }}>
                      {period.isCurrent ? <span className="ns-pill" style={{ fontSize: 10.5, padding: "2px 7px" }}>本期</span> : null}
                      {period.label}
                      {period.isPaid ? <span className="ns-pill" style={{ fontSize: 10.5, padding: "2px 7px", color: "var(--ns-pos)", borderColor: "var(--ns-pos)" }}>已繳款</span> : null}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {period.rows.length} 筆 · 已對帳 {period.reconciledCount}/{period.rows.length}
                      {period.dueDate ? ` · 繳款日 ${period.dueDate.slice(5)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="num" style={{ fontSize: 15, fontWeight: 500, color: period.spend > 0 ? "var(--ns-neg)" : "var(--ns-fg-dim)" }}>
                      NT${formatNumber(period.spend)}
                    </div>
                    {period.spend + period.total > 0.5 ? (
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>淨額 NT${formatNumber(-period.total)}</div>
                    ) : null}
                  </div>
                  {open && unreconciled > 0 ? (
                    <button
                      className="ns-btn ghost"
                      style={{ fontSize: 12, padding: "4px 10px", minHeight: "auto" }}
                      onClick={(e) => { e.stopPropagation(); markAll(period.key, true); }}
                      disabled={setReviewed.isPending}
                    >
                      全部對帳
                    </button>
                  ) : null}
                </div>
                {open ? (
                  period.rows.length === 0 ? (
                    <div className="muted" style={{ padding: "16px 18px", fontSize: 13 }}>本期尚無交易。</div>
                  ) : (
                    period.rows.map((row, i) => (
                      <div
                        key={row.id}
                        onClick={() => toggle(row.id, row.isReviewed)}
                        style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", cursor: "pointer", opacity: row.isReviewed ? 0.6 : 1 }}
                      >
                        {row.isReviewed ? <CheckCircle size={20} weight="fill" style={{ color: "var(--ns-accent)", flexShrink: 0 }} /> : <Circle size={20} style={{ color: "var(--ns-fg-dim)", flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.merchant || row.name || row.category || "交易"}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{row.date.slice(0, 10)}{row.category ? ` · ${row.category}` : ""}</div>
                        </div>
                        <div className="num" style={{ fontSize: 14, color: row.amount < 0 ? "var(--ns-neg)" : "var(--ns-pos)", whiteSpace: "nowrap" }}>
                          {row.amount < 0 ? "−" : "+"}NT${formatNumber(Math.abs(row.amount))}
                        </div>
                      </div>
                    ))
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
