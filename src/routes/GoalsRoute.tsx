import { CheckCircle, Confetti, Flag, Info, Pencil, Plus, Target, Trash, Warning, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
      <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Goals · FIRE</div>
            <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>FIRE 計算機</h1>
          </div>
        </div>
        <div className="ns-card" style={{ padding: 48, textAlign: "center" }}>
          <Target size={32} weight="duotone" style={{ color: "var(--ns-fg-muted)", marginBottom: 14 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>尚未建立目標</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 20, maxWidth: 480, margin: "0 auto 20px" }}>
            按下「建立 FIRE 計畫」，northstar 會用合理的預設值（30 歲 → 50 歲退休、活到 90 歲、年支出 60 萬）開始模擬。建立後可隨時調整。
          </div>
          <button className="ns-btn primary" onClick={createDefaultGoal} disabled={upsertGoal.isPending}>
            <Flag size={16} weight="fill" />建立 FIRE 計畫
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Goals · FIRE</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>{goal.name}</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <HeroCard goal={goal} projection={projection} currentValue={currentValue} onSave={saveGoal} />
          <ProjectionChartCard projection={projection} goal={goal} />
          <FireLevelsCard projection={projection} goal={goal} currentValue={currentValue} />
          <YearTableCard projection={projection} goal={goal} />
          <DisclaimerCard />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
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
    <div className="ns-card" style={{ padding: "var(--ns-pad-card)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            borderRadius: 99, padding: "4px 10px", fontSize: 12, fontWeight: 600,
            background: projection.onTrack ? "var(--ns-positive-soft, var(--ns-accent-soft))" : "var(--ns-danger-soft, rgba(239,68,68,0.12))",
            color: projection.onTrack ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, var(--ns-neg))",
          }}
        >
          {projection.onTrack ? <CheckCircle size={12} weight="fill" /> : <Warning size={12} weight="fill" />}
          {projection.onTrack ? "On track" : "需要調整"}
        </span>
        <DisplayModeToggle goal={goal} onChange={(mode) => onSave({ displayMode: mode })} />
      </div>

      <h2 style={{ marginTop: 12, fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>{fiCopy}</h2>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        每月 {formatMoney(goal.monthlyContribution, goal.currency)} 的貢獻可以支付到 {goal.planThroughAge ?? PROJECTION_DEFAULTS.planThroughAge} 歲、
        年支出 {formatMoney(projection.annualSpending, goal.currency)}。
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>目前淨值</div>
          <div className="ns-num-md">{formatMoney(currentValue, goal.currency)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>目標 @ 退休</div>
          <div className="ns-num-md">{formatMoney(target, goal.currency)}</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ height: 6, borderRadius: 99, overflow: "hidden", background: "var(--ns-bg-hover)" }}>
          <div
            style={{
              height: "100%", borderRadius: 99,
              width: `${progressPct}%`,
              background: reachedFi
                ? "var(--ns-pos)"
                : projection.onTrack
                  ? "var(--ns-accent)"
                  : "var(--ns-neg)",
              transition: "width 0.3s",
            }}
          />
        </div>
        <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span className="dim mono" style={{ fontSize: 11 }}>{progressPct.toFixed(1)}% 完成度</span>
          <span className="dim mono" style={{ fontSize: 11 }}>Coast FIRE: {formatMoney(projection.coastFireAmount, goal.currency)}</span>
        </div>
      </div>

      {reachedFi ? (
        <div
          style={{
            marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8,
            borderRadius: "var(--ns-r-md)", padding: "8px 14px", fontSize: 13, fontWeight: 600,
            background: "var(--ns-accent-soft)", color: "var(--ns-accent)",
          }}
        >
          <Confetti size={18} weight="fill" />已達成 FIRE 目標
        </div>
      ) : null}
    </div>
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
    <div className="ns-card" style={{ padding: "var(--ns-pad-card)" }}>
      <div className="ns-eyebrow" style={{ marginBottom: 14 }}>Portfolio trajectory</div>
      <div style={{ height: 288 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="portfolioTrajectory" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" />
            <XAxis dataKey="age" stroke="var(--ns-fg-dim)" tick={{ fontSize: 11, fontFamily: "var(--ns-font-mono)" }} />
            <YAxis stroke="var(--ns-fg-dim)" tick={{ fontSize: 11, fontFamily: "var(--ns-font-mono)" }} tickFormatter={(value) => formatNumber(Number(value))} width={80} />
            <Tooltip
              formatter={(value) => formatMoney(Number(value), goal.currency)}
              labelFormatter={(label) => `${label} 歲`}
              contentStyle={{ background: "var(--ns-bg-card)", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", fontSize: 12 }}
            />
            <Area type="monotone" dataKey="portfolio" stroke="var(--ns-accent)" fill="url(#portfolioTrajectory)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {levels.map((level) => {
        const achieved = currentValue >= level.amount;
        return (
          <div key={level.label} className="ns-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <span className="ns-eyebrow">{level.label}</span>
              {achieved ? (
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    background: "var(--ns-positive-soft, var(--ns-accent-soft))", color: "var(--ns-positive, var(--ns-accent))",
                  }}
                >
                  Done
                </span>
              ) : null}
            </div>
            <div className="num" style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{formatMoney(level.amount, goal.currency)}</div>
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{level.tagline}</div>
          </div>
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
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [pages, page]);

  const visible = projection.series.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="ns-card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>年度試算表</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dim mono" style={{ fontSize: 12 }}>{page + 1} / {pages}</span>
          <button
            type="button"
            className="ns-btn ghost"
            style={{ padding: "4px 10px" }}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >‹</button>
          <button
            type="button"
            className="ns-btn ghost"
            style={{ padding: "4px 10px" }}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
          >›</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 720, fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--ns-fg-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {["年齡", "年份", "階段", "年底淨值", "當年貢獻", "退休收入", "規劃支出", "提領"].map((h, i) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: i >= 3 ? "right" : "left", fontWeight: 500, borderBottom: "1px solid var(--ns-border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => <YearRow key={row.age} row={row} currency={goal.currency} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function YearRow({ row, currency }: { row: ProjectionYear; currency: string }) {
  const phaseLabel = row.phase === "accumulation" ? "累積" : "退休";
  const phaseColor = row.phase === "accumulation" ? "var(--ns-accent)" : "var(--ns-chart-2)";
  return (
    <tr style={{ borderTop: "1px solid var(--ns-border)" }}>
      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{row.age}</td>
      <td style={{ padding: "10px 14px" }}>{row.year}</td>
      <td style={{ padding: "10px 14px" }}>
        <span className="ns-pill" style={{ fontSize: 10, color: phaseColor }}>{phaseLabel}</span>
      </td>
      <td className="num" style={{ padding: "10px 14px", textAlign: "right" }}>{formatMoney(row.endBalance, currency)}</td>
      <td className="num" style={{ padding: "10px 14px", textAlign: "right" }}>{row.contribution > 0 ? formatMoney(row.contribution, currency) : "—"}</td>
      <td className="num" style={{ padding: "10px 14px", textAlign: "right" }}>{row.retirementIncome > 0 ? formatMoney(row.retirementIncome, currency) : "—"}</td>
      <td className="num" style={{ padding: "10px 14px", textAlign: "right" }}>{row.plannedSpending > 0 ? formatMoney(row.plannedSpending, currency) : "—"}</td>
      <td className="num" style={{ padding: "10px 14px", textAlign: "right" }}>{row.portfolioWithdrawal > 0 ? formatMoney(row.portfolioWithdrawal, currency) : "—"}</td>
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
    <div className="ns-card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>計畫</h3>
        <button
          type="button"
          className="ns-btn ghost"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "收合" : <><Pencil size={12} style={{ marginRight: 4 }} />編輯</>}
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="計畫名稱">
              <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="ns-btn primary" onClick={save} disabled={busy}><CheckCircle size={14} />儲存</button>
              <button className="ns-btn" onClick={() => setOpen(false)} disabled={busy}>取消</button>
              <button className="ns-btn" style={{ color: "var(--ns-neg)" }} onClick={onDelete} disabled={busy}><Trash size={14} />刪除目標</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <PlanRow label="目前年齡" value={`${goal.currentAge ?? PROJECTION_DEFAULTS.currentAge} 歲`} />
            <PlanRow label="預計退休" value={`${goal.retirementAge ?? PROJECTION_DEFAULTS.retirementAge} 歲`} />
            <PlanRow label="計畫到" value={`${goal.planThroughAge ?? PROJECTION_DEFAULTS.planThroughAge} 歲`} />
            <PlanRow label="月貢獻" value={formatMoney(goal.monthlyContribution, goal.currency)} />
          </div>
        )}
      </div>
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", padding: 10 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
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
    <div className="ns-card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>退休支出</h3>
        <button
          type="button"
          className="ns-btn ghost"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={add}
        >
          <Plus size={12} />新增
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {items.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            尚未設定任何支出項目，先用「年支出」估算：{formatMoney(goal.annualSpending, goal.currency)} / 年。
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item, index) => (
              <div key={item.id} style={{ borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", padding: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <TextInput
                    value={item.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    placeholder="項目名稱"
                  />
                  <button
                    type="button"
                    className="ns-btn ghost"
                    style={{ padding: 7, flexShrink: 0 }}
                    onClick={() => remove(index)}
                    aria-label="移除項目"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 10, alignItems: "end" }}>
                  <Field label="月支出">
                    <TextInput
                      type="number"
                      value={item.monthlyAmount}
                      onChange={(event) => update(index, { monthlyAmount: Number(event.target.value) })}
                    />
                  </Field>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 8 }}>
                    <span className="ns-eyebrow">必需</span>
                    <input
                      type="checkbox"
                      checked={item.mustHave}
                      onChange={(event) => update(index, { mustHave: event.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--ns-border)" }}>
          <span className="muted" style={{ fontSize: 13 }}>合計</span>
          <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{formatMoney(totalMonthly, goal.currency)} / 月</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="ns-btn primary" onClick={commit}><CheckCircle size={14} />儲存支出</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retirement income (placeholder for v1.1)
// ---------------------------------------------------------------------------

function IncomeCard() {
  return (
    <div className="ns-card" style={{ padding: 20 }}>
      <div style={{ borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", padding: 14, background: "var(--ns-bg-hover)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>
          <Info size={13} />退休收入 — 即將推出
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          勞保、國民年金、雇主退休金等收入會在後續版本加入這裡，並自動扣減從投資組合提領的金額。
        </p>
      </div>
    </div>
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
    <div className="ns-card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ns-border)" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>假設</h3>
        <button
          type="button"
          className="ns-btn ghost"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "收合" : <><Pencil size={12} style={{ marginRight: 4 }} />編輯</>}
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <button className="ns-btn primary" onClick={save}><CheckCircle size={14} />儲存假設</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <AssumptionRow label="退休前報酬率" value={percent(goal.preRetirementReturn ?? PROJECTION_DEFAULTS.preRetirementReturn)} />
            <AssumptionRow label="退休後報酬率" value={percent(goal.postRetirementReturn ?? PROJECTION_DEFAULTS.postRetirementReturn)} />
            <AssumptionRow label="年度手續費" value={percent(goal.annualFee ?? PROJECTION_DEFAULTS.annualFee)} />
            <AssumptionRow label="實質退休前報酬" value={percent(projection.effectivePreReturn)} muted />
            <AssumptionRow label="實質退休後報酬" value={percent(projection.effectivePostReturn)} muted />
            <AssumptionRow label="通膨率" value={percent(goal.inflationRate ?? PROJECTION_DEFAULTS.inflationRate)} />
            <AssumptionRow label="月貢獻成長" value={percent(goal.contributionGrowthRate ?? PROJECTION_DEFAULTS.contributionGrowthRate)} />
            <AssumptionRow label="提領率" value={percent(goal.withdrawalRate)} />
          </div>
        )}
      </div>
    </div>
  );
}

function AssumptionRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--ns-border)", fontSize: 13 }}>
      <span style={{ color: muted ? "var(--ns-fg-dim)" : "var(--ns-fg-muted)" }}>{label}</span>
      <span className="num" style={{ fontWeight: 600, color: muted ? "var(--ns-fg-dim)" : "var(--ns-fg)" }}>{value}</span>
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
    <div className="ns-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <Info size={16} style={{ color: "var(--ns-fg-dim)", flexShrink: 0, marginTop: 1 }} />
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.7 }}>
          這不是投資建議。把這些數字當作一張草稿，而不是預測。所有結果都由你輸入的假設算出 — 報酬率、通膨、貢獻、壽命 — 真實世界會偏離線性、稅制會改、政府政策會變。用這個畫面壓力測試想法、找出落差，重要決定請與合格的專業人士討論。
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
