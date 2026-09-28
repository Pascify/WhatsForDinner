import type { DeliverySettings } from "@/lib/db/types";
import { TAG_GROUPS, type Rule, type Tag, type Weekday } from "@/lib/plan/types";

const ALL_TAGS = new Set<string>(Object.values(TAG_GROUPS).flat());

/** Form values arrive as strings from an untrusted POST, so everything here is validated. */
export const readTags = (values: (FormDataEntryValue | string)[]): Tag[] =>
  values.map(String).filter((value): value is Tag => ALL_TAGS.has(value));

const readHour = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
};

const readWeekday = (value: unknown, fallback: Weekday): Weekday => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? (parsed as Weekday) : fallback;
};

/**
 * Builds delivery settings from the preferences form. Opting into paid messages records when
 * and where consent was given, which Meta requires before any business-initiated message.
 */
export function readDeliveryForm(
  form: FormData,
  current: DeliverySettings,
  now = new Date(),
): DeliverySettings {
  const mode = form.get("mode") === "auto" ? "auto" : "on_request";
  const what = String(form.get("what") ?? "weekly");
  const requested = String(form.get("whenClosed") ?? "email");
  const whenClosed = (
    ["wait", "email", "whatsapp"].includes(requested) ? requested : "email"
  ) as DeliverySettings["whenClosed"];

  const delivery: DeliverySettings = {
    ...current,
    mode,
    weekly: {
      enabled: mode === "auto" && (what === "weekly" || what === "both"),
      weekday: readWeekday(form.get("weeklyDay"), current.weekly.weekday),
      hour: readHour(form.get("weeklyHour"), current.weekly.hour),
    },
    daily: {
      ...current.daily,
      enabled: mode === "auto" && (what === "daily" || what === "both"),
      hour: readHour(form.get("dailyHour"), current.daily.hour),
    },
    whenClosed,
  };

  if (whenClosed === "whatsapp") {
    delivery.paidOptInAt = current.whenClosed === "whatsapp" ? current.paidOptInAt : now;
    delivery.paidOptInSource =
      current.whenClosed === "whatsapp" ? current.paidOptInSource : "portal";
  } else {
    delete delivery.paidOptInAt;
    delete delivery.paidOptInSource;
  }

  return delivery;
}

/** Returns undefined when the form cannot make a valid rule, so the caller saves nothing. */
export function readRuleForm(form: FormData): Rule | undefined {
  const tags = readTags(form.getAll("tags"));
  if (tags.length === 0) return undefined;

  const kind = String(form.get("kind"));
  if (kind === "never" || kind === "always") return { kind, tags };
  if (kind === "day") return { kind, day: readWeekday(form.get("day"), 0), tags };

  if (kind === "quota") {
    // The builder sends "how" and "times"; min and max are the older raw fields.
    const how = String(form.get("how") ?? "");
    const count = Number(form.get("times"));
    const max = how === "at_most" || how === "exactly" ? count : Number(form.get("max"));
    const min = how === "at_least" || how === "exactly" ? count : Number(form.get("min"));
    const rule: Rule = {
      kind: "quota",
      tags,
      ...(Number.isInteger(max) && max > 0 && max <= 7 ? { max } : {}),
      ...(Number.isInteger(min) && min > 0 && min <= 7 ? { min } : {}),
    };
    return "max" in rule || "min" in rule ? rule : undefined;
  }

  return undefined;
}

export function readTimezone(value: unknown, fallback: string): string {
  const zone = String(value ?? "");
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}
