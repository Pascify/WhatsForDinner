import { WEEK_STARTS_ON } from "@/lib/bot/run-command";
import type { BotStore, BotUser } from "@/lib/bot/store";
import { generatePlan, suggestAlternative } from "@/lib/plan/generate";
import { hashSeed } from "@/lib/plan/rng";
import { localDateISO, startOfWeek } from "@/lib/plan/week";

/** What a portal form shows after it runs. A silent no-op reads as a broken button. */
export type ActionResult = { ok: boolean; message: string };

export async function swapPlanDay(
  store: BotStore,
  user: BotUser,
  date: string,
  now = new Date(),
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "That day isn't valid." };
  const weekOf = startOfWeek(date, WEEK_STARTS_ON);

  const [plan, meals, history] = await Promise.all([
    store.findPlan(user.id, weekOf),
    store.mealsFor(user.id),
    store.historyFor(user.id),
  ]);
  if (!plan) return { ok: false, message: "That week has no plan yet. Reload the page." };

  const current = plan.days.find((day) => day.date === date);
  if (!current) return { ok: false, message: "That day isn't on this week's plan." };

  const suggestion = suggestAlternative({
    meals,
    rules: user.rules,
    history,
    plan,
    date,
    rejected: [current.mealId],
    attempt: now.getTime() % 1000,
  });
  if (!suggestion) {
    return {
      ok: false,
      message: "Nothing else fits your rules this week. Loosen a rule or add a meal.",
    };
  }

  await store.setPlanDay(user.id, weekOf, date, suggestion.id);
  return { ok: true, message: `Swapped for ${suggestion.name}.` };
}

/** Builds this week again from scratch, keeping any days the user pinned. */
export async function regeneratePlan(
  store: BotStore,
  user: BotUser,
  now = new Date(),
): Promise<ActionResult> {
  const weekOf = startOfWeek(localDateISO(now, user.timezone), WEEK_STARTS_ON);

  const [existing, meals, history] = await Promise.all([
    store.findPlan(user.id, weekOf),
    store.mealsFor(user.id),
    store.historyFor(user.id),
  ]);

  let plan;
  try {
    plan = generatePlan({
      meals,
      rules: user.rules,
      history,
      weekOf,
      seed: hashSeed(`${user.id}:${weekOf}:${now.getTime()}`),
      locked: existing?.days.filter((day) => day.locked),
    });
  } catch {
    // generatePlan only throws when the always/never rules rule out every meal.
    return { ok: false, message: "Your rules rule out every meal. Remove one and try again." };
  }

  await store.savePlan(user.id, plan);
  return { ok: true, message: "Fresh week ready." };
}
