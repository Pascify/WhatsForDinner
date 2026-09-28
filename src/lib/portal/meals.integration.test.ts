import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, startMongo } from "@/test/mongo";
import { MongoBotStore } from "@/lib/bot/mongo-store";
import { SEED_MEALS } from "@/data/seedMeals";
import { ensureIndexes } from "@/lib/db/collections";
import { addMeal, catalogFor, setHidden } from "./meals";

let mongo: Awaited<ReturnType<typeof startMongo>>;
let userId: string;
const store = new MongoBotStore();

beforeAll(async () => {
  mongo = await startMongo();
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

beforeEach(async () => {
  await clearCollections();
  userId = (await store.createUser({ channel: "portal" })).id;
});

describe("the meal catalog", () => {
  it("starts as the seeded list, in alphabetical order", async () => {
    const catalog = await catalogFor(userId);

    expect(catalog).toHaveLength(SEED_MEALS.length);
    expect(catalog.every((meal) => !meal.hidden && !meal.own)).toBe(true);
    expect(catalog.map((meal) => meal.name)).toEqual(
      [...catalog.map((meal) => meal.name)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("hides a seeded meal without deleting it, and brings it back", async () => {
    await setHidden(userId, "chicken-karahi", true);

    const hidden = (await catalogFor(userId)).find((meal) => meal.id === "chicken-karahi");
    expect(hidden).toMatchObject({ hidden: true, name: "Chicken Karahi" });
    expect((await store.mealsFor(userId)).some((meal) => meal.id === "chicken-karahi")).toBe(false);

    await setHidden(userId, "chicken-karahi", false);
    expect((await store.mealsFor(userId)).some((meal) => meal.id === "chicken-karahi")).toBe(true);
  });

  it("keeps one override row however often a meal is toggled", async () => {
    await setHidden(userId, "chicken-karahi", true);
    await setHidden(userId, "chicken-karahi", false);
    await setHidden(userId, "chicken-karahi", true);

    const entries = (await catalogFor(userId)).filter((meal) => meal.id === "chicken-karahi");
    expect(entries).toHaveLength(1);
  });

  it("adds a meal of your own with an id derived from the name", async () => {
    await addMeal(userId, "  Nihari Night  ", ["beef", "gravy"]);

    const added = (await catalogFor(userId)).find((meal) => meal.own);
    expect(added).toMatchObject({ name: "Nihari Night", tags: ["beef", "gravy"], hidden: false });
    expect(added!.id).toMatch(/^nihari-night-[0-9a-f]{4}$/);

    expect(await store.mealsFor(userId)).toHaveLength(SEED_MEALS.length + 1);
  });

  it("keeps two meals with the same name apart", async () => {
    await addMeal(userId, "Leftovers", []);
    await addMeal(userId, "Leftovers", []);

    const mine = (await catalogFor(userId)).filter((meal) => meal.own);
    expect(mine).toHaveLength(2);
    expect(mine[0].id).not.toBe(mine[1].id);
  });

  it("keeps one user's catalog out of another's", async () => {
    const other = (await store.createUser({ channel: "portal" })).id;

    await addMeal(userId, "Nihari Night", ["beef"]);
    await setHidden(userId, "chicken-karahi", true);

    const theirs = await catalogFor(other);
    expect(theirs.some((meal) => meal.own)).toBe(false);
    expect(theirs.find((meal) => meal.id === "chicken-karahi")!.hidden).toBe(false);
  });
});
