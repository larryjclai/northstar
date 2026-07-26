import type { FinancialGoal, GoalDisplayMode, IncomeItem, SpendingItem } from "./types";

/**
 * Sensible defaults applied whenever a goal's field is null. These match the
 * placeholders Maybe ships with and are conservative enough that an empty
 * goal still produces something believable on screen.
 */
export const PROJECTION_DEFAULTS = {
  currentAge: 30,
  retirementAge: 50,
  planThroughAge: 90,
  preRetirementReturn: 0.07,
  postRetirementReturn: 0.04,
  inflationRate: 0.02,
  annualFee: 0.006,
  contributionGrowthRate: 0.02,
  withdrawalRate: 0.04,
} as const;

export type ProjectionPhase = "accumulation" | "retirement";

export interface ProjectionYear {
  age: number;
  year: number;
  phase: ProjectionPhase;
  /** Portfolio balance at year-end, expressed in the goal's display mode. */
  endBalance: number;
  /** Contribution made during the year. */
  contribution: number;
  /** Retirement income received during the year. */
  retirementIncome: number;
  /** Planned spending during the year. */
  plannedSpending: number;
  /** Net withdrawal from the portfolio (= plannedSpending - retirementIncome). */
  portfolioWithdrawal: number;
}

export interface RetirementProjection {
  /** Year-by-year series from currentAge through planThroughAge. */
  series: ProjectionYear[];
  /** True when the projected end balance at planThroughAge stays at or above zero. */
  onTrack: boolean;
  /**
   * First age at which the balance × withdrawalRate covers planned annual
   * spending — i.e. the earliest "you could stop working" age. Null when
   * the balance never gets there inside the modelled horizon.
   */
  fiAge: number | null;
  /** Target nest egg at retirementAge in the chosen display mode. */
  targetAtRetirement: number;
  /**
   * Current value that, if left alone (no further contributions), grows at
   * the pre-retirement return to fund retirement spending. The classic
   * "Coast FIRE" number.
   */
  coastFireAmount: number;
  /** 70% of target — minimum bare-bones retirement. */
  leanFireAmount: number;
  /** 150% of target — comfortable retirement. */
  fatFireAmount: number;
  /** Current portfolio used as the simulation starting balance. */
  currentValue: number;
  /** Effective annual return after fees — exposed for the assumptions card. */
  effectivePreReturn: number;
  effectivePostReturn: number;
  /** Annual spending used by the projection (sum of spending items × 12 with fallback). */
  annualSpending: number;
}

export interface ProjectionInput {
  goal: FinancialGoal;
  /** Current portfolio + cash value, in the goal's currency. */
  currentValue: number;
}

/**
 * Resolve a goal's projection. The math is the closed-form / iterative
 * combination Maybe's planner uses:
 *
 *   accumulation: B(t+1) = B(t) × (1 + r_pre - fee) + contribution_t
 *   retirement:   B(t+1) = B(t) × (1 + r_post - fee) - (spending_t - income_t)
 *
 * Returns are *effective* — fees come out of the gross return. Inflation is
 * applied to contributions, spending, and income depending on
 * `goal.displayMode`:
 *
 *   - "today" (default): values stay in today's purchasing power. Inflation
 *     therefore *cancels out* of the effective return (we compound at a
 *     real rate) and contributions / spending stay flat in real terms.
 *   - "nominal": values are presented in raw future dollars. Inflation
 *     compounds spending year over year; contributions also grow.
 */
