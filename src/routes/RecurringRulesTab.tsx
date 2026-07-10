import {
  ArrowsClockwise,
  CalendarBlank,
  Check,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { AppSelect } from "../components/AppSelect";
import { useState } from "react";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { RecurringDraft } from "../data/repositories";
import { formatNumber, recurringFrequencyLabels } from "../domain";
import { useNumericField } from "../hooks/useNumericField";
import type { RecurringTransaction } from "../domain";

type FreqFilter = "all" | "monthly" | "yearly" | "weekly" | "biweekly" | "paused";

function freqLabel(rule: RecurringTransaction): string {
  if (rule.frequency === "yearly") return `每年 ${rule.nextRunDate.slice(5, 10)}`;
  if (rule.frequency === "monthly") return `每月 ${rule.dayOfMonth} 日`;
  if (rule.frequency === "biweekly") return "每兩週";
  if (rule.frequency === "weekly") return "每週";
  return recurringFrequencyLabels[rule.frequency] ?? rule.frequency;
}

function monthlyEquivalent(rule: RecurringTransaction): number {
  if (rule.frequency === "yearly") return rule.amount / 12;
  if (rule.frequency === "biweekly") return rule.amount * 2;
  return rule.amount;
}

export function RecurringRulesTab() {
  const { recurring, accounts } = useFinanceData();
  const toast = useToast();
  const [filter, setFilter] = useState<FreqFilter>("all");
  const [editingRule, setEditingRule] = useState<RecurringTransaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const createRecurring = useRepositoryMutation(
    (repo, input: RecurringDraft) => repo.createRecurringTransaction(input),
    ["recurring"],
  );
  const updateRecurring = useRepositoryMutation(
    (repo, input: RecurringDraft & { id: string }) => repo.updateRecurringTransaction(input.id, input),
    ["recurring"],
  );
  const deleteRecurring = useRepositoryMutation(
    (repo, id: string) => repo.deleteRecurringTransaction(id),
    ["recurring"],
  );

  const rules = recurring.data ?? [];
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? id;

  const filtered = rules.filter((r) => {
    if (filter === "paused") return !r.isActive;
    if (filter === "all") return r.isActive;
    return r.isActive && r.frequency === filter;
  });

  const activeRules = rules.filter((r) => r.isActive);
  const monthlyIncome = activeRules
    .filter((r) => r.entryType === "income")
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0);
  const monthlyExpense = activeRules
    .filter((r) => r.entryType === "expense")
    .reduce((sum, r) => sum + Math.abs(monthlyEquivalent(r)), 0);
  const monthlyNet = monthlyIncome - monthlyExpense;
  const pausedCount = rules.filter((r) => !r.isActive).length;

  const allFilterOptions: { key: FreqFilter; label: string }[] = [
    { key: "all", label: `全部 (${activeRules.length})` },
    { key: "monthly", label: `每月 (${activeRules.filter((r) => r.frequency === "monthly").length})` },
    { key: "yearly", label: `每年 (${activeRules.filter((r) => r.frequency === "yearly").length})` },
    { key: "weekly", label: `每週 (${activeRules.filter((r) => r.frequency === "weekly").length})` },
    { key: "paused", label: `暫停 (${pausedCount})` },
  ];
  const filterOptions = allFilterOptions.filter((o) => o.key === "all" || o.key === "paused" || parseInt(o.label.match(/\d+/)?.[0] ?? "0") > 0 || filter === o.key);

  function openCreate() {
    setEditingRule(null);
    setIsCreating(true);
    setSheetOpen(true);
  }

  function openEdit(rule: RecurringTransaction) {
    setEditingRule(rule);
    setIsCreating(false);
    setSheetOpen(true);
  }

  async function handleDelete(id: string) {
    try {
      await deleteRecurring.mutateAsync(id);
      setSheetOpen(false);
      toast.success("已刪除週期規則");
    } catch {
      toast.error("刪除失敗");
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--ns-gap-card)" }}>
      {/* Summary KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 12 }}>
        <KpiCard label="月收入（預估）" value={`NT$${formatNumber(monthlyIncome)}`} color="var(--ns-pos)" />
        <KpiCard label="月支出（預估）" value={`NT$${formatNumber(monthlyExpense)}`} color="var(--ns-neg)" />
        <KpiCard
          label="月淨現金流"
          value={`${monthlyNet >= 0 ? "+" : "−"}NT$${formatNumber(Math.abs(monthlyNet))}`}
          color={monthlyNet >= 0 ? "var(--ns-pos)" : "var(--ns-neg)"}
        />
        <KpiCard label="規則總計" value={`${rules.length} 條`} color="var(--ns-accent)" />
      </div>

      {/* Table card */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div className="flex items-center gap-3" style={{ padding: "16px 20px", borderBottom: "1px solid var(--ns-border)" }}>
          <ArrowsClockwise size={15} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <span className="text-sm font-semibold">週期規則</span>
          <div className="flex-1" />
          <Button className="text-xs" style={{ padding: "5px 12px", minHeight: "auto" }} onClick={openCreate}>
            <Plus size={12} weight="bold" />新增規則
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex gap-1.5" style={{ padding: "10px 20px", borderBottom: "1px solid var(--ns-border)", flexWrap: "wrap" }}>
          {filterOptions.map((o) => (
            <button
              key={o.key}
              onClick={() => setFilter(o.key)}
              className="text-xs"
              style={{
                padding: "4px 12px", borderRadius: 999, fontWeight: 500, cursor: "pointer",
                border: filter === o.key ? "none" : "1px solid var(--ns-border)",
                background: filter === o.key ? "var(--ns-accent)" : "var(--ns-bg-card)",
                color: filter === o.key ? "var(--ns-accent-fg)" : "var(--ns-fg-dim)",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Mobile: a 6-column table can't fit a phone, so each rule is a
            tappable card. The full table returns at sm+. */}
        <div className="flex flex-col gap-2 p-3 sm:hidden">
          {filtered.length === 0 ? (
            <div className="muted text-body p-5 text-center">
              {filter === "paused" ? "沒有暫停中的規則。" : "還沒有週期規則，點擊「新增規則」建立第一條。"}
            </div>
          ) : filtered.map((rule) => (
            <button
              key={`m-${rule.id}`}
              type="button"
              onClick={() => openEdit(rule)}
              className="flex flex-col gap-1.5 rounded-xl border p-3 text-left outline-none"
              style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)", opacity: rule.isActive ? 1 : 0.55 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{rule.merchant || rule.category}</span>
                <span className="num text-sm font-medium" style={{ whiteSpace: "nowrap", color: rule.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                  {rule.entryType === "income" ? "+" : "−"}NT${formatNumber(Math.abs(monthlyEquivalent(rule)))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="muted truncate text-xs">
                  {rule.category}{rule.subcategory ? ` / ${rule.subcategory}` : ""} · {freqLabel(rule)} · {accountName(rule.accountId)}
                </span>
                <span className="text-caption shrink-0 font-medium" style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: rule.isActive ? "var(--ns-pos-soft)" : "var(--ns-border)", color: rule.isActive ? "var(--ns-pos)" : "var(--ns-fg-muted)" }}>
                  {rule.isActive ? "啟用" : "暫停"}
                </span>
              </div>
              <div className="muted text-caption">下次 {rule.nextRunDate}</div>
            </button>
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:contents">
        {/* Column header */}
        {filtered.length > 0 && (
          <div className="text-caption" style={{
            display: "grid", gridTemplateColumns: "1fr 90px 110px 110px 120px 80px", columnGap: 16,
            padding: "8px 20px", borderBottom: "1px solid var(--ns-border)",
            color: "var(--ns-fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>規則名稱 / 分類</span>
            <span>週期</span>
            <span className="text-right">月均金額</span>
            <span>帳戶</span>
            <span>下次觸發</span>
            <span>狀態</span>
          </div>
        )}

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="muted text-body text-center" style={{ padding: "32px 20px" }}>
            {filter === "paused" ? "沒有暫停中的規則。" : "還沒有週期規則，點擊「新增規則」建立第一條。"}
          </div>
        ) : (
          filtered.map((rule) => (
            <div
              key={rule.id}
              onClick={() => openEdit(rule)}
              style={{
                display: "grid", gridTemplateColumns: "1fr 90px 110px 110px 120px 80px", columnGap: 16,
                padding: "12px 20px", borderBottom: "1px solid var(--ns-border)",
                cursor: "pointer", transition: "background 0.12s",
                opacity: rule.isActive ? 1 : 0.5,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ns-bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div className="min-w-0">
                <div className="text-body font-medium truncate">
                  {rule.merchant || rule.category}
                </div>
                <div className="muted text-caption" style={{ marginTop: 1 }}>{rule.category}{rule.subcategory ? ` / ${rule.subcategory}` : ""}</div>
              </div>
              <span className="text-xs" style={{ color: "var(--ns-fg-dim)", alignSelf: "center" }}>{freqLabel(rule)}</span>
              <span
                className="num text-body font-medium text-right"
                style={{
                  alignSelf: "center",
                  color: rule.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)",
                }}
              >
                {rule.entryType === "income" ? "+" : "−"}NT${formatNumber(Math.abs(monthlyEquivalent(rule)))}
              </span>
              <span className="text-xs truncate" style={{ color: "var(--ns-fg-dim)", alignSelf: "center" }}>
                {accountName(rule.accountId)}
              </span>
              <span className="text-xs" style={{ color: "var(--ns-fg-dim)", alignSelf: "center" }}>
                <CalendarBlank size={12} className="mr-1" style={{ verticalAlign: "middle" }} />
                {rule.nextRunDate}
              </span>
              <span style={{ alignSelf: "center" }}>
                <span className="text-caption font-medium" style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 999,
                  background: rule.isActive ? "var(--ns-pos-soft)" : "var(--ns-border)",
                  color: rule.isActive ? "var(--ns-pos)" : "var(--ns-fg-muted)",
                }}>
                  {rule.isActive ? "啟用" : "暫停"}
                </span>
              </span>
            </div>
          ))
        )}
        </div>
      </Card>

      {/* Edit Sheet */}
      {sheetOpen && (
        <RuleEditSheet
          rule={editingRule}
          isCreating={isCreating}
          accountRows={accounts.data ?? []}
          onClose={() => setSheetOpen(false)}
          onSave={async (draft, id) => {
            try {
              if (id) {
                await updateRecurring.mutateAsync({ ...draft, id });
                toast.success("已更新週期規則");
              } else {
                await createRecurring.mutateAsync(draft);
                toast.success("已建立週期規則");
              }
              setSheetOpen(false);
            } catch {
              toast.error("儲存失敗");
            }
          }}
          onDelete={handleDelete}
          saving={createRecurring.isPending || updateRecurring.isPending}
        />
      )}
    </div>
  );
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div className="text-caption" style={{ color: "var(--ns-fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div className="num text-lg font-semibold" style={{ color }}>{value}</div>
    </Card>
  );
}

/* ─── Rule Edit Sheet ─── */
function RuleEditSheet({
  rule,
  isCreating,
  accountRows,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  rule: RecurringTransaction | null;
  isCreating: boolean;
  accountRows: Array<{ id: string; name: string; currency: string }>;
  onClose: () => void;
  onSave: (draft: RecurringDraft, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}) {
  const primaryCurrency = accountRows[0]?.currency ?? "TWD";
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<RecurringDraft>(() => ({
    accountId: rule?.accountId ?? accountRows[0]?.id ?? "",
    amount: rule ? Math.abs(rule.amount) : 0,
    currency: rule?.currency ?? primaryCurrency,
    category: rule?.category ?? "",
    subcategory: rule?.subcategory ?? "",
    merchant: rule?.merchant ?? "",
    entryType: rule?.entryType ?? "expense",
    settlementStatus: rule?.settlementStatus ?? "settled",
    note: rule?.note ?? "",
    frequency: rule?.frequency ?? "monthly",
    dayOfMonth: rule?.dayOfMonth ?? new Date().getDate(),
    nextRunDate: rule?.nextRunDate ?? today,
    isActive: rule?.isActive ?? true,
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");

  const amountField = useNumericField(form.amount, (v) => setForm({ ...form, amount: v }));

  const signedAmount = form.entryType === "expense" ? -Math.abs(form.amount) : Math.abs(form.amount);

  async function handleSave() {
    if (!form.accountId) { setMessage("請選擇帳戶。"); return; }
    if (!form.amount) { setMessage("請輸入金額。"); return; }
    setMessage("");
    await onSave({ ...form, amount: signedAmount }, rule?.id ?? null);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--ns-scrim)", zIndex: 998 }} />
      <div
        className="flex flex-col"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px, 100%)",
          background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)",
          zIndex: 999,
          boxShadow: "var(--ns-shadow-2)",
          animation: "slideInRight 0.2s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5" style={{ padding: "18px 24px", borderBottom: "1px solid var(--ns-border)" }}>
          <ArrowsClockwise size={16} style={{ color: "var(--ns-accent)" }} />
          <span className="text-[15px] font-semibold">{isCreating ? "新增週期規則" : "編輯週期規則"}</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon-sm" aria-label="關閉" onClick={onClose}><X size={16} /></Button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4" style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

          {/* Entry type toggle */}
          <RuleField label="類型">
            <div className="flex gap-1.5">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, entryType: t })}
                  className="text-body font-medium"
                  style={{
                    padding: "6px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    border: form.entryType === t ? "none" : "1px solid var(--ns-border)",
                    background: form.entryType === t ? (t === "expense" ? "var(--ns-neg)" : "var(--ns-pos)") : "var(--ns-bg-card)",
                    color: form.entryType === t ? "#fff" : "var(--ns-fg-dim)",
                    transition: "all 0.15s",
                  }}
                >
                  {t === "expense" ? "支出" : "收入"}
                </button>
              ))}
            </div>
          </RuleField>

          {/* Name */}
          <RuleField label="名稱 / 商家">
            <input
              className="ns-input"
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              placeholder="例：Netflix、房租"
            />
          </RuleField>

          {/* Amount */}
          <RuleField label="金額" required>
            <input
              className="ns-input"
              placeholder="0"
              style={{ fontFamily: "var(--ns-font-mono)" }}
              {...amountField}
            />
          </RuleField>

          {/* Frequency + day */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <RuleField label="週期">
              <AppSelect
                value={form.frequency}
                onChange={(frequency) => setForm({ ...form, frequency: frequency as RecurringDraft["frequency"] })}
                options={[
                  { value: "weekly", label: "每週" },
                  { value: "biweekly", label: "每兩週" },
                  { value: "monthly", label: "每月" },
                  { value: "yearly", label: "每年" },
                ]}
                style={{ width: "100%", height: 40 }}
              />
            </RuleField>
            <RuleField label="觸發日（幾號）">
              <input
                className="ns-input"
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
                style={{ fontFamily: "var(--ns-font-mono)" }}
              />
            </RuleField>
          </div>

          {/* Account */}
          <RuleField label="帳戶" required>
            <AppSelect
              value={form.accountId || "all"}
              onChange={(id) => {
                const acct = accountRows.find((a) => a.id === id);
                setForm({ ...form, accountId: id === "all" ? "" : id, currency: acct?.currency ?? form.currency });
              }}
              options={[{ value: "all", label: "選擇帳戶" }, ...accountRows.map((account) => ({ value: account.id, label: account.name, description: account.currency }))]}
              placeholder="選擇帳戶"
              style={{ width: "100%", height: 40 }}
            />
          </RuleField>

          {/* Category */}
          <RuleField label="分類">
            <input
              className="ns-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="選填"
            />
          </RuleField>

          {/* Note */}
          <RuleField label="備註">
            <input
              className="ns-input"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="選填"
            />
          </RuleField>

          {/* Active toggle */}
          <RuleField label="狀態">
            <button
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className="text-body"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 16px", borderRadius: 999, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                border: "none",
                background: form.isActive ? "var(--ns-pos-soft)" : "var(--ns-border)",
                color: form.isActive ? "var(--ns-pos)" : "var(--ns-fg-muted)",
              }}
            >
              <div style={{
                width: 32, height: 18, borderRadius: 9, background: form.isActive ? "var(--ns-pos)" : "var(--ns-fg-dim)",
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: 2, width: 14, height: 14, borderRadius: 7,
                  background: "#fff", transition: "left 0.2s",
                  left: form.isActive ? 16 : 2,
                }} />
              </div>
              {form.isActive ? "啟用中" : "已暫停"}
            </button>
          </RuleField>

          {message && <div className="text-body" style={{ color: "var(--ns-neg)" }}>{message}</div>}

          {/* Danger zone */}
          {!isCreating && (
            <div className="mt-2" style={{ padding: "14px 16px", borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-neg-soft)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--ns-neg)" }}>刪除規則</div>
              {confirmDelete ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs flex-1" style={{ color: "var(--ns-fg-muted)" }}>確定刪除？此操作無法復原。</span>
                  <Button variant="outline" className="text-xs" style={{ padding: "4px 12px", minHeight: "auto", color: "var(--ns-neg)" }} onClick={() => onDelete(rule!.id)}>確定刪除</Button>
                  <Button variant="ghost" className="text-xs" style={{ padding: "4px 12px", minHeight: "auto" }} onClick={() => setConfirmDelete(false)}>取消</Button>
                </div>
              ) : (
                <Button variant="ghost"
                  className="text-xs"
                  style={{ padding: "4px 12px", minHeight: "auto", color: "var(--ns-neg)" }}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash size={12} />刪除此規則
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2" style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)" }}>
          <Button variant="ghost" style={{ flex: "0 0 80px", justifyContent: "center" }} onClick={onClose}>取消</Button>
          <Button
            className="flex-1"
            style={{ justifyContent: "center" }}
            onClick={handleSave}
            disabled={saving}
          >
            <Check size={14} weight="bold" />
            {saving ? "儲存中…" : isCreating ? "建立規則" : "儲存變更"}
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

function RuleField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-caption block" style={{ color: "var(--ns-fg-muted)", marginBottom: 6, letterSpacing: 0.04, textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "var(--ns-neg)", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}
