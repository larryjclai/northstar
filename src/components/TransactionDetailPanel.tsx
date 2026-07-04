import { ArrowsClockwise, CalendarBlank, Check, CopySimple, PencilSimple, Receipt, Storefront, Tag, Trash, Wallet, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "./coss/button";
import { Badge } from "./coss/badge";
import { arApAccountRoles } from "./arApAccountRoles";
import type { LedgerTransaction, RecurringTransaction } from "../domain";
import { formatNumber, installmentLabel, recurringFrequencyLabels, todayInTimezone } from "../domain";

interface TransactionDetailPanelProps {
  row: LedgerTransaction | null;
  onClose: () => void;
  onEdit: (row: LedgerTransaction) => void;
  onDuplicate?: (row: LedgerTransaction) => void;
  onDelete: (row: LedgerTransaction) => void;
  accountName: (id: string) => string;
  recurringRows?: RecurringTransaction[];
  onRefund?: (row: LedgerTransaction, refundAmount: number, refundDate: string, refundNote: string) => Promise<void>;
  onSettle?: (row: LedgerTransaction) => void;
}

const TYPE_LABELS: Record<string, { label: string; color: string; sign: string }> = {
  expense: { label: "支出", color: "var(--ns-neg)", sign: "−" },
  income: { label: "收入", color: "var(--ns-pos)", sign: "+" },
  transfer: { label: "轉帳", color: "var(--ns-accent)", sign: "" },
};

export function TransactionDetailPanel({ row, onClose, onEdit, onDuplicate, onDelete, accountName, recurringRows, onRefund, onSettle }: TransactionDetailPanelProps) {
  // Two-click delete confirm — window.confirm is a no-op in the Tauri webview.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundError, setRefundError] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  useEffect(() => {
    setConfirmDelete(false);
    setRefundOpen(false);
    setRefundError("");
    setRefundSubmitting(false);
  }, [row?.id]);

  if (!row) return null;

  const isRefund = Boolean(row.refundOfLedgerId);
  // 可記退款的條件：一般支出（負數），且不是退款本身、不是代墊
  const canRefund = onRefund != null
    && row.entryType === "expense"
    && row.amount < 0
    && !row.refundOfLedgerId
    && !row.counterAccountId;

  async function submitRefund() {
    if (!onRefund || !row) return;
    const maxAbs = Math.abs(row.amount);
    const parsed = parseFloat(refundAmount);
    if (isNaN(parsed) || parsed <= 0) { setRefundError("請輸入有效金額"); return; }
    if (parsed > maxAbs) { setRefundError(`退款金額不能超過 ${maxAbs}`); return; }
    setRefundSubmitting(true);
    setRefundError("");
    try {
      await onRefund(row, parsed, refundDate || new Date().toISOString().slice(0, 10), refundNote);
      setRefundOpen(false);
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : "退款建立失敗");
    } finally {
      setRefundSubmitting(false);
    }
  }

  const meta = TYPE_LABELS[row.entryType] || TYPE_LABELS.expense;
  const linkedRule = row.recurringRuleId && recurringRows
    ? recurringRows.find((r) => r.id === row.recurringRuleId) ?? null
    : null;
  const formattedDate = (() => {
    try {
      const d = new Date(row.date);
      return d.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
    } catch {
      return row.date;
    }
  })();

  const isSettled = row.settlementStatus === "settled";
  const settlementLabel = row.settlementStatus === "receivable" ? "應收" : row.settlementStatus === "payable" ? "應付" : "";
  const isReimbursement = row.counterAccountId != null;
  // For 代墊 rows the two legs hit different accounts. accountId is the leg that
  // posts on settle; counterAccountId is the leg that posted on creation.
  // 應收 (AR): counter = 付款帳戶, main = 收款帳戶. 應付 (AP): counter = 收款帳戶, main = 付款帳戶.
  // `settlementStatus` becomes "settled" after 結清, so derive AR-vs-AP from the
  // STABLE `entryType` (AR persists as income, AP as expense — preserved on settle).
  const arApRoles = arApAccountRoles(row, accountName);
  // 結清 button copy still keys off whether this is a receivable for the verb.
  const isReceivable = row.entryType === "income";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          zIndex: 998, transition: "opacity 0.2s", opacity: 1,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 460,
          background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)",
          zIndex: 999, display: "flex", flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          animation: "slideInRight 0.2s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--ns-border)" }}>
          <div className="text-body flex items-center gap-2 font-semibold">
            <Receipt size={16} />
            交易詳情
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="p-1.5">
            <X size={16} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1" style={{ overflow: "auto", padding: "28px 24px" }}>
          {/* Amount Hero */}
          <div className="text-center" style={{ marginBottom: 32 }}>
            <div
              className="mb-3.5"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 56, borderRadius: "var(--ns-r-md)",
                background: meta.color + "18",
              }}
            >
              <Receipt size={26} color={meta.color} weight="duotone" />
            </div>
            <div className="text-[32px] font-semibold" style={{ fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums lining-nums", color: meta.color, letterSpacing: -1 }}>
              {meta.sign}{row.currency === "TWD" ? "NT$" : row.currency + " "}{formatNumber(Math.abs(row.amount))}
            </div>
            <div className="flex justify-center mt-2 gap-1.5" style={{ flexWrap: "wrap" }}>
              <span
                className="text-caption font-medium"
                style={{
                  padding: "3px 10px", borderRadius: 99,
                  background: meta.color + "18", color: meta.color,
                }}
              >
                {meta.label}
              </span>
              {!isSettled && settlementLabel && (
                <span
                  className="text-caption font-medium"
                  style={{
                    padding: "3px 10px", borderRadius: 99,
                    background: "var(--ns-chart-3)" + "18", color: "var(--ns-chart-3)",
                  }}
                >
                  {settlementLabel}
                </span>
              )}
              {isReimbursement && (
                <span
                  className="text-caption font-medium"
                  style={{
                    padding: "3px 10px", borderRadius: 99,
                    background: "var(--ns-chart-4)" + "18", color: "var(--ns-chart-4)",
                  }}
                >
                  代墊
                </span>
              )}
              {row.recurringRuleId ? (
                <span
                  className="text-caption font-medium flex items-center gap-1"
                  style={{
                    padding: "3px 10px", borderRadius: 99,
                    background: "var(--ns-accent-soft)", color: "var(--ns-accent)",
                  }}
                >
                  <ArrowsClockwise size={10} weight="bold" />
                  週期交易{linkedRule ? ` · ${recurringFrequencyLabels[linkedRule.frequency]}` : ""}
                </span>
              ) : (
                <span
                  className="text-caption font-medium"
                  style={{
                    padding: "3px 10px", borderRadius: 99,
                    background: "var(--ns-border)", color: "var(--ns-fg-muted)",
                  }}
                >
                  單筆交易
                </span>
              )}
              {installmentLabel(row) ? (
                <Badge variant="outline" className="rounded-full text-caption" style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)", padding: "3px 10px" }}>
                  {installmentLabel(row)}
                </Badge>
              ) : null}
              {isRefund ? (
                <span className="text-caption font-medium" style={{ padding: "3px 10px", borderRadius: 99, background: "var(--ns-pos)" + "18", color: "var(--ns-pos)" }}>
                  退款
                </span>
              ) : null}
            </div>
          </div>

          {/* Detail Fields */}
          <div className="flex flex-col gap-0">
            <DetailField icon={<PencilSimple size={15} />} label="名稱" value={row.name || "—"} />
            <DetailField icon={<Tag size={15} />} label="分類" value={
              row.subcategory ? `${row.category} / ${row.subcategory}` : row.category || "未分類"
            } />
            <DetailField icon={<Storefront size={15} />} label="商家" value={row.merchant || "—"} />
            {isReimbursement && arApRoles ? (
              <>
                <DetailField icon={<Wallet size={15} />} label={arApRoles.payLabel} value={arApRoles.payValue} />
                <DetailField icon={<Wallet size={15} />} label={arApRoles.receiveLabel} value={arApRoles.receiveValue} />
              </>
            ) : (
              <DetailField icon={<Wallet size={15} />} label="帳戶" value={row.accountId ? accountName(row.accountId) : (isSettled ? "—" : "結清時指定")} />
            )}
            <DetailField icon={<CalendarBlank size={15} />} label="日期" value={formattedDate} />
            {linkedRule && (
              <DetailField
                icon={<ArrowsClockwise size={15} />}
                label="週期規則"
                value={`${linkedRule.merchant || linkedRule.category} · ${recurringFrequencyLabels[linkedRule.frequency]}`}
              />
            )}
            {row.installmentGroupId && row.installmentIndex != null && row.installmentTotal != null && (
              <DetailField
                icon={<Receipt size={15} />}
                label="分期"
                value={`第 ${row.installmentIndex} 期，共 ${row.installmentTotal} 期`}
              />
            )}
            {row.note && (
              <DetailField icon={<Receipt size={15} />} label="備註" value={row.note} />
            )}
          </div>

          {/* Settle (結清): only for an unsettled receivable/payable. Hands off
              to the existing settle flow (opens SettleModal in CashFlowRoute). */}
          {onSettle && !isSettled && (row.settlementStatus === "receivable" || row.settlementStatus === "payable") ? (
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--ns-border)" }}>
              <Button variant="outline" className="w-full justify-center" onClick={() => onSettle(row)}>
                <Check size={14} />{isReceivable ? "收款結清" : "付款結清"}
              </Button>
            </div>
          ) : null}

          {/* Refund (退款沖銷): a refund posts a positive-amount expense linked
              to this row, so it nets against the original category's spend
              instead of inflating income. Only offered for ordinary expenses. */}
          {canRefund ? (
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--ns-border)" }}>
              {!refundOpen ? (
                <Button variant="outline" className="w-full justify-center" onClick={() => { setRefundOpen(true); setRefundAmount(String(Math.abs(row.amount))); setRefundError(""); }}>
                  <ArrowsClockwise size={14} />記一筆退款
                </Button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="text-body font-semibold">記退款</div>
                  <div className="muted text-xs" style={{ lineHeight: 1.5 }}>
                    退款會沖減此筆「{row.category || "未分類"}」分類的支出，不會被當成收入。
                  </div>
                  <label className="text-xs muted">
                    退款金額 · {row.currency}
                    <input className="ns-input mt-1" inputMode="decimal" value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      style={{ fontFamily: "var(--ns-font-num)" }} />
                  </label>
                  <label className="text-xs muted">
                    退款日期
                    <input className="ns-input mt-1" type="date" value={refundDate || row.date.slice(0, 10)}
                      onChange={(e) => setRefundDate(e.target.value)} />
                  </label>
                  <label className="text-xs muted">
                    備註（選填）
                    <input className="ns-input mt-1" value={refundNote} placeholder="退貨 / 部分退款…"
                      onChange={(e) => setRefundNote(e.target.value)} />
                  </label>
                  {refundError ? <div className="text-xs neg">{refundError}</div> : null}
                  <div className="flex gap-2">
                    <Button className="flex-1 justify-center" disabled={refundSubmitting} onClick={submitRefund}>
                      {refundSubmitting ? "建立中…" : "確認退款"}
                    </Button>
                    <Button variant="ghost" className="justify-center" style={{ flex: 0.6 }} onClick={() => setRefundOpen(false)}>取消</Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex py-4 px-6 gap-2.5" style={{ borderTop: "1px solid var(--ns-border)" }}>
          {confirmDelete ? (
            <>
              <Button variant="outline"
                className="flex-1 justify-center"
                style={{ color: "var(--ns-neg)" }}
                onClick={() => onDelete(row)}
              >
                <Trash size={14} />確定刪除
              </Button>
              <Button variant="ghost" className="justify-center" style={{ flex: 0.7 }} onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
            </>
          ) : (
            <Button variant="outline"
              className="flex-1 justify-center"
              style={{ color: "var(--ns-neg)" }}
              onClick={() => row.installmentGroupId ? onDelete(row) : setConfirmDelete(true)}
            >
              <Trash size={14} />刪除
            </Button>
          )}
          {onDuplicate ? (
            <Button variant="outline" className="flex-1 justify-center" onClick={() => onDuplicate(row)}>
              <CopySimple size={14} />複製
            </Button>
          ) : null}
          <Button className="justify-center" style={{ flex: 2 }} onClick={() => onEdit(row)}>
            <PencilSimple size={14} />編輯交易
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

function DetailField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="items-center py-3.5 px-0 gap-2" style={{
      display: "grid", gridTemplateColumns: "28px 72px 1fr",
      borderBottom: "1px solid var(--ns-border)",
    }}>
      <span className="muted">{icon}</span>
      <span className="text-xs muted font-medium">{label}</span>
      <span className="text-sm text-right font-medium">{value}</span>
    </div>
  );
}
