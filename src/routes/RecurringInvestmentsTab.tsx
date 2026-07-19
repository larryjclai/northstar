import { ArrowsClockwise, CalendarBlank, Check, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { AppSelect } from "../components/AppSelect";
import { ModalShell } from "../components/ModalShell";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { useMemo, useState } from "react";
import { useToast } from "../components/Toast";
import { TickerSearchField } from "../components/TickerSearchField";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { RecurringInvestmentDraft } from "../data/repositories";
import { formatNumber, formatQuantity, recurringFrequencyLabels, recurringInvestmentModeLabels, todayInTimezone } from "../domain";
import type { RecurringFrequency, RecurringInvestment, RecurringInvestmentMode } from "../domain";
import { bookAccountIdSet } from "../domain/bookScope";
import { useUiPreferences } from "../state/uiPreferences";

function freqLabel(rule: RecurringInvestment): string {
  if (rule.frequency === "yearly") return `每年 ${rule.nextRunDate.slice(5, 10)}`;
  if (rule.frequency === "monthly") return `每月 ${rule.dayOfMonth} 日`;
  return recurringFrequencyLabels[rule.frequency] ?? rule.frequency;
}

/** Estimated cash per occurrence (交割款). */
function perPeriodCash(rule: Pick<RecurringInvestment, "mode" | "amount" | "quantity" | "price" | "fee">): number {
  const base = rule.mode === "fixedShares" ? (rule.quantity || 0) * (rule.price || 0) : (rule.amount || 0);
  return base + (rule.fee || 0);
}

const emptyDraft: RecurringInvestmentDraft = {
  accountId: "",
  ticker: "",
  name: "",
  currency: "TWD",
  mode: "fixedAmount",
  amount: 0,
  quantity: 0,
  price: 0,
  fee: 0,
  frequency: "monthly",
  dayOfMonth: 1,
  nextRunDate: "",
  isActive: true,
  note: "",
};

export function RecurringInvestmentsTab() {
  const { recurringInvestments, accounts } = useFinanceData();
  const toast = useToast();
  const timezone = useUiPreferences((s) => s.timezone);
  const activeBookId = useUiPreferences((state) => state.activeBookId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecurringInvestmentDraft>(emptyDraft);

  const investmentAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.type === "investment"),
    [accounts.data],
  );

  const createRule = useRepositoryMutation(
    (repo, input: RecurringInvestmentDraft) => repo.createRecurringInvestment(input),
    ["recurringInvestments"],
  );
  const updateRule = useRepositoryMutation(
    (repo, input: RecurringInvestmentDraft & { id: string }) => repo.updateRecurringInvestment(input.id, input),
    ["recurringInvestments"],
  );
  const deleteRule = useRepositoryMutation(
    (repo, id: string) => repo.deleteRecurringInvestment(id),
    ["recurringInvestments"],
  );
  const postRule = useRepositoryMutation(
    (repo, id: string) => repo.postRecurringInvestment(id),
    ["recurringInvestments", "investments", "assets", "accounts", "ledger"],
  );

  const switcherAccountIds = useMemo(
    () => bookAccountIdSet(accounts.data ?? [], activeBookId),
    [accounts.data, activeBookId],
  );
  const rules = useMemo(
    () => (recurringInvestments.data ?? []).filter((r) => switcherAccountIds.has(r.accountId)),
    [recurringInvestments.data, switcherAccountIds],
  );
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name ?? id;
  const today = todayInTimezone(timezone);

  function openCreate() {
    setEditingId(null);
    setDraft({ ...emptyDraft, accountId: investmentAccounts[0]?.id ?? "", currency: investmentAccounts[0]?.currency ?? "TWD", nextRunDate: today });
    setSheetOpen(true);
  }
  function openEdit(rule: RecurringInvestment) {
    setEditingId(rule.id);
    setDraft({
      accountId: rule.accountId, ticker: rule.ticker, name: rule.name, currency: rule.currency,
      mode: rule.mode, amount: rule.amount, quantity: rule.quantity, price: rule.price, fee: rule.fee,
      frequency: rule.frequency, dayOfMonth: rule.dayOfMonth, nextRunDate: rule.nextRunDate, isActive: rule.isActive, note: rule.note,
    });
    setSheetOpen(true);
  }
  function close() {
    setSheetOpen(false);
    setEditingId(null);
  }

  async function submit() {
    if (!draft.ticker.trim()) { toast.error("請輸入標的代號"); return; }
    if (!draft.accountId) { toast.error("請選擇投資帳戶"); return; }
    if (draft.mode === "fixedAmount" && !(draft.amount > 0)) { toast.error("請輸入每期金額"); return; }
    if (draft.mode === "fixedShares" && !(draft.quantity > 0)) { toast.error("請輸入每期股數"); return; }
    try {
      if (editingId) await updateRule.mutateAsync({ ...draft, id: editingId });
      else await createRule.mutateAsync({ ...draft, seedToday: todayInTimezone(timezone) });
      toast.success(editingId ? "已儲存變更" : "已建立定期定額");
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "儲存失敗");
    }
  }

  async function post(rule: RecurringInvestment) {
    try {
      await postRule.mutateAsync(rule.id);
      toast.success(`已記錄 ${rule.ticker} 本期投入`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "記錄失敗");
    }
  }

  async function remove(id: string) {
    try {
      await deleteRule.mutateAsync(id);
      toast.success("已刪除");
    } catch {
      toast.error("刪除失敗");
    }
  }

  const monthlyTotal = rules
    .filter((r) => r.isActive)
    .reduce((sum, r) => {
      const cash = perPeriodCash(r);
      if (r.frequency === "yearly") return sum + cash / 12;
      if (r.frequency === "biweekly") return sum + cash * 2;
      if (r.frequency === "weekly") return sum + cash * 4;
      return sum + cash;
    }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3" style={{ flexWrap: "wrap" }}>
        <div className="muted text-body">
          {rules.filter((r) => r.isActive).length} 個進行中 · 每月約投入 <span className="num" style={{ color: "var(--ns-fg)" }}>NT${formatNumber(Math.round(monthlyTotal))}</span>
        </div>
        <Button onClick={openCreate}><Plus size={14} weight="bold" />新增定期定額</Button>
      </div>

      {investmentAccounts.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="font-semibold mb-1.5">還沒有投資帳戶</div>
          <div className="muted text-body">請先在「帳戶」新增券商（投資）帳戶，才能設定定期定額並扣交割款。</div>
        </Card>
      ) : rules.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="font-semibold mb-1.5">還沒有定期定額計畫</div>
          <div className="muted text-body mb-4">設定定期定額或定期定股，到期時會在總覽與投資頁提醒你補交割款。</div>
          <Button onClick={openCreate}><Plus size={14} weight="bold" />建立第一個計畫</Button>
        </Card>
      ) : (
        <Card className="p-0">
          {rules.map((rule, i) => {
            const due = rule.isActive && rule.nextRunDate <= today;
            return (
              <div key={rule.id} className="flex items-center gap-3.5" style={{ padding: "14px 18px", borderTop: i ? "1px solid var(--ns-border)" : "none", opacity: rule.isActive ? 1 : 0.55 }}>
                <div className="text-caption flex items-center shrink-0 font-semibold" style={{ width: 38, height: 38, borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)", justifyContent: "center" }}>
                  {rule.ticker.replace(/\..*$/, "").slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{rule.name || rule.ticker}</span>
                    <Badge variant="outline" className="rounded-full text-micro" style={{ padding: "2px 7px" }}>{recurringInvestmentModeLabels[rule.mode]}</Badge>
                    {due ? <Badge variant="outline" className="rounded-full text-micro" style={{ padding: "2px 7px", color: "var(--ns-warn)", borderColor: "var(--ns-warn)" }}>待投入</Badge> : null}
                  </div>
                  <div className="muted text-xs flex items-center gap-1.5" style={{ marginTop: 2 }}>
                    <CalendarBlank size={14} /> {freqLabel(rule)} · {accountName(rule.accountId)} · 下次 {rule.nextRunDate.slice(5)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-sm font-medium">
                    {rule.mode === "fixedShares" ? `${formatQuantity(rule.quantity)} 股` : `NT$${formatNumber(rule.amount)}`}
                  </div>
                  <div className="muted mono text-caption">交割約 NT${formatNumber(Math.round(perPeriodCash(rule)))}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" title="記錄本期投入" onClick={() => post(rule)} disabled={postRule.isPending}><Check size={14} /></Button>
                  <Button variant="ghost" size="icon-sm" title="編輯" onClick={() => openEdit(rule)}><PencilSimple size={14} /></Button>
                  <Button variant="destructive-outline" size="icon-sm" title="刪除" onClick={() => remove(rule.id)}><Trash size={14} /></Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {sheetOpen ? (
        <RecurringInvestmentSheet
          draft={draft}
          setDraft={setDraft}
          editing={Boolean(editingId)}
          accounts={investmentAccounts}
          pending={createRule.isPending || updateRule.isPending}
          onSubmit={submit}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function RecurringInvestmentSheet({
  draft, setDraft, editing, accounts, pending, onSubmit, onClose,
}: {
  draft: RecurringInvestmentDraft;
  setDraft: (d: RecurringInvestmentDraft) => void;
  editing: boolean;
  accounts: { id: string; name: string; currency: string }[];
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const cash = perPeriodCash(draft);
  return (
    <ModalShell
      variant="drawer"
      title={editing ? "編輯定期定額" : "新增定期定額"}
      onClose={onClose}
      style={{ zIndex: 50 }}
      panelClassName="flex flex-col"
      panelStyle={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(480px, 100%)", background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)", boxShadow: "var(--ns-shadow-2)" }}
    >
      {(dismiss) => (<>
        <div className="flex items-center justify-between" style={{ padding: "18px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          <h2 className="text-lg m-0 font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>{editing ? "編輯定期定額" : "新增定期定額"}</h2>
          <ModalCloseButton onClick={dismiss} />
        </div>

        <div className="flex flex-1 flex-col gap-4" style={{ overflow: "auto", padding: 22 }}>
          <Field label="標的代號 *">
            <TickerSearchField
              value={draft.ticker}
              onChange={(v) => setDraft({ ...draft, ticker: v })}
              onSelect={(r) => setDraft({ ...draft, ticker: r.symbol, name: r.name || draft.name, currency: r.currency || draft.currency })}
            />
          </Field>
          <Field label="名稱">
            <input className="ns-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="元大台灣50" />
          </Field>

          <Field label="模式">
            <div className="flex gap-2">
              {(["fixedAmount", "fixedShares"] as RecurringInvestmentMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setDraft({ ...draft, mode: m })}
                  className="text-body flex-1 py-2 px-0"
                  style={{
                    borderRadius: 8, cursor: "pointer", border: "1px solid",
                    background: draft.mode === m ? "var(--ns-accent-soft)" : "transparent",
                    borderColor: draft.mode === m ? "var(--ns-accent)" : "var(--ns-border)",
                    color: draft.mode === m ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                  }}
                >
                  {recurringInvestmentModeLabels[m]}
                </button>
              ))}
            </div>
          </Field>

          <div className="gap-3.5" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {draft.mode === "fixedAmount" ? (
              <Field label={`每期金額（${draft.currency}）*`}>
                <input className="ns-input" type="number" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} placeholder="10000" />
              </Field>
            ) : (
              <Field label="每期股數 *">
                <input className="ns-input" type="number" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} placeholder="50" />
              </Field>
            )}
            <Field label="參考價格">
              <input className="ns-input" type="number" value={draft.price || ""} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })} placeholder="100" />
            </Field>
          </div>

          <div className="gap-3.5" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <Field label="手續費">
              <input className="ns-input" type="number" value={draft.fee || ""} onChange={(e) => setDraft({ ...draft, fee: Number(e.target.value) || 0 })} placeholder="0" />
            </Field>
            <Field label="投資帳戶（扣交割款）*">
              <AppSelect
                value={draft.accountId || "all"}
                onChange={(id) => {
                  const a = accounts.find((x) => x.id === id);
                  setDraft({ ...draft, accountId: id === "all" ? "" : id, currency: a?.currency ?? draft.currency });
                }}
                options={[{ value: "all", label: "選擇帳戶" }, ...accounts.map((account) => ({ value: account.id, label: account.name, description: account.currency }))]}
                placeholder="選擇帳戶"
                style={{ width: "100%", height: 40 }}
              />
            </Field>
          </div>

          <div className="gap-3.5" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <Field label="頻率">
              <AppSelect
                value={draft.frequency}
                onChange={(frequency) => setDraft({ ...draft, frequency: frequency as RecurringFrequency })}
                options={(Object.keys(recurringFrequencyLabels) as RecurringFrequency[]).map((f) => ({ value: f, label: recurringFrequencyLabels[f] }))}
                style={{ width: "100%", height: 40 }}
              />
            </Field>
            <Field label="每月日期">
              <input className="ns-input" type="number" min={1} max={31} value={draft.dayOfMonth} onChange={(e) => setDraft({ ...draft, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
            </Field>
          </div>

          <Field label="下次執行日">
            <input className="ns-input" type="date" value={draft.nextRunDate} onChange={(e) => setDraft({ ...draft, nextRunDate: e.target.value })} />
          </Field>

          <label className="text-body flex items-center gap-2" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            啟用（顯示提醒）
          </label>

          <Card className="text-xs flex items-center gap-2 py-2.5 px-3.5" style={{ flexDirection: "row", color: "var(--ns-fg-muted)" }}>
            <ArrowsClockwise size={14} /> 每期預估交割款約 <span className="num" style={{ color: "var(--ns-fg)" }}>NT${formatNumber(Math.round(cash))}</span>，記錄時會自動扣款。
          </Card>
        </div>

        <div className="flex gap-2" style={{ padding: "14px 22px", borderTop: "1px solid var(--ns-border)" }}>
          <Button variant="ghost" style={{ flex: "0 0 90px", justifyContent: "center" }} onClick={dismiss}>取消</Button>
          <Button className="flex-1" style={{ justifyContent: "center" }} onClick={onSubmit} disabled={pending}>{pending ? "儲存中…" : editing ? "儲存變更" : "建立"}</Button>
        </div>
      </>)}
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs ns-field-label block">{label}</label>
      {children}
    </div>
  );
}
