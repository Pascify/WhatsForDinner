"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { ensurePlan, WEEK_STARTS_ON } from "@/lib/bot/run-command";
import { store, toBotUser } from "@/lib/portal/data";
import { generatePlan, suggestAlternative } from "@/lib/plan/generate";
import { hashSeed } from "@/lib/plan/rng";
import { localDateISO, startOfWeek } from "@/lib/plan/week";

/** Server actions are reachable directly, so each one checks the session itself. */
async function requireUser() {
  const doc = await currentUser();
  if (!doc) throw new Error("Not signed in");
  return toBotUser(doc);
}

export async function swapDay(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const weekOf = startOfWeek(date, WEEK_STARTS_ON);

  const [plan, meals, history] = await Promise.all([
    store.findPlan(user.id, weekOf),
    store.mealsFor(user.id),
    store.historyFor(user.id),
  ]);
  if (!plan) return;

  const current = plan.days.find((day) => day.date === date);
  const suggestion = suggestAlternative({
    meals,
    rules: user.rules,
    history,
    plan,
    date,
    rejected: current ? [current.mealId] : [],
    attempt: Date.now() % 1000,
  });
  if (!suggestion) return;

  await store.setPlanDay(user.id, weekOf, date, suggestion.id);
  revalidatePath("/");
}

/** Builds a fresh week from scratch, keeping any days the user pinned. */
export async function regenerateWeek() {
  const user = await requireUser();
  const today = localDateISO(new Date(), user.timezone);
  const weekOf = startOfWeek(today, WEEK_STARTS_ON);

  const [existing, meals, history] = await Promise.all([
    store.findPlan(user.id, weekOf),
    store.mealsFor(user.id),
    store.historyFor(user.id),
  ]);

  const plan = generatePlan({
    meals,
    rules: user.rules,
    history,
    weekOf,
    seed: hashSeed(`${user.id}:${weekOf}:${Date.now()}`),
    locked: existing?.days.filter((day) => day.locked),
  });

  await store.savePlan(user.id, plan);
  revalidatePath("/");
}

export async function ensureThisWeek() {
  const user = await requireUser();
  const today = localDateISO(new Date(), user.timezone);
  return ensurePlan(store, user, startOfWeek(today, WEEK_STARTS_ON));
}