export function projectRetirement(input: ProjectionInput): RetirementProjection {
  const { goal, currentValue } = input;
  const params = resolveParameters(goal);
  const {
    currentAge,
    retirementAge,
    planThroughAge,
    preReturn,
    postReturn,
    fee,
    inflation,
    contributionGrowth,
  } = params;

  const annualSpending = resolveAnnualSpending(goal);
  const wr = clamp(
    normalizeRate(goal.withdrawalRate) || PROJECTION_DEFAULTS.withdrawalRate,
    0.0001,
    1,
  );
  const baseTarget = annualSpending / wr;

  // Convert spending into today's-money or nominal-money depending on mode.
  // Same trick for income items so the two stay comparable.
  const displayMode = goal.displayMode || "today";
  const effectivePreReturn = adjustReturn(preReturn, fee, inflation, displayMode);
  const effectivePostReturn = adjustReturn(postReturn, fee, inflation, displayMode);

  const series: ProjectionYear[] = [];
  let balance = Math.max(0, currentValue);
  let contribution = goal.monthlyContribution * 12;
  // Apply growth either to keep contributions flat in real terms (today mode)
  // or compound them in nominal mode.
  const contributionGrowthEffective =
    displayMode === "today" ? Math.max(0, contributionGrowth - inflation) : contributionGrowth;

  let fiAge: number | null = null;

  for (let age = currentAge; age <= planThroughAge; age += 1) {
    const year = new Date().getFullYear() + (age - currentAge);
    const phase: ProjectionPhase = age < retirementAge ? "accumulation" : "retirement";
    let yearContribution = 0;
    let yearSpending = 0;
    let yearIncome = 0;

    if (phase === "accumulation") {
      yearContribution = contribution;
      const grossNext = balance * (1 + effectivePreReturn);
      balance = grossNext + yearContribution;
      // Contribution grows for next year's loop iteration.
      contribution *= 1 + contributionGrowthEffective;
    } else {
      const ageInRetirement = age - retirementAge;
      yearSpending = spendingForYear(
        goal.spendingItems,
        annualSpending,
        ageInRetirement,
        inflation,
        displayMode,
      );
      yearIncome = incomeForYear(goal.incomeItems, age, inflation, currentAge, displayMode);
      const netDraw = Math.max(0, yearSpending - yearIncome);
      const grossNext = balance * (1 + effectivePostReturn);
      balance = grossNext - netDraw;
      if (balance < 0) balance = 0;
    }

    series.push({
      age,
      year,
      phase,
      endBalance: roundCents(balance),
      contribution: roundCents(yearContribution),
      retirementIncome: roundCents(yearIncome),
      plannedSpending: roundCents(yearSpending),
      portfolioWithdrawal: roundCents(Math.max(0, yearSpending - yearIncome)),
    });

    // Earliest FI: balance × wr funds the planned spending. Captured during
    // accumulation only; once you're in retirement the answer is "you're
    // already there" by definition.
    if (fiAge === null && phase === "accumulation" && balance * wr >= annualSpending) {
      fiAge = age;
    }
  }

  const endBalance = series.length ? series[series.length - 1].endBalance : balance;
  // "On track" means the modelled balance survives to plan-through age. We
  // require strictly > 0 because a balance that hits exactly 0 at age 90 is
  // a hairline pass that doesn't survive any variance.
  const onTrack = endBalance > 0;

  // Coast FIRE: minimum balance today that, with no further contributions,
  // compounds at the effective pre-retirement return (real in "today" mode,
  // nominal otherwise — same basis as the projection) up to the retirement
  // target.
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const coastFireAmount = baseTarget / Math.pow(1 + effectivePreReturn, yearsToRetirement);

  return {
    series,
    onTrack,
    fiAge,
    targetAtRetirement: roundCents(baseTarget),
    coastFireAmount: roundCents(coastFireAmount),
    leanFireAmount: roundCents(baseTarget * 0.7),
    fatFireAmount: roundCents(baseTarget * 1.5),
    currentValue: roundCents(currentValue),
    effectivePreReturn,
    effectivePostReturn,
    annualSpending,
  };
}

export type ScenarioKey = "pessimistic" | "neutral" | "optimistic";

export interface ScenarioProjection {
  key: ScenarioKey;
  /** Return adjustment applied to both pre- and post-retirement returns. */
  returnDelta: number;
  projection: RetirementProjection;
}

export interface ScenarioSet {
  pessimistic: ScenarioProjection;
  neutral: ScenarioProjection;
  optimistic: ScenarioProjection;
  /** How many of the three scenarios stay solvent to plan-through age (0–3). */
  scenariosOnTrack: number;
}

/**
 * Lightweight sequence-of-returns sensitivity: re-run the deterministic
 * projection at a lower and higher return to bracket the central case. This is
 * the simple three-scenario stand-in for a full Monte Carlo — enough to show
 * that "on track" isn't a single-path certainty. `spread` is the ± adjustment
 * applied to both the pre- and post-retirement returns (default ±2.5pp, the
 * bear/bull band the calculator used before).
 */
export function projectRetirementScenarios(input: ProjectionInput, spread = 0.025): ScenarioSet {
  const run = (key: ScenarioKey, returnDelta: number): ScenarioProjection => {
    const preBase =
      input.goal.preRetirementReturn ??
      input.goal.expectedAnnualReturn ??
      PROJECTION_DEFAULTS.preRetirementReturn;
    const postBase = input.goal.postRetirementReturn ?? preBase;
    const projection = projectRetirement({
      ...input,
      goal: {
        ...input.goal,
        preRetirementReturn: preBase + returnDelta,
        postRetirementReturn: postBase + returnDelta,
        // Keep the legacy field aligned so downstream readers stay consistent.
        expectedAnnualReturn: preBase + returnDelta,
      },
    });
    return { key, returnDelta, projection };
  };
  const pessimistic = run("pessimistic", -spread);
  const neutral = run("neutral", 0);
  const optimistic = run("optimistic", spread);
  const scenariosOnTrack = [pessimistic, neutral, optimistic].filter(
    (s) => s.projection.onTrack,
  ).length;
  return { pessimistic, neutral, optimistic, scenariosOnTrack };
}

