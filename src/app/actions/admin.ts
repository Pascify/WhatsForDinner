"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { adminSettings } from "@/lib/db/collections";

/** Only the owner can change what the app is allowed to spend. */
async function requireAdmin() {
  const doc = await currentUser();
  if (!doc || doc.role !== "admin") throw new Error("Not allowed");
  return doc;
}

export async function saveBudget(formData: FormData) {
  await requireAdmin();

  const cap = Number(formData.get("cap"));
  const killSwitch = formData.get("killSwitch") === "on";

  await (
    await adminSettings()
  ).updateOne(
    { _id: "admin" },
    {
      $set: {
        paidMonthlyCap: Number.isInteger(cap) && cap >= 0 ? cap : 0,
        paidKillSwitch: killSwitch,
      },
      $setOnInsert: { countingMonth: new Date().toISOString().slice(0, 7), paidSentThisMonth: 0 },
    },
    { upsert: true },
  );

  revalidatePath("/admin");
}
