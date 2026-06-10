import { X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/coss/button";
import { Field, SelectInput, TextInput } from "../../components/Field";
import { NumberField } from "../../components/NumberField";
import { useToast } from "../../components/Toast";
import { useRepositoryMutation } from "../../data/hooks";
import type { FinancialGoalDraft } from "../../data/repositories";
import { formatNumber, type Account, type FinancialGoal } from "../../domain";

// Liability accounts can't feed a savings goal — binding a credit card or a
// loan would subtract from (or nonsensically add to) the goal's pool.
const BINDABLE_TYPES = new Set(["depository", "cash", "investment", "alternative", "other"]);

/**
 * Create/edit sheet for custom goals (旅遊、買車…). FIRE goals keep their own
 * editor (the FIRE calculator) — this sheet is only ever handed `kind:
 * "custom"` goals or `null` (create mode).
 *
 * Progress source: the user binds one or more asset accounts; the goal's
 * "saved so far" is the sum of those balances (see computeLinkedAccountsValue).
 */
export function GoalEditorSheet({
  goal,
  accounts,
  primaryCurrency,
  onClose,
}: {
  /** null = create a new custom goal */
  goal: FinancialGoal | null;
  accounts: Account[];
  primaryCurrency: string;
  onClose: () => void;
}) {
  const toast = useToast();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(primaryCurrency);
  const [targetAmount, setTargetAmount] = useState(0);
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  const [expectedReturnPct, setExpectedReturnPct] = useState(0);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setName(goal?.name ?? "");
    setCurrency((goal?.currency ?? primaryCurrency).toUpperCase());
    setTargetAmount(goal?.targetAmount ?? 0);
    setMonthlyContribution(goal?.monthlyContribution ?? 0);
    const raw = goal?.expectedAnnualReturn ?? 0;
    setExpectedReturnPct(raw > 1 ? raw : raw * 100);
    setLinkedIds(new Set(Object.keys(goal?.accountShareMap ?? {}).filter((id) => (goal?.accountShareMap[id] ?? 0) > 0)));
  }, [goal, primaryCurrency]);

  const bindableAccounts = useMemo(
    () => accounts.filter((a) => a.deletedAt === null && BINDABLE_TYPES.has(a.type)),
    [accounts],
  );

  const currencyOptions = useMemo(() => {
    const set = new Set<string>(["TWD", "USD", "JPY", "EUR", primaryCurrency.toUpperCase()]);
    for (const account of accounts) set.add(account.currency.toUpperCase());
    if (goal) set.add(goal.currency.toUpperCase());
    return Array.from(set).sort();
  }, [accounts, goal, primaryCurrency]);

  const save = useRepositoryMutation(
    (repo, input: FinancialGoalDraft & { id?: string }) => repo.upsertFinancialGoal(input).then(() => {}),
    ["financialGoals"],
  );

  function toggleAccount(id: string) {
    setLinkedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("請輸入目標名稱"); return; }
    if (!(targetAmount > 0)) { toast.error("請輸入目標金額"); return; }
    const accountShareMap: Record<string, number> = {};
    for (const id of linkedIds) accountShareMap[id] = 1;
    try {
      await save.mutateAsync({
        id: goal?.id,
        kind: "custom",
        name: name.trim(),
        currency,
        annualSpending: goal?.annualSpending ?? 0,
        withdrawalRate: goal?.withdrawalRate ?? 0.04,
        expectedAnnualReturn: (Number.isFinite(expectedReturnPct) ? expectedReturnPct : 0) / 100,
        monthlyContribution: Math.max(0, monthlyContribution),
        targetAmount,
        startDate: goal?.startDate ?? new Date().toISOString().slice(0, 10),
        accountShareMap,
        // Pass through the retirement-projection fields untouched — they are
        // FIRE-only, but goalFieldsFromDraft rewrites every column on upsert.
        currentAge: goal?.currentAge ?? null,
        retirementAge: goal?.retirementAge ?? null,
        planThroughAge: goal?.planThroughAge ?? null,
        preRetirementReturn: goal?.preRetirementReturn ?? null,
        postRetirementReturn: goal?.postRetirementReturn ?? null,
        inflationRate: goal?.inflationRate ?? null,
        annualFee: goal?.annualFee ?? null,
        contributionGrowthRate: goal?.contributionGrowthRate ?? null,
        spendingItems: goal?.spendingItems ?? [],
        incomeItems: goal?.incomeItems ?? [],
        displayMode: goal?.displayMode ?? "today",
      });
      toast.success(goal ? "已更新目標" : "已建立目標");
      onClose();
    } catch {
      toast.error("儲存目標失敗");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border shadow-xl"
        style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
          <h2 className="text-lg font-semibold">{goal ? "編輯目標" : "新目標"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-4" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="目標名稱">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：日本旅遊、買車頭期款" />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <Field label="幣別">
              <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}
              </SelectInput>
            </Field>
            <Field label="目標金額">
              <NumberField value={targetAmount} onChange={setTargetAmount} aria-label="目標金額" />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="每月投入（選填）">
              <NumberField value={monthlyContribution} onChange={setMonthlyContribution} aria-label="每月投入" />
            </Field>
            <Field label="預期年報酬率 %（選填）">
              <NumberField value={expectedReturnPct} onChange={setExpectedReturnPct} decimals={1} aria-label="預期年報酬率" />
            </Field>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>綁定帳戶</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>
              目標進度 = 綁定帳戶的餘額加總（依匯率換算成目標幣別）。建議為目標開一個專屬帳戶。
            </div>
            {bindableAccounts.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5, padding: "10px 12px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)" }}>
                還沒有可綁定的帳戶。先到「帳戶」頁建立一個儲蓄帳戶。
              </div>
            ) : (
              <div style={{ border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-sm)", overflow: "hidden" }}>
                {bindableAccounts.map((account, index) => {
                  const checked = linkedIds.has(account.id);
                  return (
                    <label
                      key={account.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer",
                        borderBottom: index < bindableAccounts.length - 1 ? "1px solid var(--ns-border)" : "none",
                        background: checked ? "var(--ns-accent-soft)" : "transparent",
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleAccount(account.id)} style={{ accentColor: "var(--ns-accent)" }} />
                      <span style={{ flex: 1, fontSize: 13.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {account.name}
                      </span>
                      <span className="num muted" style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                        {account.currency} {formatNumber(account.balance)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "儲存中…" : goal ? "儲存變更" : "建立目標"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