/** Sum of spending items × 12, falling back to the legacy `annualSpending`. */
export function resolveAnnualSpending(goal: FinancialGoal): number {
  if (goal.spendingItems && goal.spendingItems.length > 0) {
    return goal.spendingItems.reduce((sum, item) => sum + Math.max(0, item.monthlyAmount), 0) * 12;
  }
  return Math.max(0, goal.annualSpending);
}

interface ResolvedParameters {
  currentAge: number;
  retirementAge: number;
  planThroughAge: number;
  preReturn: number;
  postReturn: number;
  fee: number;
  inflation: number;
  contributionGrowth: number;
}

function resolveParameters(goal: FinancialGoal): ResolvedParameters {
  return {
    currentAge: validAge(goal.currentAge, PROJECTION_DEFAULTS.currentAge),
    retirementAge: validAge(goal.retirementAge, PROJECTION_DEFAULTS.retirementAge),
    planThroughAge: validAge(goal.planThroughAge, PROJECTION_DEFAULTS.planThroughAge),
    preReturn: validRate(
      goal.preRetirementReturn ?? goal.expectedAnnualReturn,
      PROJECTION_DEFAULTS.preRetirementReturn,
    ),
    // Post-retirement return inherits the accumulation return when not set
    // explicitly. A disconnected flat default made a portfolio that reached the
    // 25× SWR target spuriously deplete ("存到 25× 卻顯示未達標"); inheriting the
    // pre-retirement return keeps the target and the drawdown sim coherent.
    postReturn: validRate(
      goal.postRetirementReturn ?? goal.preRetirementReturn ?? goal.expectedAnnualReturn,
      PROJECTION_DEFAULTS.postRetirementReturn,
    ),
    fee: validRate(goal.annualFee, PROJECTION_DEFAULTS.annualFee),
    inflation: validRate(goal.inflationRate, PROJECTION_DEFAULTS.inflationRate),
    contributionGrowth: validRate(
      goal.contributionGrowthRate,
      PROJECTION_DEFAULTS.contributionGrowthRate,
    ),
  };
}

function adjustReturn(
  gross: number,
  fee: number,
  inflation: number,
  mode: GoalDisplayMode,
): number {
  const net = gross - fee;
  if (mode === "today") {
    // Real return: (1 + r_net) / (1 + i) - 1. Clamp at -0.999 so we never
    // produce a math-breaking `Math.pow(0, n)` later.
    const real = (1 + net) / (1 + inflation) - 1;
    return Math.max(real, -0.999);
  }
  return Math.max(net, -0.999);
}

function spendingForYear(
  items: SpendingItem[],
  fallbackAnnual: number,
  ageInRetirement: number,
  inflation: number,
  mode: GoalDisplayMode,
): number {
  const base =
    items && items.length > 0
      ? items.reduce((sum, item) => sum + Math.max(0, item.monthlyAmount), 0) * 12
      : fallbackAnnual;
  if (mode === "nominal") {
    return base * Math.pow(1 + inflation, Math.max(0, ageInRetirement));
  }
  return base;
}

function incomeForYear(
  items: IncomeItem[],
  age: number,
  inflation: number,
  baseAge: number,
  mode: GoalDisplayMode,
): number {
  if (!items || items.length === 0) return 0;
  const years = Math.max(0, age - baseAge);
  return items.reduce((sum, item) => {
    if (age < item.startAge || age > item.endAge) return sum;
    const annual = Math.max(0, item.monthlyAmount) * 12;
    const linked = item.inflationLinked ?? false;
    if (mode === "nominal") {
      // Inflation-linked income grows with prices; fixed income stays flat.
      return sum + (linked ? annual * Math.pow(1 + inflation, years) : annual);
    }
    // today's-money mode: linked income keeps its real value; fixed income
    // loses purchasing power year over year.
    return sum + (linked ? annual : annual / Math.pow(1 + inflation, years));
  }, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function validAge(value: number | null, fallback: number): number {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0 || value > 130)
    return fallback;
  return Math.round(value);
}

function validRate(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return normalizeRate(value);
}

/**
 * Accept rates stored either as a decimal (0.04) or a percentage (4). Any value
 * greater than 1 is unambiguously a percentage for the inputs we deal with
 * (returns, withdrawal rates), so divide by 100. This keeps the engine correct
 * regardless of which convention a saved goal used — the FIRE calculator used
 * to persist percentages while the projection math expects decimals.
 */
function normalizeRate(value: number): number {
  return value > 1 ? value / 100 : value;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
