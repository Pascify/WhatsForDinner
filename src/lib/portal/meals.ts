import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { SEED_MEALS } from "@/data/seedMeals";
import { meals as mealsCollection } from "@/lib/db/collections";
import type { Meal, Tag } from "@/lib/plan/types";

export type CatalogEntry = Meal & { own: boolean; hidden: boolean };

/** The seeded catalog plus the user's own meals, each marked as hidden or not. */
export async function catalogFor(userId: string): Promise<CatalogEntry[]> {
  const own = await (await mealsCollection()).find({ ownerId: new ObjectId(userId) }).toArray();
  const hidden = new Map(own.map((meal) => [meal.id, meal.hidden ?? false]));

  const seeded: CatalogEntry[] = SEED_MEALS.map((meal) => ({
    ...meal,
    own: false,
    hidden: hidden.get(meal.id) ?? false,
  }));

  const added: CatalogEntry[] = own
    .filter((meal) => !SEED_MEALS.some((seed) => seed.id === meal.id))
    .map((meal) => ({ id: meal.id, name: meal.name, tags: meal.tags, own: true, hidden: meal.hidden ?? false }));

  return [...seeded, ...added].sort((a, b) => a.name.localeCompare(b.name));
}

/** Hiding a seeded meal stores a small override row rather than copying the whole meal. */
export async function setHidden(userId: string, mealId: string, hidden: boolean): Promise<void> {
  const ownerId = new ObjectId(userId);
  const seeded = SEED_MEALS.find((meal) => meal.id === mealId);

  await (await mealsCollection()).updateOne(
    { ownerId, id: mealId },
    {
      $set: { hidden },
      $setOnInsert: {
        _id: new ObjectId(),
        ownerId,
        id: mealId,
        name: seeded?.name ?? mealId,
        tags: seeded?.tags ?? [],
      },
    },
    { upsert: true },
  );
}

const DUPLICATE_KEY = 11000;

const slugFor = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "meal"}-${randomBytes(2).toString("hex")}`;

/** The suffix is random, not time-based: two meals added in the same millisecond must not clash. */
export async function addMeal(userId: string, name: string, tags: Tag[]): Promise<void> {
  const collection = await mealsCollection();
  const ownerId = new ObjectId(userId);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await collection.insertOne({
        _id: new ObjectId(),
        ownerId,
        id: slugFor(name),
        name: name.trim().slice(0, 60),
        tags,
      });
      return;
    } catch (error) {
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
    }
  }

  throw new Error("Could not find a free id for that meal");
}
