import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, startMongo } from "@/test/mongo";
import { ensureIndexes, sessions, users } from "@/lib/db/collections";
import { DEFAULT_DELIVERY, type UserDoc } from "@/lib/db/types";
import { createSession, deleteSession, generateSessionToken, userForToken } from "./session-store";

let mongo: Awaited<ReturnType<typeof startMongo>>;

beforeAll(async () => {
  mongo = await startMongo();
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

beforeEach(clearCollections);

async function makeUser(email = "cook@example.com") {
  const doc: UserDoc = {
    _id: new ObjectId(),
    email,
    status: "active",
    role: "user",
    timezone: "Asia/Karachi",
    onboarding: { step: "done", channel: "portal" },
    rules: [],
    delivery: structuredClone(DEFAULT_DELIVERY),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await (await users()).insertOne(doc);
  return doc._id.toHexString();
}

describe("sessions", () => {
  it("generates long, unique tokens", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));

    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("returns the account behind a token", async () => {
    const userId = await makeUser();
    const token = await createSession(userId);

    const found = await userForToken(token);
    expect(found?._id.toHexString()).toBe(userId);
  });

  it("never stores the token itself", async () => {
    const token = await createSession(await makeUser());

    const stored = await (await sessions()).findOne({});
    expect(stored!.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("refuses an unknown or tampered token", async () => {
    const token = await createSession(await makeUser());

    expect(await userForToken("not-a-token")).toBeUndefined();
    expect(await userForToken(`${token}x`)).toBeUndefined();
  });

  it("refuses a token past its expiry", async () => {
    const userId = await makeUser();
    const token = await createSession(userId, new Date("2026-01-01T00:00:00Z"));

    expect(await userForToken(token, new Date("2026-01-15T00:00:00Z"))).toBeDefined();
    expect(await userForToken(token, new Date("2026-03-01T00:00:00Z"))).toBeUndefined();
  });

  it("logging out kills only that session", async () => {
    const userId = await makeUser();
    const phone = await createSession(userId);
    const laptop = await createSession(userId);

    await deleteSession(phone);

    expect(await userForToken(phone)).toBeUndefined();
    expect(await userForToken(laptop)).toBeDefined();
  });

  it("does not resurrect a session whose account is gone", async () => {
    const userId = await makeUser();
    const token = await createSession(userId);
    await (await users()).deleteOne({ _id: new ObjectId(userId) });

    expect(await userForToken(token)).toBeUndefined();
  });
});
