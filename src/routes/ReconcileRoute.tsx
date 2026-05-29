import { CaretRight, CheckCircle, Circle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { formatNumber } from "../domain";
import { useToast } from "../components/Toast";

export function ReconcileRoute() {
  const { accountId } = useParams({ from: "/cash-flow/reconcile/$accountId" });
  const navigate = useNavigate();
  const toast = useToast();
  const { accounts, ledger } = useFinanceData();
  const [onlyUnreconciled, setOnlyUnreconciled] = useState(false);

  const setReviewed = useRepositoryMutation(
    (repository, input: { id: string; reviewed: boolean }) => repository.setLedgerReviewed(input.id, input.reviewed),
    ["ledger"],
  );

  const account = (accounts.data ?? []).find((a) => a.id === accountId);
  const rows = useMemo(
    () => (ledger.data ?? [])
      .filter((row) => row.accountId === accountId && row.deletedAt === null && row.entryType !== "transfer")
      .sort((a, b) => b.date.localeCompare(a.date)),
    [ledger.data, accountId],
  );

  const reconciledCount = rows.filter((r) => r.isReviewed).length;
  const unreconciled = rows.filter((r) => !r.isReviewed);
  const unreconciledTotal = unreconciled.reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const visible = onlyUnreconciled ? unreconciled : rows;

  async function toggle(id: string, current: boolean) {
    try {
      await setReviewed.mutateAsync({ id, reviewed: !current });
    } catch {
      toast.error("更新失敗");
    }
  }

  async function markAll(reviewed: boolean) {
    const targets = reviewed ? unreconciled : rows.filter((r) => r.isReviewed);
    try {
      for (const row of targets) await setReviewed.mutateAsync({ id: row.id, reviewed });
      toast.success(reviewed ? "已全部標記對帳" : "已清除對帳狀態");
    } catch {
      toast.error("更新失敗");
    }
  }

  if (!account) {
    return <div style={{ padding: "24px 32px" }} className="muted">找不到帳戶。</div>;
  }

  const owed = Math.max(0, -account.balance);

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
            核對每筆刷卡紀錄是否與銀行帳單吻合。
            {account.statementDay ? ` 結帳日每月 ${account.statementDay} 號。` : ""}
            {account.paymentDueDay ? ` 繳款日每月 ${account.paymentDueDay} 號。` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ns-btn" onClick={() => markAll(true)} disabled={setReviewed.isPending || unreconciled.length === 0}>全部標記已對帳</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <div className="ns-card" style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>本期應繳</div>
          <div className="num" style={{ fontSize: 19, color: owed > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(owed)}</div>
        </div>
        <div className="ns-card" style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>已對帳 / 總筆數</div>
          <div className="num" style={{ fontSize: 19 }}>{reconciledCount} / {rows.length}</div>
        </div>
        <div className="ns-card" style={{ padding: 16 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>未對帳金額</div>
          <div className="num" style={{ fontSize: 19, color: unreconciledTotal > 0 ? "var(--ns-neg)" : undefined }}>NT${formatNumber(unreconciledTotal)}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyUnreconciled} onChange={(e) => setOnlyUnreconciled(e.target.checked)} />
          只看未對帳
        </label>
      </div>

      {/* Transactions */}
      <div className="ns-card" style={{ padding: 0 }}>
        {visible.length === 0 ? (
          <div className="muted" style={{ padding: 40, textAlign: "center", fontSize: 13 }}>{onlyUnreconciled ? "全部已對帳 🎉" : "此帳戶尚無交易紀錄。"}</div>
        ) : (
          visible.map((row, i) => (
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
        )}
      </div>
    </div>
  );
}
