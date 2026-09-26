import { describe, expect, it } from "vitest";
import { SEED_MEALS } from "@/data/seedMeals";
import { generatePlan, suggestAlternative } from "./generate";
import { hashSeed } from "./rng";
import type { Meal, Rule } from "./types";

const WEEK = "2026-09-21"; // a Monday
const seed = hashSeed("user-1:2026-09-21");
const mealsById = new Map(SEED_MEALS.map((meal) => [meal.id, meal]));
const mealFor = (mealId: string) => mealsById.get(mealId) as Meal;

describe("generatePlan", () => {
  it("returns seven dated days starting from weekOf", () => {
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed });
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0].date).toBe("2026-09-21");
    expect(plan.days[6].date).toBe("2026-09-27");
  });

  it("is deterministic for the same seed and different for another", () => {
    const first = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed });
    const second = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed });
    const other = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed: seed + 1 });

    expect(second.days).toEqual(first.days);
    expect(other.days).not.toEqual(first.days);
  });

  it("does not repeat a meal within the week when the catalog is big enough", () => {
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed });
    const ids = plan.days.map((day) => day.mealId);
    expect(new Set(ids).size).toBe(7);
  });

  it("never breaks always/never rules", () => {
    const rules: Rule[] = [
      { kind: "always", tags: ["halal"] },
      { kind: "never", tags: ["beef", "mutton"] },
    ];
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, rules });

    for (const day of plan.days) {
      const meal = mealFor(day.mealId);
      expect(meal.tags).toContain("halal");
      expect(meal.tags).not.toContain("beef");
      expect(meal.tags).not.toContain("mutton");
    }
  });

  it("applies a day rule to the right weekday", () => {
    // Friday = rice + chicken
    const rules: Rule[] = [{ kind: "day", day: 5, tags: ["rice", "chicken"] }];
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, rules });
    const friday = plan.days.find((day) => day.date === "2026-09-25");

    const meal = mealFor(friday!.mealId);
    expect(meal.tags).toEqual(expect.arrayContaining(["rice", "chicken"]));
    expect(plan.relaxations).toHaveLength(0);
  });

  it("keeps a weekly maximum", () => {
    const rules: Rule[] = [{ kind: "quota", tags: ["pasta"], max: 1 }];
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, rules });
    const pastaDays = plan.days.filter((day) => mealFor(day.mealId).tags.includes("pasta"));
    expect(pastaDays.length).toBeLessThanOrEqual(1);
  });

  it("tops up a weekly minimum", () => {
    const rules: Rule[] = [{ kind: "quota", tags: ["healthy"], min: 4 }];
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, rules });
    const healthy = plan.days.filter((day) => mealFor(day.mealId).tags.includes("healthy"));
    expect(healthy.length).toBeGreaterThanOrEqual(4);
  });

  it("avoids meals served recently", () => {
    const history = Object.fromEntries(
      SEED_MEALS.slice(0, 20).map((meal) => [meal.id, "2026-09-20"]),
    );
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, history });
    const recent = plan.days.filter((day) => history[day.mealId]);
    expect(recent.length).toBeLessThanOrEqual(2);
  });

  it("keeps locked days untouched", () => {
    const locked = [{ date: "2026-09-23", mealId: "eat-out" }];
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, locked });
    const wednesday = plan.days.find((day) => day.date === "2026-09-23");

    expect(wednesday).toMatchObject({ mealId: "eat-out", locked: true });
    expect(plan.days.filter((day) => day.mealId === "eat-out")).toHaveLength(1);
  });

  it("explains itself when a day rule cannot be met", () => {
    const rules: Rule[] = [
      { kind: "day", day: 5, tags: ["pasta", "fish"] }, // no such meal exists
    ];
    const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, rules });
    expect(plan.relaxations).toEqual([
      { date: "2026-09-25", reason: "No meal left for the pasta + fish rule, so it was skipped" },
    ]);
  });

  it("repeats meals, with a note, when the catalog is tiny", () => {
    const tiny = SEED_MEALS.slice(0, 3);
    const plan = generatePlan({ meals: tiny, weekOf: WEEK, seed });

    expect(plan.days).toHaveLength(7);
    expect(plan.relaxations.length).toBeGreaterThan(0);
    expect(plan.relaxations[0].reason).toMatch(/repeated this week/);
  });

  it("throws when no meal can satisfy the hard rules", () => {
    const rules: Rule[] = [{ kind: "always", tags: ["pasta", "daal"] }];
    expect(() => generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed, rules })).toThrow(
      /No meals satisfy/,
    );
  });
});

describe("suggestAlternative", () => {
  const plan = generatePlan({ meals: SEED_MEALS, weekOf: WEEK, seed });

  it("offers a meal that is not already on the plan", () => {
    const onPlan = new Set(plan.days.map((day) => day.mealId));
    const suggestion = suggestAlternative({ meals: SEED_MEALS, plan, date: "2026-09-23" });

    expect(suggestion).toBeDefined();
    expect(onPlan.has(suggestion!.id)).toBe(false);
  });

  it("offers something different each time it is asked again", () => {
    const first = suggestAlternative({ meals: SEED_MEALS, plan, date: "2026-09-23" })!;
    const second = suggestAlternative({
      meals: SEED_MEALS,
      plan,
      date: "2026-09-23",
      rejected: [first.id],
      attempt: 1,
    })!;

    expect(second.id).not.toBe(first.id);
  });

  it("obeys hard rules and the day rule", () => {
    const rules: Rule[] = [
      { kind: "never", tags: ["beef"] },
      { kind: "day", day: 3, tags: ["rice"] }, // Wednesday
    ];
    const suggestion = suggestAlternative({ meals: SEED_MEALS, plan, rules, date: "2026-09-23" })!;

    expect(suggestion.tags).not.toContain("beef");
    expect(suggestion.tags).toContain("rice");
  });

  it("gives nothing when every meal is used up", () => {
    const tiny = SEED_MEALS.slice(0, 3);
    const tinyPlan = generatePlan({ meals: tiny, weekOf: WEEK, seed });
    expect(suggestAlternative({ meals: tiny, plan: tinyPlan, date: "2026-09-23" })).toBeUndefined();
  });
});
