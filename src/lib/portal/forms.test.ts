import { describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY, type DeliverySettings } from "@/lib/db/types";
import { readDeliveryForm, readRuleForm, readTags, readTimezone } from "./forms";

const NOW = new Date("2026-09-26T12:00:00Z");
const current = (over: Partial<DeliverySettings> = {}): DeliverySettings => ({
  ...structuredClone(DEFAULT_DELIVERY),
  ...over,
});

const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
};

describe("readDeliveryForm", () => {
  it("turns the weekly choice into enabled schedules", () => {
    const delivery = readDeliveryForm(
      form({ mode: "auto", what: "weekly", weeklyDay: "5", weeklyHour: "19", whenClosed: "email" }),
      current(),
      NOW,
    );

    expect(delivery).toMatchObject({
      mode: "auto",
      weekly: { enabled: true, weekday: 5, hour: 19 },
      daily: { enabled: false },
      whenClosed: "email",
    });
  });

  it("enables both schedules", () => {
    const delivery = readDeliveryForm(
      form({ mode: "auto", what: "both", dailyHour: "17" }),
      current(),
      NOW,
    );

    expect(delivery.weekly.enabled).toBe(true);
    expect(delivery.daily).toMatchObject({ enabled: true, hour: 17 });
  });

  it("turns both off when nothing is automatic", () => {
    const delivery = readDeliveryForm(form({ mode: "on_request", what: "both" }), current(), NOW);

    expect(delivery.mode).toBe("on_request");
    expect(delivery.weekly.enabled).toBe(false);
    expect(delivery.daily.enabled).toBe(false);
  });

  it("keeps the current values when hours and days are junk", () => {
    const delivery = readDeliveryForm(
      form({ mode: "auto", what: "weekly", weeklyDay: "99", weeklyHour: "-3", dailyHour: "abc" }),
      current(),
      NOW,
    );

    expect(delivery.weekly.weekday).toBe(DEFAULT_DELIVERY.weekly.weekday);
    expect(delivery.weekly.hour).toBe(DEFAULT_DELIVERY.weekly.hour);
    expect(delivery.daily.hour).toBe(DEFAULT_DELIVERY.daily.hour);
  });

  it("falls back to email when the fallback choice is not one we offer", () => {
    expect(
      readDeliveryForm(form({ whenClosed: "carrier-pigeon" }), current(), NOW).whenClosed,
    ).toBe("email");
  });

  it("records consent the first time someone opts into paid messages", () => {
    const delivery = readDeliveryForm(
      form({ mode: "auto", whenClosed: "whatsapp" }),
      current(),
      NOW,
    );

    expect(delivery.whenClosed).toBe("whatsapp");
    expect(delivery.paidOptInAt).toEqual(NOW);
    expect(delivery.paidOptInSource).toBe("portal");
  });

  it("keeps the original consent date when the choice has not changed", () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const delivery = readDeliveryForm(
      form({ mode: "auto", whenClosed: "whatsapp" }),
      current({ whenClosed: "whatsapp", paidOptInAt: earlier, paidOptInSource: "whatsapp" }),
      NOW,
    );

    expect(delivery.paidOptInAt).toEqual(earlier);
    expect(delivery.paidOptInSource).toBe("whatsapp");
  });

  it("clears consent when they move off the paid option", () => {
    const delivery = readDeliveryForm(
      form({ mode: "auto", whenClosed: "wait" }),
      current({ whenClosed: "whatsapp", paidOptInAt: NOW, paidOptInSource: "portal" }),
      NOW,
    );

    expect(delivery.paidOptInAt).toBeUndefined();
    expect(delivery.paidOptInSource).toBeUndefined();
  });
});

describe("readRuleForm", () => {
  it("reads each kind of rule", () => {
    expect(readRuleForm(form({ kind: "never", tags: ["beef", "fish"] }))).toEqual({
      kind: "never",
      tags: ["beef", "fish"],
    });
    expect(readRuleForm(form({ kind: "always", tags: "halal" }))).toEqual({
      kind: "always",
      tags: ["halal"],
    });
    expect(readRuleForm(form({ kind: "day", day: "5", tags: ["rice", "chicken"] }))).toEqual({
      kind: "day",
      day: 5,
      tags: ["rice", "chicken"],
    });
    expect(readRuleForm(form({ kind: "quota", tags: "pasta", max: "1" }))).toEqual({
      kind: "quota",
      tags: ["pasta"],
      max: 1,
    });
  });

  it("reads how often from the builder", () => {
    const quota = (how: string, times: string) =>
      readRuleForm(form({ kind: "quota", tags: "chicken", how, times }));

    expect(quota("at_most", "2")).toEqual({ kind: "quota", tags: ["chicken"], max: 2 });
    expect(quota("at_least", "1")).toEqual({ kind: "quota", tags: ["chicken"], min: 1 });
    expect(quota("exactly", "3")).toEqual({ kind: "quota", tags: ["chicken"], min: 3, max: 3 });
    expect(quota("at_most", "9")).toBeUndefined();
  });

  it("ignores tags that are not in the vocabulary", () => {
    expect(readTags(["chicken", "unicorn", "rice"])).toEqual(["chicken", "rice"]);
    expect(readRuleForm(form({ kind: "never", tags: "unicorn" }))).toBeUndefined();
  });

  it("refuses a rule with no tags, an unknown kind or an empty quota", () => {
    expect(readRuleForm(form({ kind: "never" }))).toBeUndefined();
    expect(readRuleForm(form({ kind: "nonsense", tags: "beef" }))).toBeUndefined();
    expect(readRuleForm(form({ kind: "quota", tags: "pasta" }))).toBeUndefined();
    expect(readRuleForm(form({ kind: "quota", tags: "pasta", max: "0" }))).toBeUndefined();
  });
});

describe("readTimezone", () => {
  it("accepts a real zone and rejects anything else", () => {
    expect(readTimezone("America/Toronto", "Asia/Karachi")).toBe("America/Toronto");
    expect(readTimezone("Mars/Olympus", "Asia/Karachi")).toBe("Asia/Karachi");
    expect(readTimezone(undefined, "Asia/Karachi")).toBe("Asia/Karachi");
  });
});
