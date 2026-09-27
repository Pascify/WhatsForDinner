"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { readTags } from "@/lib/portal/forms";
import { addMeal, setHidden } from "@/lib/portal/meals";
import type { ActionResult } from "@/lib/portal/plan";

async function requireUserId() {
  const doc = await currentUser();
  if (!doc) throw new Error("Not signed in");
  return doc._id.toHexString();
}

export async function toggleMeal(formData: FormData) {
  const userId = await requireUserId();
  await setHidden(userId, String(formData.get("mealId")), formData.get("hidden") === "true");
  revalidatePath("/meals");
}

export async function createMeal(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Give the meal a name." };

  await addMeal(userId, name, readTags(formData.getAll("tags")));
  revalidatePath("/meals");
  return { ok: true, message: `Added ${name}.` };
}
