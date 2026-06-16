import { CaretRight, CaretDown, CheckCircle, Circle, CurrencyCircleDollar } from "@phosphor-icons/react";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
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
  const { accounts, ledger, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  // Per-period open/closed override. Absent → falls back to the default (the
  // current period starts open, past periods start collapsed).
  const [expandOverride, setExpandOverride] = useState<Record<string, boolean>>({});

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
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Reconciliation · {account.currency}</div>
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
              onClick={markPaid}
              loading={updateAccount.isPending}
              title={isPaid ? `已繳款至 ${account.creditPaymentPaidUntil}` : "標記本期帳單已繳款，提醒面板暫時隱藏"}
            >
              <CurrencyCircleDollar size={14} weight={isPaid ? "fill" : "regular"} />
              {isPaid ? "已繳款" : "標記已繳款"}
            </Button>
          )}
        </div>
      </div>

      {/* Summary — current open cycle. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>本期消費</div>
          <div className="num text-[19px]" style={{ color: currentSpend > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(currentSpend)}</div>
          {currentRefunds > 0.5 ? (
            <div className="muted text-caption" style={{ marginTop: 4 }}>
              退款 −NT${formatNumber(currentRefunds)} · 淨額 NT${formatNumber(currentNet)}
            </div>
          ) : null}
        </Card>
        <Card style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>本期已對帳 / 筆數</div>
          <div className="num text-[19px]">{currentReconciled} / {currentCount}</div>
        </Card>
        <Card style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>卡片未繳總額</div>
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
                          <div className="muted text-caption">{row.date.slice(0, 10)}{row.category ? ` · ${row.category}` : ""}</div>
                        </div>
                        <div className="num text-sm" style={{ color: row.amount < 0 ? "var(--ns-neg)" : "var(--ns-pos)", whiteSpace: "nowrap" }}>
                          {row.amount < 0 ? "−" : "+"}NT${formatNumber(Math.abs(row.amount))}
                        </div>
                      </div>
                    ))
                  )
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
