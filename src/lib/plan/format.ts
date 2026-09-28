import type { Meal, Plan } from "./types";
import { dayLong, dayShort, shortDate } from "./week";

export type MealLookup = (mealId: string) => Meal | undefined;

export const nameOf = (lookup: MealLookup, mealId: string) =>
  lookup(mealId)?.name ?? "Something tasty";

/** The whole week, as a free-form WhatsApp message. */
export function formatPlan(plan: Plan, lookup: MealLookup): string {
  const lines = plan.days.map(
    (day) => `${dayShort(day.date)}: ${nameOf(lookup, day.mealId)}${day.locked ? " 📌" : ""}`,
  );

  const notes = plan.relaxations.length
    ? `\n\n_${plan.relaxations.map((relaxation) => relaxation.reason).join(". ")}_`
    : "";

  return `*WhatsForDinner* 🍽️\nWeek of ${shortDate(plan.weekOf)}\n\n${lines.join("\n")}${notes}`;
}

/** One day, for "today" and "tomorrow". */
export function formatDay(plan: Plan, dateISO: string, lookup: MealLookup, label?: string): string {
  const day = plan.days.find((entry) => entry.date === dateISO);
  if (!day) return "I don't have a plan for that day yet.";
  return `${label ?? dayLong(dateISO)}: *${nameOf(lookup, day.mealId)}* 🍽️`;
}

/** Rows for the "which day?" list when swapping. */
export function swapRows(plan: Plan, lookup: MealLookup) {
  return plan.days.map((day) => ({
    id: `swapday_${day.date}`,
    title: dayLong(day.date),
    description: nameOf(lookup, day.mealId),
  }));
}

/** The 7 day names, in the order the template expects its variables. */
export function templateVariables(plan: Plan, lookup: MealLookup): string[] {
  return [shortDate(plan.weekOf), ...plan.days.map((day) => nameOf(lookup, day.mealId))];
}
