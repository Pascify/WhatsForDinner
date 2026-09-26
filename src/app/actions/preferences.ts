"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { TAG_GROUPS, type Rule, type Tag, type Weekday } from "@/lib/plan/types";
import { updateDelivery, updateRules, updateTimezone, toBotUser } from "@/lib/portal/data";
import type { DeliverySettings } from "@/lib/db/types";

const ALL_TAGS = new Set<string>(Object.values(TAG_GROUPS).flat());
const asTags = (values: FormDataEntryValue[]): Tag[] =>
  values.map(String).filter((value): value is Tag => ALL_TAGS.has(value));

async function requireUser() {
  const doc = await currentUser();
  if (!doc) throw new Error("Not signed in");
  return toBotUser(doc);
}

const hour = (value: FormDataEntryValue | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
};

export async function saveDelivery(formData: FormData) {
  const user = await requireUser();
  const mode = formData.get("mode") === "auto" ? "auto" : "on_request";
  const what = String(formData.get("what") ?? "weekly");
  const whenClosed = String(formData.get("whenClosed") ?? "email") as DeliverySettings["whenClosed"];

  const delivery: DeliverySettings = {
    ...user.delivery,
    mode,
    weekly: {
      ...user.delivery.weekly,
      enabled: mode === "auto" && (what === "weekly" || what === "both"),
      weekday: (Number(formData.get("weeklyDay")) || 6) as Weekday,
      hour: hour(formData.get("weeklyHour"), 18),
    },
    daily: {
      ...user.delivery.daily,
      enabled: mode === "auto" && (what === "daily" || what === "both"),
      hour: hour(formData.get("dailyHour"), 16),
    },
    whenClosed: ["wait", "email", "whatsapp"].includes(whenClosed) ? whenClosed : "email",
  };

  // Meta requires a record of consent before any business-initiated message.
  if (delivery.whenClosed === "whatsapp" && user.delivery.whenClosed !== "whatsapp") {
    delivery.paidOptInAt = new Date();
    delivery.paidOptInSource = "portal";
  }
  if (delivery.whenClosed !== "whatsapp") {
    delete delivery.paidOptInAt;
    delete delivery.paidOptInSource;
  }

  const timezone = String(formData.get("timezone") ?? user.timezone);
  await Promise.all([updateDelivery(user.id, delivery), updateTimezone(user.id, timezone)]);
  revalidatePath("/preferences");
  revalidatePath("/");
}

export async function addRule(formData: FormData) {
  const user = await requireUser();
  const kind = String(formData.get("kind"));
  const tags = asTags(formData.getAll("tags"));
  if (tags.length === 0) return;

  let rule: Rule | undefined;
  if (kind === "never") rule = { kind: "never", tags };
  if (kind === "always") rule = { kind: "always", tags };
  if (kind === "day") {
    rule = { kind: "day", day: (Number(formData.get("day")) || 0) as Weekday, tags };
  }
  if (kind === "quota") {
    const max = Number(formData.get("max"));
    const min = Number(formData.get("min"));
    rule = {
      kind: "quota",
      tags,
      ...(Number.isInteger(max) && max > 0 ? { max } : {}),
      ...(Number.isInteger(min) && min > 0 ? { min } : {}),
    };
  }
  if (!rule) return;

  await updateRules(user.id, [...user.rules, rule]);
  revalidatePath("/preferences");
}

export async function removeRule(formData: FormData) {
  const user = await requireUser();
  const index = Number(formData.get("index"));
  if (!Number.isInteger(index)) return;

  await updateRules(user.id, user.rules.filter((_, position) => position !== index));
  revalidatePath("/preferences");
}
