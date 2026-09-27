"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { readDeliveryForm, readRuleForm, readTimezone } from "@/lib/portal/forms";
import { toBotUser, updateDelivery, updateRules, updateTimezone } from "@/lib/portal/data";
import type { ActionResult } from "@/lib/portal/plan";

/** Server actions are reachable by direct POST, so each one checks the session itself. */
async function requireUser() {
  const doc = await currentUser();
  if (!doc) throw new Error("Not signed in");
  return toBotUser(doc);
}

export async function saveDelivery(formData: FormData) {
  const user = await requireUser();

  await Promise.all([
    updateDelivery(user.id, readDeliveryForm(formData, user.delivery)),
    updateTimezone(user.id, readTimezone(formData.get("timezone"), user.timezone)),
  ]);

  revalidatePath("/preferences");
  revalidatePath("/");
}

export async function addRule(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const rule = readRuleForm(formData);
  if (!rule) return { ok: false, message: "Pick at least one option for the rule." };

  await updateRules(user.id, [...user.rules, rule]);
  revalidatePath("/preferences");
  return { ok: true, message: "Rule added. Regenerate the week to apply it now." };
}

export async function removeRule(formData: FormData) {
  const user = await requireUser();
  const index = Number(formData.get("index"));
  if (!Number.isInteger(index)) return;

  await updateRules(
    user.id,
    user.rules.filter((_, position) => position !== index),
  );
  revalidatePath("/preferences");
}
