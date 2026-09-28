"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { ensurePlan, WEEK_STARTS_ON } from "@/lib/bot/run-command";
import { store, toBotUser } from "@/lib/portal/data";
import { regeneratePlan, swapPlanDay, type ActionResult } from "@/lib/portal/plan";
import { localDateISO, startOfWeek } from "@/lib/plan/week";

/** Server actions are reachable directly, so each one checks the session itself. */
async function requireUser() {
  const doc = await currentUser();
  if (!doc) throw new Error("Not signed in");
  return toBotUser(doc);
}

export async function swapDay(_previous: ActionResult | undefined, formData: FormData) {
  const user = await requireUser();
  const result = await swapPlanDay(store, user, String(formData.get("date") ?? ""));
  if (result.ok) revalidatePath("/");
  return result;
}

export async function regenerateWeek() {
  const user = await requireUser();
  const result = await regeneratePlan(store, user);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function ensureThisWeek() {
  const user = await requireUser();
  const today = localDateISO(new Date(), user.timezone);
  return ensurePlan(store, user, startOfWeek(today, WEEK_STARTS_ON));
}
