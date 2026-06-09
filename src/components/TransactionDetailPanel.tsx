import { ArrowsClockwise, CalendarBlank, CopySimple, PencilSimple, Receipt, Storefront, Tag, Trash, Wallet, X } from "@phosphor-icons/react";
import { Button } from "./coss/button";
import type { LedgerTransaction, RecurringTransaction } from "../domain";
import { formatNumber, recurringFrequencyLabels } from "../domain";

interface TransactionDetailPanelProps {
  row: LedgerTransaction | null;
  onClose: () => void;
  onEdit: (row: LedgerTransaction) => void;
  onDuplicate?: (row: LedgerTransaction) => void;
  onDelete: (id: string) => void;
  accountName: (id: string) => string;
  recurringRows?: RecurringTransaction[];
}

const TYPE_LABELS: Record<string, { label: string; color: string; sign: string }> = {
  expense: { label: "支出", color: "var(--ns-neg)", sign: "−" },
  income: { label: "收入", color: "var(--ns-pos)", sign: "+" },
  transfer: { label: "轉帳", color: "var(--ns-accent)", sign: "" },
};

export function TransactionDetailPanel({ row, onClose, onEdit, onDuplicate, onDelete, accountName, recurringRows }: TransactionDetailPanelProps) {
  if (!row) return null;

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
  // 應收: counter = 付款帳戶, main = 收款帳戶. 應付: counter = 收款帳戶, main = 付款帳戶.
  const isReceivable = row.settlementStatus === "receivable";

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
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Receipt size={16} />
            交易詳情
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} style={{ padding: 6 }}>
            <X size={16} />
          </Button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "28px 24px" }}>
          {/* Amount Hero */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 56, height: 56, borderRadius: "var(--ns-r-md)",
                background: meta.color + "18", marginBottom: 14,
              }}
            >
              <Receipt size={26} color={meta.color} weight="duotone" />
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums lining-nums", color: meta.color, letterSpacing: -1 }}>
              {meta.sign}{row.currency === "TWD" ? "NT$" : row.currency + " "}{formatNumber(Math.abs(row.amount))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500,
                  background: meta.color + "18", color: meta.color,
                }}
              >
                {meta.label}
              </span>
              {!isSettled && settlementLabel && (
                <span
                  style={{
                    padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500,
                    background: "var(--ns-chart-3)" + "18", color: "var(--ns-chart-3)",
                  }}
                >
                  {settlementLabel}
                </span>
              )}
              {isReimbursement && (
                <span
                  style={{
                    padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500,
                    background: "var(--ns-chart-4)" + "18", color: "var(--ns-chart-4)",
                  }}
                >
                  代墊
                </span>
              )}
              {row.recurringRuleId ? (
                <span
                  style={{
                    padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500,
                    background: "var(--ns-accent-soft)", color: "var(--ns-accent)",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  <ArrowsClockwise size={10} weight="bold" />
                  週期交易{linkedRule ? ` · ${recurringFrequencyLabels[linkedRule.frequency]}` : ""}
                </span>
              ) : (
                <span
                  style={{
                    padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 500,
                    background: "var(--ns-border)", color: "var(--ns-fg-muted)",
                  }}
                >
                  單筆交易
                </span>
              )}
            </div>
          </div>

          {/* Detail Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <DetailField icon={<PencilSimple size={15} />} label="名稱" value={row.name || "—"} />
            <DetailField icon={<Tag size={15} />} label="分類" value={
              row.subcategory ? `${row.category} / ${row.subcategory}` : row.category || "未分類"
            } />
            <DetailField icon={<Storefront size={15} />} label="商家" value={row.merchant || "—"} />
            {isReimbursement ? (
              <>
                <DetailField icon={<Wallet size={15} />} label={isReceivable ? "付款帳戶（代墊）" : "收款帳戶（代墊）"} value={accountName(row.counterAccountId!)} />
                <DetailField icon={<Wallet size={15} />} label={isReceivable ? "收款帳戶" : "付款帳戶"} value={row.accountId ? accountName(row.accountId) : "結清時指定"} />
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
            {row.note && (
              <DetailField icon={<Receipt size={15} />} label="備註" value={row.note} />
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 10 }}>
          <Button variant="outline"
            style={{ flex: 1, justifyContent: "center", color: "var(--ns-neg)" }}
            onClick={() => {
              if (window.confirm("確定要刪除這筆交易嗎？")) {
                onDelete(row.id);
              }
            }}
          >
            <Trash size={14} />刪除
          </Button>
          {onDuplicate ? (
            <Button variant="outline" style={{ flex: 1, justifyContent: "center" }} onClick={() => onDuplicate(row)}>
              <CopySimple size={14} />複製
            </Button>
          ) : null}
          <Button style={{ flex: 2, justifyContent: "center" }} onClick={() => onEdit(row)}>
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
    <div style={{
      display: "grid", gridTemplateColumns: "28px 72px 1fr", alignItems: "center",
      padding: "14px 0", borderBottom: "1px solid var(--ns-border)",
      gap: 8,
    }}>
      <span style={{ color: "var(--ns-fg-muted)" }}>{icon}</span>
      <span style={{ fontSize: 12, color: "var(--ns-fg-muted)", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}
