import { CheckCircle, Target, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ActionButton } from "../../components/ActionButton";
import { Card } from "../../components/Card";
import { Field, TextInput } from "../../components/Field";
import { StatusText } from "../../components/StatusText";
import { useFinanceData, useRepositoryMutation } from "../../data/hooks";
import type { FinancialGoalDraft } from "../../data/repositories";
import { resolveTargetAmount } from "../../domain";

const today = () => new Date().toISOString().slice(0, 10);

function emptyDraft(currency: string): FinancialGoalDraft {
  return {
    kind: "fire",
    name: "FIRE 目標",
    currency,
    annualSpending: 600_000,
    withdrawalRate: 0.04,
    expectedAnnualReturn: 0.07,
    monthlyContribution: 30_000,
    targetAmount: null,
    startDate: today(),
  };
}

export function FireGoalEditor() {
  const { financialGoals, settings } = useFinanceData();
  const goal = (financialGoals.data ?? []).find((row) => row.kind === "fire") ?? null;
  const primaryCurrency = settings.data?.primaryCurrency ?? "TWD";

  const [draft, setDraft] = useState<FinancialGoalDraft>(() => emptyDraft(primaryCurrency));
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | null>(null);
  const [useCustomTarget, setUseCustomTarget] = useState(false);

  const upsertGoal = useRepositoryMutation(
    (repository, input: FinancialGoalDraft & { id?: string }) => repository.upsertFinancialGoal(input).then(() => undefined),
    ["financialGoals"],
  );
  const deleteGoal = useRepositoryMutation(
    (repository, id: string) => repository.deleteFinancialGoal(id),
    ["financialGoals"],
  );

  // Seed the form once data finishes loading. We only re-seed when the goal id
  // changes — re-running on every settings refetch would clobber unsaved edits.
  useEffect(() => {
    if (goal) {
      setDraft({
        kind: goal.kind,
        name: goal.name,
        currency: goal.currency,
        annualSpending: goal.annualSpending,
        withdrawalRate: goal.withdrawalRate,
        expectedAnnualReturn: goal.expectedAnnualReturn,
        monthlyContribution: goal.monthlyContribution,
        targetAmount: goal.targetAmount,
        startDate: goal.startDate,
      });
      setUseCustomTarget(Boolean(goal.targetAmount && goal.targetAmount > 0));
    } else {
      setDraft(emptyDraft(primaryCurrency));
      setUseCustomTarget(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id, primaryCurrency]);

  const derivedTarget = resolveTargetAmount({
    targetAmount: useCustomTarget ? draft.targetAmount : null,
    annualSpending: draft.annualSpending,
    withdrawalRate: draft.withdrawalRate,
  });

  async function save() {
    setMessage("");
    setTone(null);
    try {
      await upsertGoal.mutateAsync({
        ...draft,
        targetAmount: useCustomTarget ? draft.targetAmount : null,
        id: goal?.id,
      });
      setMessage("已儲存目標。");
      setTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "目標儲存失敗。");
      setTone("error");
    }
  }

  async function remove() {
    if (!goal) return;
    if (!window.confirm("確定要刪除此 FIRE 目標嗎？")) return;
    try {
      await deleteGoal.mutateAsync(goal.id);
      setMessage("目標已移除。");
      setTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刪除失敗。");
      setTone("error");
    }
  }

  return (
    <Card
      title="FIRE 目標"
      action={
        goal ? (
          <ActionButton variant="danger" onClick={remove} disabled={deleteGoal.isPending}>
            <Trash size={16} />刪除
          </ActionButton>
        ) : null
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-md p-3 text-sm" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
        <Target size={20} weight="duotone" />
        <span>
          參考《持續買進》/ Trinity 研究：目標金額 ≈ 年支出 × (1 / 提領率)。提領率 4% 意味著「25 倍法則」。
        </span>
      </div>

      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="目標名稱">
            <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="幣別">
            <TextInput
              value={draft.currency}
              onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="年支出">
            <TextInput
              type="number"
              value={draft.annualSpending}
              onChange={(event) => setDraft({ ...draft, annualSpending: Number(event.target.value) })}
            />
          </Field>
          <Field label="提領率 (例如 0.04 = 4%)">
            <TextInput
              type="number"
              step="0.001"
              value={draft.withdrawalRate}
              onChange={(event) => setDraft({ ...draft, withdrawalRate: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="月貢獻">
            <TextInput
              type="number"
              value={draft.monthlyContribution}
              onChange={(event) => setDraft({ ...draft, monthlyContribution: Number(event.target.value) })}
            />
          </Field>
          <Field label="預期年化報酬 (例如 0.07 = 7%)">
            <TextInput
              type="number"
              step="0.001"
              value={draft.expectedAnnualReturn}
              onChange={(event) => setDraft({ ...draft, expectedAnnualReturn: Number(event.target.value) })}
            />
          </Field>
        </div>

        <Field label="開始日期">
          <TextInput
            type="date"
            value={draft.startDate}
            onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
          />
        </Field>

        <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCustomTarget}
              onChange={(event) => setUseCustomTarget(event.target.checked)}
            />
            <span>自訂目標金額（覆蓋 25× 試算）</span>
          </label>
          {useCustomTarget ? (
            <div className="mt-3">
              <Field label="目標金額">
                <TextInput
                  type="number"
                  value={draft.targetAmount ?? 0}
                  onChange={(event) => setDraft({ ...draft, targetAmount: Number(event.target.value) })}
                />
              </Field>
            </div>
          ) : (
            <p className="mt-2 text-xs" style={{ color: "var(--ns-muted)" }}>
              現在自動換算為 {derivedTarget.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} {draft.currency}。
            </p>
          )}
        </div>

        {message ? (
          <div
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              background: tone === "error" ? "var(--ns-danger-soft, #fdecea)" : "var(--ns-accent-soft)",
              borderColor: tone === "error" ? "var(--ns-danger, #c0392b)" : "var(--ns-accent)",
              color: tone === "error" ? "var(--ns-danger, #c0392b)" : "var(--ns-accent)",
            }}
          >
            {message}
          </div>
        ) : null}

        <div>
          <ActionButton onClick={save} disabled={upsertGoal.isPending}>
            <CheckCircle size={16} />{upsertGoal.isPending ? "儲存中…" : goal ? "更新 FIRE 目標" : "建立 FIRE 目標"}
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}
