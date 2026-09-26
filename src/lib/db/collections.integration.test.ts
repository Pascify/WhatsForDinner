import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, startMongo } from "@/test/mongo";
import { DEFAULT_DELIVERY, type UserDoc } from "./types";
import { ensureIndexes, linkCodes, mealPlans, otpCodes, sessions, users } from "./collections";

let mongo: Awaited<ReturnType<typeof startMongo>>;

beforeAll(async () => {
  mongo = await startMongo();
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

beforeEach(clearCollections);

const user = (over: Partial<UserDoc> = {}): UserDoc => ({
  _id: new ObjectId(),
  status: "active",
  role: "user",
  timezone: "Asia/Karachi",
  onboarding: { step: "done", channel: "portal" },
  rules: [],
  delivery: structuredClone(DEFAULT_DELIVERY),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("indexes", () => {
  it("can be created twice without complaining", async () => {
    await expect(ensureIndexes()).resolves.toBeUndefined();
  });

  it("allows only one account per email", async () => {
    const collection = await users();
    await collection.insertOne(user({ email: "cook@example.com" }));

    await expect(collection.insertOne(user({ email: "cook@example.com" }))).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("allows only one account per phone", async () => {
    const collection = await users();
    await collection.insertOne(user({ phone: "923001234567" }));

    await expect(collection.insertOne(user({ phone: "923001234567" }))).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("still allows many accounts with neither set, which half-finished sign-ups need", async () => {
    const collection = await users();
    await collection.insertOne(user());
    await collection.insertOne(user());

    expect(await collection.countDocuments({})).toBe(2);
  });

  it("allows only one plan per user and week", async () => {
    const userId = new ObjectId();
    const collection = await mealPlans();
    const plan = {
      userId,
      weekOf: "2026-09-21",
      days: [],
      relaxations: [],
      seed: 1,
      status: "pending" as const,
      createdAt: new Date(),
    };

    await collection.insertOne({ _id: new ObjectId(), ...plan });
    await expect(collection.insertOne({ _id: new ObjectId(), ...plan })).rejects.toThrow(
      /duplicate key/,
    );

    // A different week is fine.
    await collection.insertOne({ _id: new ObjectId(), ...plan, weekOf: "2026-09-28" });
    expect(await collection.countDocuments({ userId })).toBe(2);
  });

  it("puts a TTL index on everything that should expire", async () => {
    const collections = await Promise.all([otpCodes(), linkCodes(), sessions()]);

    for (const collection of collections) {
      const indexes = await collection.indexes();
      const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

      expect(ttl, `${collection.collectionName} needs a TTL index`).toBeDefined();
      expect(ttl!.key).toEqual({ expiresAt: 1 });
      expect(ttl!.expireAfterSeconds).toBe(0);
    }
  });
});
