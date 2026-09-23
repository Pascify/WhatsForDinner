import { mulberry32, weightedPick } from "./rng";
import type {
  GenerateInput,
  History,
  Meal,
  Plan,
  PlanDay,
  Relaxation,
  Rule,
  Tag,
  Weekday,
} from "./types";

const DAY_MS = 86_400_000;
const DEFAULT_REPEAT_GAP_DAYS = 21;
/** Weight left to a meal served today: low, but never zero, so a tiny catalog still works. */
const MIN_RECENCY_WEIGHT = 0.05;

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

function weekdayOf(iso: string): Weekday {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() as Weekday;
}

const hasAll = (meal: Meal, tags: Tag[]) => tags.every((tag) => meal.tags.includes(tag));
const hasAny = (meal: Meal, tags: Tag[]) => tags.some((tag) => meal.tags.includes(tag));

function byKind<K extends Rule["kind"]>(rules: Rule[], kind: K) {
  return rules.filter((rule): rule is Extract<Rule, { kind: K }> => rule.kind === kind);
}

/** Meals that satisfy every always/never rule. These are never relaxed. */
function hardPool(meals: Meal[], rules: Rule[]): Meal[] {
  const always = byKind(rules, "always");
  const never = byKind(rules, "never");
  return meals.filter(
    (meal) =>
      !meal.hidden &&
      always.every((rule) => hasAll(meal, rule.tags)) &&
      !never.some((rule) => hasAny(meal, rule.tags)),
  );
}

/** How much to favour a meal, given how recently it was served. */
function recencyWeight(meal: Meal, history: History, today: string, gapDays: number): number {
  const lastServed = history[meal.id];
  if (!lastServed) return 1;
  const since = daysBetween(lastServed, today);
  if (since >= gapDays) return 1;
  if (since <= 0) return MIN_RECENCY_WEIGHT;
  return MIN_RECENCY_WEIGHT + (1 - MIN_RECENCY_WEIGHT) * (since / gapDays);
}

function preferenceWeight(meal: Meal, rules: Rule[]): number {
  return byKind(rules, "prefer").reduce(
    (weight, rule) => (hasAll(meal, rule.tags) ? weight * rule.weight : weight),
    1,
  );
}

/**
 * Build a week of dinners.
 *
 * Always/never rules are absolute. Everything else gives way when a day has no candidates left,
 * in this order: weekly quotas, then the day rule, then the no-repeats-this-week rule. Each time
 * something gives way it is recorded in `relaxations` so the UI can explain the plan.
 */
export function generatePlan(input: GenerateInput): Plan {
  const {
    meals,
    rules = [],
    history = {},
    weekOf,
    seed,
    locked = [],
    repeatGapDays = DEFAULT_REPEAT_GAP_DAYS,
  } = input;

  const pool = hardPool(meals, rules);
  if (pool.length === 0) {
    throw new Error("No meals satisfy the always/never rules");
  }

  const rng = mulberry32(seed);
  const relaxations: Relaxation[] = [];
  const lockedByDate = new Map(locked.map((day) => [day.date, day]));
  const dayRules = byKind(rules, "day");
  const quotas = byKind(rules, "quota");

  const days: PlanDay[] = [];
  const usedIds = new Set<string>();
  /** Running count per quota rule, by index. */
  const quotaCounts = quotas.map(() => 0);

  const countQuotas = (meal: Meal) => {
    quotas.forEach((rule, index) => {
      if (hasAll(meal, rule.tags)) quotaCounts[index] += 1;
    });
  };

  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(weekOf, offset);
    const note = (reason: string) => relaxations.push({ date, reason });

    const pinned = lockedByDate.get(date);
    if (pinned) {
      const meal = meals.find((candidate) => candidate.id === pinned.mealId);
      days.push({ ...pinned, locked: true });
      usedIds.add(pinned.mealId);
      if (meal) countQuotas(meal);
      continue;
    }

    let candidates = pool.filter((meal) => !usedIds.has(meal.id));
    if (candidates.length === 0) {
      note("Ran out of meals, so one is repeated this week");
      candidates = pool;
    }

    const dayRule = dayRules.find((rule) => rule.day === weekdayOf(date));
    if (dayRule) {
      const matching = candidates.filter((meal) => hasAll(meal, dayRule.tags));
      if (matching.length > 0) {
        candidates = matching;
      } else {
        note(`No meal left for the ${dayRule.tags.join(" + ")} rule, so it was skipped`);
      }
    }

    quotas.forEach((rule, index) => {
      if (rule.max === undefined || quotaCounts[index] < rule.max) return;
      const within = candidates.filter((meal) => !hasAll(meal, rule.tags));
      if (within.length > 0) {
        candidates = within;
      } else {
        note(`Only ${rule.tags.join(" + ")} meals were left, so its weekly limit was passed`);
      }
    });

    const weights = candidates.map(
      (meal) =>
        recencyWeight(meal, history, date, repeatGapDays) * preferenceWeight(meal, rules),
    );
    const picked = weightedPick(candidates, weights, rng) ?? candidates[0];

    days.push({ date, mealId: picked.id });
    usedIds.add(picked.id);
    countQuotas(picked);
  }

  fillMinimums({ days, quotas, quotaCounts, pool, usedIds, dayRules, relaxations, weekOf });

  return { weekOf, days, relaxations, seed };
}

/** Second pass: swap days until "at least N" quotas are met, where a day is free to change. */
function fillMinimums(args: {
  days: PlanDay[];
  quotas: Extract<Rule, { kind: "quota" }>[];
  quotaCounts: number[];
  pool: Meal[];
  usedIds: Set<string>;
  dayRules: Extract<Rule, { kind: "day" }>[];
  relaxations: Relaxation[];
  weekOf: string;
}) {
  const { days, quotas, quotaCounts, pool, usedIds, dayRules, relaxations } = args;

  quotas.forEach((rule, index) => {
    if (rule.min === undefined) return;

    while (quotaCounts[index] < rule.min) {
      const swappable = days.find((day) => {
        if (day.locked) return false;
        if (dayRules.some((dayRule) => dayRule.day === weekdayOf(day.date))) return false;
        const meal = pool.find((candidate) => candidate.id === day.mealId);
        return meal ? !hasAll(meal, rule.tags) : false;
      });
      const replacement = pool.find(
        (meal) => hasAll(meal, rule.tags) && !usedIds.has(meal.id),
      );

      if (!swappable || !replacement) {
        relaxations.push({
          date: days[0].date,
          reason: `Could not fit ${rule.min} ${rule.tags.join(" + ")} meals this week`,
        });
        return;
      }

      usedIds.delete(swappable.mealId);
      usedIds.add(replacement.id);
      swappable.mealId = replacement.id;
      quotaCounts[index] += 1;
    }
  });
}
