import { beforeEach, describe, expect, it } from "vitest";
import { ensurePlan } from "@/lib/bot/run-command";
import { MemoryBotStore } from "@/lib/bot/memory-store";
import type { BotUser } from "@/lib/bot/store";
import { regeneratePlan, swapPlanDay } from "./plan";

/** A Wednesday, 8pm in Karachi. The week runs Monday 21 to Sunday 27 September. */
const NOW = new Date("2026-09-23T15:00:00Z");
const WEEK_OF = "2026-09-21";

let store: MemoryBotStore;
let user: BotUser;

beforeEach(() => {
  store = new MemoryBotStore();
  user = store.seedUser({ status: "active", timezone: "Asia/Karachi" });
});

const mealOn = async (date: string) =>
  (await store.findPlan(user.id, WEEK_OF))?.days.find((day) => day.date === date)?.mealId;

describe("swapPlanDay", () => {
  it("replaces the day with a meal not already on the plan", async () => {
    const plan = await ensurePlan(store, user, WEEK_OF);
    const before = await mealOn("2026-09-23");

    const result = await swapPlanDay(store, user, "2026-09-23", NOW);

    expect(result.ok).toBe(true);
    const after = await mealOn("2026-09-23");
    expect(after).not.toBe(before);
    expect(plan.days.map((day) => day.mealId)).not.toContain(after);
  });

  it("says so when the rules leave nothing to swap in", async () => {
    // Five daal dishes cannot fill a week, so every one is already on it.
    user = store.seedUser({ status: "active", rules: [{ kind: "always", tags: ["daal"] }] });
    await ensurePlan(store, user, WEEK_OF);

    const result = await swapPlanDay(store, user, "2026-09-23", NOW);

    expect(result).toEqual({ ok: false, message: expect.stringContaining("Nothing else fits") });
  });

  it("rejects a date that is not on the plan", async () => {
    await ensurePlan(store, user, WEEK_OF);
    expect((await swapPlanDay(store, user, "2026-10-05", NOW)).ok).toBe(false);
    expect((await swapPlanDay(store, user, "tuesday", NOW)).ok).toBe(false);
  });
});

describe("regeneratePlan", () => {
  it("builds a new week and keeps pinned days", async () => {
    const plan = await ensurePlan(store, user, WEEK_OF);
    plan.days[0].locked = true;
    await store.savePlan(user.id, plan);

    const result = await regeneratePlan(store, user, NOW);

    expect(result.ok).toBe(true);
    const fresh = await store.findPlan(user.id, WEEK_OF);
    expect(fresh?.days[0].mealId).toBe(plan.days[0].mealId);
    expect(fresh?.seed).not.toBe(plan.seed);
  });

  it("explains instead of throwing when the rules rule out every meal", async () => {
    user = store.seedUser({
      status: "active",
      rules: [
        { kind: "always", tags: ["fish"] },
        { kind: "never", tags: ["halal"] },
      ],
    });

    const result = await regeneratePlan(store, user, NOW);

    expect(result).toEqual({ ok: false, message: expect.stringContaining("rule out every meal") });
  });
});
