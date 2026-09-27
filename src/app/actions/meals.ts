"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { readTags } from "@/lib/portal/forms";
import { addMeal, setHidden } from "@/lib/portal/meals";

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

  await addMeal(userId, name, readTags(formData.getAll("tags")));
  revalidatePath("/meals");
}
