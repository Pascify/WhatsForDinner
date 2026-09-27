import { describe, expect, it } from "vitest";
import { SEED_MEALS } from "@/data/seedMeals";
import { formatDay, formatPlan, swapRows, templateVariables } from "./format";
import type { Plan } from "./types";
import { addDays, localDateISO, localHour, shortDate, startOfWeek } from "./week";

const byId = new Map(SEED_MEALS.map((meal) => [meal.id, meal]));
const lookup = (id: string) => byId.get(id);

const plan: Plan = {
  weekOf: "2026-09-21",
  seed: 1,
  relaxations: [],
  days: [
    { date: "2026-09-21", mealId: "chicken-karahi" },
    { date: "2026-09-22", mealId: "masoor-daal" },
    { date: "2026-09-23", mealId: "eat-out", locked: true },
    { date: "2026-09-24", mealId: "chow-mein" },
    { date: "2026-09-25", mealId: "chicken-biryani" },
    { date: "2026-09-26", mealId: "beef-burgers" },
    { date: "2026-09-27", mealId: "palak-paneer" },
  ],
};

describe("week helpers", () => {
  it("reads the local date and hour for a timezone", () => {
    const at = new Date("2026-09-26T20:30:00Z");
    expect(localDateISO(at, "Asia/Karachi")).toBe("2026-09-27"); // already tomorrow there
    expect(localDateISO(at, "America/Toronto")).toBe("2026-09-26");
    expect(localHour(at, "Asia/Karachi")).toBe(1);
    expect(localHour(at, "UTC")).toBe(20);
  });

  it("finds the start of the week either way", () => {
    expect(startOfWeek("2026-09-24", 1)).toBe("2026-09-21"); // Monday
    expect(startOfWeek("2026-09-24", 0)).toBe("2026-09-20"); // Sunday
    expect(startOfWeek("2026-09-21", 1)).toBe("2026-09-21");
  });

  it("moves across month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(shortDate("2026-09-21")).toBe("21 Sep");
  });
});

describe("formatting", () => {
  it("lays out the week", () => {
    expect(formatPlan(plan, lookup)).toBe(
      "*WhatsForDinner* 🍽️\nWeek of 21 Sep\n\n" +
        "Mon — Chicken Karahi\n" +
        "Tue — Masoor Daal\n" +
        "Wed — Eat Out / Takeaway 📌\n" +
        "Thu — Chow Mein\n" +
        "Fri — Chicken Biryani\n" +
        "Sat — Homemade Beef Burgers\n" +
        "Sun — Palak Paneer",
    );
  });

  it("adds a note when a rule had to give way", () => {
    const relaxed = { ...plan, relaxations: [{ date: "2026-09-25", reason: "No biryani left" }] };
    expect(formatPlan(relaxed, lookup)).toContain("_No biryani left_");
  });

  it("formats a single day", () => {
    expect(formatDay(plan, "2026-09-22", lookup)).toBe("Tuesday: *Masoor Daal* 🍽️");
    expect(formatDay(plan, "2026-09-22", lookup, "Tonight")).toBe("Tonight: *Masoor Daal* 🍽️");
    expect(formatDay(plan, "2026-10-01", lookup)).toMatch(/don't have a plan/);
  });

  it("falls back when a meal was deleted", () => {
    const missing = { ...plan, days: [{ date: "2026-09-21", mealId: "gone" }] };
    expect(formatPlan(missing, lookup)).toContain("Something tasty");
  });

  it("builds swap rows and template variables", () => {
    const rows = swapRows(plan, lookup);
    expect(rows[0]).toEqual({
      id: "swapday_2026-09-21",
      title: "Monday",
      description: "Chicken Karahi",
    });

    const variables = templateVariables(plan, lookup);
    expect(variables).toHaveLength(8);
    expect(variables[0]).toBe("21 Sep");
    expect(variables[1]).toBe("Chicken Karahi");
  });
});
