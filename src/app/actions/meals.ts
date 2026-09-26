"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { TAG_GROUPS, type Tag } from "@/lib/plan/types";
import { addMeal, setHidden } from "@/lib/portal/meals";

const ALL_TAGS = new Set<string>(Object.values(TAG_GROUPS).flat());

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

export async function createMeal(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const tags = formData
    .getAll("tags")
    .map(String)
    .filter((tag): tag is Tag => ALL_TAGS.has(tag));

  await addMeal(userId, name, tags);
  revalidatePath("/meals");
}
