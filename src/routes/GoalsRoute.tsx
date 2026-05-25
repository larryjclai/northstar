import { CheckCircle, Confetti, Flag, Info, Pencil, Plus, Target, Trash, Warning, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Field, TextInput } from "../components/Field";
import { SegmentedControl } from "../components/SegmentedControl";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { FinancialGoalDraft } from "../data/repositories";
import {
  PROJECTION_DEFAULTS,
  formatMoney,
  formatNumber,
  projectRetirement,
  type FinancialGoal,
  type GoalDisplayMode,
  type ProjectionYear,
  type SpendingItem,
} from "../domain";
import { computeNetWorthInCurrency } from "../features/goals/netWorth";

export function GoalsRoute() {
  const { financialGoals, accounts, assets, quotes, settings, dailyFxRates } = useFinanceData();
  const toast = useToast();

  const goal = (financialGoals.data ?? []).find((row) => row.kind === "fire") ?? null;
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];

  // Net worth contribution (cash + holdings, FX'd into the goal's currency).
  // Recomputes whenever any underlying balance changes.
  const currentValue = useMemo(
    () => goal ? computeNetWorthInCurrency(goal.currency, accountRows, assetRows, quoteRows, appSettings, fxHistory) : 0,
    [goal, accountRows, assetRows, quoteRows, appSettings, fxHistory],
  );

  const projection = useMemo(
    () => goal ? projectRetirement({ goal, currentValue }) : null,
    [goal, currentValue],
  );

  const upsertGoal = useRepositoryMutation(
    (repository, input: FinancialGoalDraft & { id?: string }) =>
      repository.upsertFinancialGoal(input).then(() => undefined),
    ["financialGoals"],
  );
  const deleteGoal = useRepositoryMutation(
    (repository, id: string) => repository.deleteFinancialGoal(id),
    ["financialGoals"],
  );

  async function saveGoal(patch: Partial<FinancialGoalDraft>, successMessage?: string) {
    if (!goal) return;
    try {
      await upsertGoal.mutateAsync({ ...goalToDraft(goal), ...patch, id: goal.id });
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error("更新失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
      });
    }
  }

  async function createDefaultGoal() {
    const draft: FinancialGoalDraft = {
      kind: "fire",
      name: "FIRE 目標",
      currency: appSettings?.primaryCurrency ?? "TWD",
      annualSpending: 600_000,
      withdrawalRate: PROJECTION_DEFAULTS.withdrawalRate,
      expectedAnnualReturn: PROJECTION_DEFAULTS.preRetirementReturn,
      monthlyContribution: 30_000,
      targetAmount: null,
      startDate: new Date().toISOString().slice(0, 10),
      currentAge: PROJECTION_DEFAULTS.currentAge,
      retirementAge: PROJECTION_DEFAULTS.retirementAge,
      planThroughAge: PROJECTION_DEFAULTS.planThroughAge,
      preRetirementReturn: PROJECTION_DEFAULTS.preRetirementReturn,
      postRetirementReturn: PROJECTION_DEFAULTS.postRetirementReturn,
      inflationRate: PROJECTION_DEFAULTS.inflationRate,
      annualFee: PROJECTION_DEFAULTS.annualFee,
      contributionGrowthRate: PROJECTION_DEFAULTS.contributionGrowthRate,
      spendingItems: [
        { id: "seed-living", name: "Living", monthlyAmount: 30_000, mustHave: true },
        { id: "seed-healthcare", name: "Healthcare", monthlyAmount: 3_000, mustHave: true },
      ],
      incomeItems: [],
      displayMode: "today",
      accountShareMap: {},
    };
    try {
      await upsertGoal.mutateAsync(draft);
      toast.success("已建立 FIRE 計畫", { description: "可在右側面板調整年齡、報酬率與支出。" });
    } catch (error) {
      toast.error("建立失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
      });
    }
  }

  async function removeGoal() {
    if (!goal) return;
    if (!window.confirm("確定要刪除 FIRE 目標嗎？")) return;
    try {
      await deleteGoal.mutateAsync(goal.id);
      toast.success("目標已移除");
    } catch (error) {
      toast.error("刪除失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
      });
    }
  }

  if (!goal || !projection) {
    return (
      <div className="mx-auto max-w-6xl p-5 lg:p-8">
        <PageHeader title="目標" description="設定退休 / FIRE 計畫，看到達成目標的年齡、所需金額與每月需要的貢獻。" />
        <Card>
          <EmptyState
            icon={<Target size={28} weight="duotone" />}
            title="尚未建立目標"
            description="按下「建立 FIRE 計畫」，northstar 會用合理的預設值（30 歲 → 50 歲退休、活到 90 歲、年支出 60 萬）開始模擬。建立後可隨時調整。"
            action={
              <ActionButton onClick={createDefaultGoal} disabled={upsertGoal.isPending}>
                <Flag size={16} weight="fill" />建立 FIRE 計畫
              </ActionButton>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-5 lg:p-8">
      <PageHeader
        title={goal.name}
        description="退休 / FIRE 計畫 — 你的生活、何時離開職場、能撐多久。"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="grid gap-4">
          <HeroCard goal={goal} projection={projection} currentValue={currentValue} onSave={saveGoal} />
          <ProjectionChartCard projection={projection} goal={goal} />
          <FireLevelsCard projection={projection} goal={goal} currentValue={currentValue} />
          <YearTableCard projection={projection} goal={goal} />
          <DisclaimerCard />
        </div>

        <div className="grid content-start gap-4">
          <PlanInputsCard goal={goal} onSave={saveGoal} onDelete={removeGoal} busy={upsertGoal.isPending || deleteGoal.isPending} />
          <SpendingCard goal={goal} onSave={saveGoal} />
          <IncomeCard />
          <AssumptionsCard goal={goal} projection={projection} onSave={saveGoal} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroCard({
  goal,
  projection,
  currentValue,
  onSave,
}: {
  goal: FinancialGoal;
  projection: ReturnType<typeof projectRetirement>;
  currentValue: number;
  onSave: (patch: Partial<FinancialGoalDraft>, successMessage?: string) => void;
}) {
  const target = projection.targetAtRetirement;
  const progressPct = target > 0 ? Math.min(100, Math.max(0, (currentValue / target) * 100)) : 0;
  const reachedFi = currentValue >= target;
  const retirementAge = goal.retirementAge ?? PROJECTION_DEFAULTS.retirementAge;
  const fiOffset = projection.fiAge !== null ? retirementAge - projection.fiAge : null;
  const fiCopy = projection.fiAge !== null
    ? `你會在 ${projection.fiAge} 歲達成 FIRE${fiOffset !== null
        ? fiOffset > 0
          ? ` — 比目標早 ${fiOffset} 年`
          : fiOffset < 0
            ? ` — 比目標晚 ${Math.abs(fiOffset)} 年`
            : ` — 剛好踩在目標年齡`
        : ""}`
    : "目前路徑無法在退休前達成 FIRE";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold"
          style={{
            background: projection.onTrack ? "var(--ns-positive-soft, var(--ns-accent-soft))" : "var(--ns-danger-soft, #fdecea)",
            color: projection.onTrack ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)",
          }}
        >
          {projection.onTrack ? <CheckCircle size={12} weight="fill" /> : <Warning size={12} weight="fill" />}
          {projection.onTrack ? "On track" : "需要調整"}
        </span>
        <DisplayModeToggle goal={goal} onChange={(mode) => onSave({ displayMode: mode })} />
      </div>

      <h2 className="mt-3 text-2xl font-semibold leading-tight">
        {fiCopy}
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--ns-muted)" }}>
        每月 {formatMoney(goal.monthlyContribution, goal.currency)} 的貢獻可以支付到 {goal.planThroughAge ?? PROJECTION_DEFAULTS.planThroughAge} 歲、
        年支出 {formatMoney(projection.annualSpending, goal.currency)}。
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>目前淨值</div>
          <div className="mt-1 text-2xl font-semibold tabular">{formatMoney(currentValue, goal.currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>目標 @ 退休</div>
          <div className="mt-1 text-2xl font-semibold tabular">{formatMoney(target, goal.currency)}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${progressPct}%`,
              background: reachedFi
                ? "var(--ns-positive, var(--ns-accent))"
                : projection.onTrack
                  ? "var(--ns-accent)"
                  : "var(--ns-danger, #c0392b)",
            }}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: "var(--ns-muted)" }}>
          <span>{progressPct.toFixed(1)}% 完成度</span>
          <span>Coast FIRE: {formatMoney(projection.coastFireAmount, goal.currency)}</span>
        </div>
      </div>

      {reachedFi ? (
        <div
          className="mt-4 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
          style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}
        >
          <Confetti size={18} weight="fill" />已達成 FIRE 目標
        </div>
      ) : null}
    </Card>
  );
}

function DisplayModeToggle({ goal, onChange }: { goal: FinancialGoal; onChange: (mode: GoalDisplayMode) => void }) {
  return (
    <SegmentedControl
      value={goal.displayMode}
      onChange={(value) => onChange(value as GoalDisplayMode)}
      options={[
        { value: "today", label: "今日購買力", icon: null },
        { value: "nominal", label: "名目金額", icon: null },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Projection chart
// ---------------------------------------------------------------------------

function ProjectionChartCard({
  projection,
  goal,
}: {
  projection: ReturnType<typeof projectRetirement>;
  goal: FinancialGoal;
}) {
  const data = projection.series.map((row) => ({
    age: row.age,
    portfolio: row.endBalance,
    phase: row.phase,
  }));
  return (
    <Card title="Portfolio trajectory">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="portfolioTrajectory" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" />
            <XAxis dataKey="age" stroke="var(--ns-muted)" />
            <YAxis stroke="var(--ns-muted)" tickFormatter={(value) => formatNumber(Number(value))} width={80} />
            <Tooltip
              formatter={(value) => formatMoney(Number(value), goal.currency)}
              labelFormatter={(label) => `${label} 歲`}
              contentStyle={{ background: "var(--ns-surface)", border: "1px solid var(--ns-border)", borderRadius: 6 }}
            />
            <Area type="monotone" dataKey="portfolio" stroke="var(--ns-accent)" fill="url(#portfolioTrajectory)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Coast / Lean / FI / Fat
// ---------------------------------------------------------------------------

function FireLevelsCard({
  projection,
  goal,
  currentValue,
}: {
  projection: ReturnType<typeof projectRetirement>;
  goal: FinancialGoal;
  currentValue: number;
}) {
  const levels: { label: string; amount: number; tagline: string }[] = [
    { label: "Coast FIRE", amount: projection.coastFireAmount, tagline: "停止貢獻仍會自然成長到目標" },
    { label: "Lean FIRE", amount: projection.leanFireAmount, tagline: "70% 規劃支出，精簡退休" },
    { label: "FI", amount: projection.targetAtRetirement, tagline: "完整規劃支出（25× 法則）" },
    { label: "Fat FIRE", amount: projection.fatFireAmount, tagline: "150% 規劃支出，寬裕退休" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {levels.map((level) => {
        const achieved = currentValue >= level.amount;
        return (
          <Card key={level.label}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
                {level.label}
              </span>
              {achieved ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: "var(--ns-positive-soft, var(--ns-accent-soft))", color: "var(--ns-positive, var(--ns-accent))" }}
                >
                  Done
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-xl font-semibold tabular">{formatMoney(level.amount, goal.currency)}</div>
            <div className="mt-1 text-xs leading-5" style={{ color: "var(--ns-muted)" }}>{level.tagline}</div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year-by-year table
// ---------------------------------------------------------------------------

function YearTableCard({
  projection,
  goal,
}: {
  projection: ReturnType<typeof projectRetirement>;
  goal: FinancialGoal;
}) {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(projection.series.length / pageSize));
  // Clamp the page if a parameter change shrinks the series.
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [pages, page]);

  const visible = projection.series.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <Card
      title="年度試算表"
      action={
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ns-muted)" }}>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border px-2 py-1 disabled:opacity-40" style={{ borderColor: "var(--ns-border)" }}>‹</button>
          <span>{page + 1} / {pages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="rounded-md border px-2 py-1 disabled:opacity-40" style={{ borderColor: "var(--ns-border)" }}>›</button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
              <th className="py-2">年齡</th>
              <th className="py-2">年份</th>
              <th className="py-2">階段</th>
              <th className="py-2 text-right">年底淨值</th>
              <th className="py-2 text-right">當年貢獻</th>
              <th className="py-2 text-right">退休收入</th>
              <th className="py-2 text-right">規劃支出</th>
              <th className="py-2 text-right">提領</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => <YearRow key={row.age} row={row} currency={goal.currency} />)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function YearRow({ row, currency }: { row: ProjectionYear; currency: string }) {
  const phaseLabel = row.phase === "accumulation" ? "累積" : "退休";
  const phaseColor = row.phase === "accumulation" ? "var(--ns-accent)" : "var(--ns-warning, #d97706)";
  return (
    <tr className="border-t" style={{ borderColor: "var(--ns-border)" }}>
      <td className="py-2 font-semibold">{row.age}</td>
      <td className="py-2">{row.year}</td>
      <td className="py-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--ns-surface-strong)", color: phaseColor }}
        >
          {phaseLabel}
        </span>
      </td>
      <td className="py-2 text-right tabular">{formatMoney(row.endBalance, currency)}</td>
      <td className="py-2 text-right tabular">{row.contribution > 0 ? formatMoney(row.contribution, currency) : "—"}</td>
      <td className="py-2 text-right tabular">{row.retirementIncome > 0 ? formatMoney(row.retirementIncome, currency) : "—"}</td>
      <td className="py-2 text-right tabular">{row.plannedSpending > 0 ? formatMoney(row.plannedSpending, currency) : "—"}</td>
      <td className="py-2 text-right tabular">{row.portfolioWithdrawal > 0 ? formatMoney(row.portfolioWithdrawal, currency) : "—"}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Sidebar editors
// ---------------------------------------------------------------------------

function PlanInputsCard({
  goal,
  onSave,
  onDelete,
  busy,
}: {
  goal: FinancialGoal;
  onSave: (patch: Partial<FinancialGoalDraft>, successMessage?: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: goal.name,
    currentAge: goal.currentAge ?? PROJECTION_DEFAULTS.currentAge,
    retirementAge: goal.retirementAge ?? PROJECTION_DEFAULTS.retirementAge,
    planThroughAge: goal.planThroughAge ?? PROJECTION_DEFAULTS.planThroughAge,
    monthlyContribution: goal.monthlyContribution,
  });

  // Re-seed draft when the goal id swaps (e.g. delete + recreate) but not on
  // every revision tick, so an open edit form doesn't get clobbered.
  useEffect(() => {
    setDraft({
      name: goal.name,
      currentAge: goal.currentAge ?? PROJECTION_DEFAULTS.currentAge,
      retirementAge: goal.retirementAge ?? PROJECTION_DEFAULTS.retirementAge,
      planThroughAge: goal.planThroughAge ?? PROJECTION_DEFAULTS.planThroughAge,
      monthlyContribution: goal.monthlyContribution,
    });
  }, [goal.id]);

  async function save() {
    await onSave(
      {
        name: draft.name,
        currentAge: Number(draft.currentAge),
        retirementAge: Number(draft.retirementAge),
        planThroughAge: Number(draft.planThroughAge),
        monthlyContribution: Number(draft.monthlyContribution),
      },
      "計畫已更新",
    );
    setOpen(false);
  }

  return (
    <Card
      title="計畫"
      action={
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold" style={{ color: "var(--ns-accent)" }}>
          {open ? "收合" : <span className="inline-flex items-center gap-1"><Pencil size={12} />編輯</span>}
        </button>
      }
    >
      {open ? (
        <div className="grid gap-3">
          <Field label="計畫名稱">
            <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="目前年齡">
              <TextInput type="number" value={draft.currentAge} onChange={(event) => setDraft({ ...draft, currentAge: Number(event.target.value) })} />
            </Field>
            <Field label="預計退休">
              <TextInput type="number" value={draft.retirementAge} onChange={(event) => setDraft({ ...draft, retirementAge: Number(event.target.value) })} />
            </Field>
            <Field label="計畫到">
              <TextInput type="number" value={draft.planThroughAge} onChange={(event) => setDraft({ ...draft, planThroughAge: Number(event.target.value) })} />
            </Field>
          </div>
          <Field label="月貢獻">
            <TextInput type="number" value={draft.monthlyContribution} onChange={(event) => setDraft({ ...draft, monthlyContribution: Number(event.target.value) })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={save} disabled={busy}><CheckCircle size={14} />儲存</ActionButton>
            <ActionButton variant="secondary" onClick={() => setOpen(false)} disabled={busy}>取消</ActionButton>
            <ActionButton variant="danger" onClick={onDelete} disabled={busy}><Trash size={14} />刪除目標</ActionButton>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <PlanRow label="目前年齡" value={`${goal.currentAge ?? PROJECTION_DEFAULTS.currentAge} 歲`} />
          <PlanRow label="預計退休" value={`${goal.retirementAge ?? PROJECTION_DEFAULTS.retirementAge} 歲`} />
          <PlanRow label="計畫到" value={`${goal.planThroughAge ?? PROJECTION_DEFAULTS.planThroughAge} 歲`} />
          <PlanRow label="月貢獻" value={formatMoney(goal.monthlyContribution, goal.currency)} />
        </dl>
      )}
    </Card>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2" style={{ borderColor: "var(--ns-border)" }}>
      <dt className="text-[11px] uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>{label}</dt>
      <dd className="mt-0.5 font-semibold tabular">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spending items editor
// ---------------------------------------------------------------------------

function SpendingCard({
  goal,
  onSave,
}: {
  goal: FinancialGoal;
  onSave: (patch: Partial<FinancialGoalDraft>, successMessage?: string) => void;
}) {
  // Keep items local-stateful while editing so multi-row tweaks don't fire a
  // mutation on every keystroke; persist on blur or explicit "儲存".
  const [items, setItems] = useState<SpendingItem[]>(() => goal.spendingItems ?? []);
  useEffect(() => {
    setItems(goal.spendingItems ?? []);
  }, [goal.id, goal.revision]);

  const totalMonthly = items.reduce((sum, item) => sum + Math.max(0, item.monthlyAmount), 0);

  function update(index: number, patch: Partial<SpendingItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function add() {
    setItems((current) => [...current, { id: `s_${Date.now()}_${current.length}`, name: "新增項目", monthlyAmount: 0, mustHave: true }]);
  }

  function remove(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function commit() {
    onSave({ spendingItems: items, annualSpending: totalMonthly * 12 }, "支出計畫已更新");
  }

  return (
    <Card
      title="退休支出"
      action={
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--ns-accent)" }}>
          <Plus size={12} />新增
        </button>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ns-muted)" }}>
          尚未設定任何支出項目，先用「年支出」估算：{formatMoney(goal.annualSpending, goal.currency)} / 年。
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div key={item.id} className="rounded-md border p-2" style={{ borderColor: "var(--ns-border)" }}>
              <div className="flex gap-2">
                <TextInput
                  value={item.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder="項目名稱"
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="移除項目"
                  className="grid size-8 shrink-0 place-items-center rounded-md outline-none transition"
                  style={{ color: "var(--ns-muted)" }}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 text-xs" style={{ color: "var(--ns-muted)" }}>
                <Field label="月支出">
                  <TextInput
                    type="number"
                    value={item.monthlyAmount}
                    onChange={(event) => update(index, { monthlyAmount: Number(event.target.value) })}
                  />
                </Field>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide">必需</span>
                  <input
                    type="checkbox"
                    checked={item.mustHave}
                    onChange={(event) => update(index, { mustHave: event.target.checked })}
                    className="mt-2 size-4"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span style={{ color: "var(--ns-muted)" }}>合計</span>
        <span className="font-semibold tabular">{formatMoney(totalMonthly, goal.currency)} / 月</span>
      </div>
      <div className="mt-3">
        <ActionButton onClick={commit}><CheckCircle size={14} />儲存支出</ActionButton>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Retirement income (placeholder for v1.1)
// ---------------------------------------------------------------------------

function IncomeCard() {
  return (
    <Card title="退休收入">
      <div className="rounded-md border p-3 text-xs" style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)", background: "var(--ns-surface-strong)" }}>
        <div className="mb-1 inline-flex items-center gap-1 font-semibold" style={{ color: "var(--ns-fg)" }}>
          <Info size={12} />即將推出
        </div>
        勞保、國民年金、雇主退休金等收入會在後續版本加入這裡，並自動扣減從投資組合提領的金額。
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

function AssumptionsCard({
  goal,
  projection,
  onSave,
}: {
  goal: FinancialGoal;
  projection: ReturnType<typeof projectRetirement>;
  onSave: (patch: Partial<FinancialGoalDraft>, successMessage?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    preRetirementReturn: goal.preRetirementReturn ?? PROJECTION_DEFAULTS.preRetirementReturn,
    postRetirementReturn: goal.postRetirementReturn ?? PROJECTION_DEFAULTS.postRetirementReturn,
    annualFee: goal.annualFee ?? PROJECTION_DEFAULTS.annualFee,
    inflationRate: goal.inflationRate ?? PROJECTION_DEFAULTS.inflationRate,
    contributionGrowthRate: goal.contributionGrowthRate ?? PROJECTION_DEFAULTS.contributionGrowthRate,
    withdrawalRate: goal.withdrawalRate,
  });
  useEffect(() => {
    setDraft({
      preRetirementReturn: goal.preRetirementReturn ?? PROJECTION_DEFAULTS.preRetirementReturn,
      postRetirementReturn: goal.postRetirementReturn ?? PROJECTION_DEFAULTS.postRetirementReturn,
      annualFee: goal.annualFee ?? PROJECTION_DEFAULTS.annualFee,
      inflationRate: goal.inflationRate ?? PROJECTION_DEFAULTS.inflationRate,
      contributionGrowthRate: goal.contributionGrowthRate ?? PROJECTION_DEFAULTS.contributionGrowthRate,
      withdrawalRate: goal.withdrawalRate,
    });
  }, [goal.id, goal.revision]);

  async function save() {
    await onSave({
      preRetirementReturn: Number(draft.preRetirementReturn),
      postRetirementReturn: Number(draft.postRetirementReturn),
      annualFee: Number(draft.annualFee),
      inflationRate: Number(draft.inflationRate),
      contributionGrowthRate: Number(draft.contributionGrowthRate),
      withdrawalRate: Number(draft.withdrawalRate),
    }, "假設已更新");
    setOpen(false);
  }

  return (
    <Card
      title="假設"
      action={
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold" style={{ color: "var(--ns-accent)" }}>
          {open ? "收合" : <span className="inline-flex items-center gap-1"><Pencil size={12} />編輯</span>}
        </button>
      }
    >
      {open ? (
        <div className="grid gap-3">
          <Field label="退休前報酬率（年化）">
            <TextInput type="number" step="0.001" value={draft.preRetirementReturn} onChange={(event) => setDraft({ ...draft, preRetirementReturn: Number(event.target.value) })} />
          </Field>
          <Field label="退休後報酬率">
            <TextInput type="number" step="0.001" value={draft.postRetirementReturn} onChange={(event) => setDraft({ ...draft, postRetirementReturn: Number(event.target.value) })} />
          </Field>
          <Field label="年度手續費（含稅、ETF 內扣）">
            <TextInput type="number" step="0.001" value={draft.annualFee} onChange={(event) => setDraft({ ...draft, annualFee: Number(event.target.value) })} />
          </Field>
          <Field label="通膨率">
            <TextInput type="number" step="0.001" value={draft.inflationRate} onChange={(event) => setDraft({ ...draft, inflationRate: Number(event.target.value) })} />
          </Field>
          <Field label="月貢獻每年成長">
            <TextInput type="number" step="0.001" value={draft.contributionGrowthRate} onChange={(event) => setDraft({ ...draft, contributionGrowthRate: Number(event.target.value) })} />
          </Field>
          <Field label="提領率（25× 法則用）">
            <TextInput type="number" step="0.001" value={draft.withdrawalRate} onChange={(event) => setDraft({ ...draft, withdrawalRate: Number(event.target.value) })} />
          </Field>
          <ActionButton onClick={save}><CheckCircle size={14} />儲存假設</ActionButton>
        </div>
      ) : (
        <dl className="grid gap-2 text-sm">
          <AssumptionRow label="退休前報酬率" value={percent(goal.preRetirementReturn ?? PROJECTION_DEFAULTS.preRetirementReturn)} />
          <AssumptionRow label="退休後報酬率" value={percent(goal.postRetirementReturn ?? PROJECTION_DEFAULTS.postRetirementReturn)} />
          <AssumptionRow label="年度手續費" value={percent(goal.annualFee ?? PROJECTION_DEFAULTS.annualFee)} />
          <AssumptionRow label="實質退休前報酬" value={percent(projection.effectivePreReturn)} muted />
          <AssumptionRow label="實質退休後報酬" value={percent(projection.effectivePostReturn)} muted />
          <AssumptionRow label="通膨率" value={percent(goal.inflationRate ?? PROJECTION_DEFAULTS.inflationRate)} />
          <AssumptionRow label="月貢獻成長" value={percent(goal.contributionGrowthRate ?? PROJECTION_DEFAULTS.contributionGrowthRate)} />
          <AssumptionRow label="提領率" value={percent(goal.withdrawalRate)} />
        </dl>
      )}
    </Card>
  );
}

function AssumptionRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: muted ? "var(--ns-muted)" : "var(--ns-fg)" }}>{label}</span>
      <span className="font-semibold tabular" style={{ color: muted ? "var(--ns-muted)" : "var(--ns-fg)" }}>{value}</span>
    </div>
  );
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

function DisclaimerCard() {
  return (
    <Card>
      <div className="flex gap-3 text-xs leading-5" style={{ color: "var(--ns-muted)" }}>
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          這不是投資建議。把這些數字當作一張草稿，而不是預測。所有結果都由你輸入的假設算出 — 報酬率、通膨、貢獻、壽命 — 真實世界會偏離線性、稅制會改、政府政策會變。用這個畫面壓力測試想法、找出落差，重要決定請與合格的專業人士討論。
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a stored goal into a draft shape so a partial patch + spread keeps
 * every required field set. Strips the server-managed sync fields.
 */
function goalToDraft(goal: FinancialGoal): FinancialGoalDraft {
  return {
    kind: goal.kind,
    name: goal.name,
    currency: goal.currency,
    annualSpending: goal.annualSpending,
    withdrawalRate: goal.withdrawalRate,
    expectedAnnualReturn: goal.expectedAnnualReturn,
    monthlyContribution: goal.monthlyContribution,
    targetAmount: goal.targetAmount,
    startDate: goal.startDate,
    currentAge: goal.currentAge,
    retirementAge: goal.retirementAge,
    planThroughAge: goal.planThroughAge,
    preRetirementReturn: goal.preRetirementReturn,
    postRetirementReturn: goal.postRetirementReturn,
    inflationRate: goal.inflationRate,
    annualFee: goal.annualFee,
    contributionGrowthRate: goal.contributionGrowthRate,
    spendingItems: goal.spendingItems,
    incomeItems: goal.incomeItems,
    displayMode: goal.displayMode,
    accountShareMap: goal.accountShareMap,
  };
}
