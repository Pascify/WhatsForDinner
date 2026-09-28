import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, startMongo } from "@/test/mongo";
import { adminSettings, ensureIndexes, meals, users } from "@/lib/db/collections";
import { generatePlan } from "@/lib/plan/generate";
import { SEED_MEALS } from "@/data/seedMeals";
import { MongoBotStore } from "./mongo-store";
import { emptyDraft } from "./onboarding";

let mongo: Awaited<ReturnType<typeof startMongo>>;
let store: MongoBotStore;

beforeAll(async () => {
  mongo = await startMongo();
  await ensureIndexes();
  store = new MongoBotStore();
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

beforeEach(clearCollections);

const PHONE = "923001234567";
const plan = generatePlan({ meals: SEED_MEALS, weekOf: "2026-09-21", seed: 7 });

/** The same behaviour MemoryBotStore provides in unit tests, checked against a real database. */
describe("MongoBotStore", () => {
  it("creates a user that can be found by phone", async () => {
    const created = await store.createUser({ phone: PHONE, channel: "whatsapp" });

    const found = await store.findUserByPhone(PHONE);
    expect(found).toMatchObject({
      id: created.id,
      phone: PHONE,
      status: "inactive",
      onboarding: { step: "ask_name" },
      timezone: "Asia/Karachi",
    });
  });

  it("saves and reloads onboarding progress", async () => {
    const created = await store.createUser({ phone: PHONE, channel: "whatsapp" });
    const draft = { ...emptyDraft(), name: "Hammad", email: "cook@example.com" };

    await store.saveOnboarding(created.id, { step: "ask_diet", draft });

    const reloaded = await store.findUserByPhone(PHONE);
    expect(reloaded!.onboarding.step).toBe("ask_diet");
    expect(reloaded!.onboarding.draft.name).toBe("Hammad");
  });

  it("activates the account when onboarding finishes", async () => {
    const created = await store.createUser({ phone: PHONE, channel: "whatsapp" });
    const draft = {
      ...emptyDraft(),
      name: "Hammad",
      email: "cook@example.com",
      rules: [{ kind: "always" as const, tags: ["halal" as const] }],
    };

    await store.finishOnboarding(created.id, draft);

    const finished = await store.findUserByEmail("cook@example.com");
    expect(finished).toMatchObject({ status: "active", onboarding: { step: "done" } });
    expect(finished!.rules).toEqual(draft.rules);

    const doc = await (await users()).findOne({ _id: new ObjectId(created.id) });
    expect(doc!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(doc!.inactiveReason).toBeUndefined();
  });

  it("links a phone and records when the user last messaged", async () => {
    const created = await store.createUser({ channel: "portal" });
    const at = new Date("2026-09-26T12:00:00Z");

    await store.linkPhone(created.id, PHONE);
    await store.touchInbound(created.id, at);

    expect(await store.findUserByPhone(PHONE)).toMatchObject({ id: created.id, lastInboundAt: at });
  });

  describe("one-time codes", () => {
    it("accepts the right code once", async () => {
      const code = await store.issueOtp("cook@example.com", "signup");

      expect(await store.checkOtp("cook@example.com", code)).toEqual({ ok: true });
      expect(await store.checkOtp("cook@example.com", code)).toMatchObject({ ok: false });
    });

    it("reports when the newest code for the email went out", async () => {
      const first = new Date("2026-09-26T12:00:00Z");
      const second = new Date("2026-09-26T12:01:30Z");
      await store.issueOtp("resend@example.com", "signup", first);
      await store.issueOtp("resend@example.com", "signup", second);

      expect(await store.lastOtpAt("Resend@example.com", "signup")).toEqual(second);
      expect(await store.lastOtpAt("resend@example.com", "login")).toBeUndefined();
    });

    it("counts wrong attempts and locks after five", async () => {
      const code = await store.issueOtp("cook@example.com", "signup");

      for (let attempt = 0; attempt < 5; attempt++) {
        expect(await store.checkOtp("cook@example.com", "000000")).toMatchObject({
          reason: "wrong_code",
        });
      }

      expect(await store.checkOtp("cook@example.com", code)).toMatchObject({
        reason: "too_many_attempts",
      });
    });

    it("treats an unknown email as expired rather than saying it is unknown", async () => {
      expect(await store.checkOtp("nobody@example.com", "123456")).toMatchObject({
        reason: "expired",
      });
    });

    it("burns a login link the first time it is used", async () => {
      const created = await store.createUser({ channel: "portal" });
      const link = await store.issueLoginLink(created.id);
      const code = link.split("/").at(-1)!;

      expect(await store.consumeLinkCode(code)).toMatchObject({
        userId: created.id,
        purpose: "portal_login",
      });
      expect(await store.consumeLinkCode(code)).toBeUndefined();
    });
  });

  it("reports a repeated webhook delivery as already seen", async () => {
    expect(await store.seenMessage("wamid.1")).toBe(false);
    expect(await store.seenMessage("wamid.1")).toBe(true);
    expect(await store.seenMessage("wamid.2")).toBe(false);
  });

  describe("meals", () => {
    it("returns the seeded catalog for a new user", async () => {
      const created = await store.createUser({ channel: "portal" });
      expect(await store.mealsFor(created.id)).toHaveLength(SEED_MEALS.length);
    });

    it("drops a seeded meal the user hid and includes their own", async () => {
      const created = await store.createUser({ channel: "portal" });
      const ownerId = new ObjectId(created.id);

      await (
        await meals()
      ).insertMany([
        {
          _id: new ObjectId(),
          ownerId,
          id: "chicken-karahi",
          name: "Chicken Karahi",
          tags: [],
          hidden: true,
        },
        { _id: new ObjectId(), ownerId, id: "nihari-night", name: "Nihari Night", tags: ["beef"] },
      ]);

      const catalog = await store.mealsFor(created.id);
      expect(catalog.some((meal) => meal.id === "chicken-karahi")).toBe(false);
      expect(catalog.some((meal) => meal.id === "nihari-night")).toBe(true);
      expect(catalog).toHaveLength(SEED_MEALS.length);
    });
  });

  describe("plans and history", () => {
    it("saves a plan, reads it back and records history", async () => {
      const created = await store.createUser({ channel: "portal" });
      await store.savePlan(created.id, plan);

      const reloaded = await store.findPlan(created.id, "2026-09-21");
      expect(reloaded!.days).toHaveLength(7);
      expect(reloaded!.seed).toBe(plan.seed);

      const history = await store.historyFor(created.id);
      expect(history[plan.days[0].mealId]).toBe(plan.days[0].date);
    });

    it("replaces a single day and keeps the rest", async () => {
      const created = await store.createUser({ channel: "portal" });
      await store.savePlan(created.id, plan);

      await store.setPlanDay(created.id, "2026-09-21", "2026-09-23", "eat-out");

      const updated = await store.findPlan(created.id, "2026-09-21");
      expect(updated!.days.find((day) => day.date === "2026-09-23")!.mealId).toBe("eat-out");
      expect(updated!.days.find((day) => day.date === "2026-09-22")!.mealId).toBe(
        plan.days[1].mealId,
      );
    });

    it("saving the same week twice updates rather than duplicating", async () => {
      const created = await store.createUser({ channel: "portal" });
      await store.savePlan(created.id, plan);
      await store.savePlan(created.id, { ...plan, seed: 99 });

      expect((await store.findPlan(created.id, "2026-09-21"))!.seed).toBe(99);
    });

    it("tracks a plan as pending until it is delivered", async () => {
      const created = await store.createUser({ channel: "portal" });
      await store.savePlan(created.id, plan);

      expect(await store.findPendingPlan(created.id)).toMatchObject({ weekOf: "2026-09-21" });

      await store.markPlanDelivered(created.id, "2026-09-21", "email");
      expect(await store.findPendingPlan(created.id)).toBeUndefined();
    });
  });

  describe("paid budget", () => {
    it("starts with a default the owner can change", async () => {
      expect(await store.paidBudget()).toEqual({ cap: 50, sentThisMonth: 0, killSwitch: false });
    });

    it("counts paid sends", async () => {
      await store.paidBudget();
      await store.recordPaidSend();
      await store.recordPaidSend();

      expect(await store.paidBudget()).toMatchObject({ sentThisMonth: 2 });
    });

    it("starts the count again in a new month", async () => {
      await store.paidBudget();
      await store.recordPaidSend();
      await (
        await adminSettings()
      ).updateOne({ _id: "admin" }, { $set: { countingMonth: "2020-01" } });

      expect(await store.paidBudget()).toMatchObject({ sentThisMonth: 0 });

      await store.recordPaidSend();
      expect(await store.paidBudget()).toMatchObject({ sentThisMonth: 1 });
    });
  });

  describe("the hourly job's candidate list", () => {
    it("includes only active automatic accounts with a phone", async () => {
      const auto = await store.createUser({ phone: PHONE, channel: "whatsapp" });
      await store.finishOnboarding(auto.id, { ...emptyDraft(), email: "auto@example.com" });

      const paused = await store.createUser({ phone: "923009999999", channel: "whatsapp" });
      await store.finishOnboarding(paused.id, { ...emptyDraft(), email: "paused@example.com" });
      await store.setPaused(paused.id, true);

      const noPhone = await store.createUser({ channel: "portal" });
      await store.finishOnboarding(noPhone.id, { ...emptyDraft(), email: "web@example.com" });

      const due = await store.activeAutoUsers();
      expect(due.map((user) => user.id)).toEqual([auto.id]);
    });

    it("brings a paused account back", async () => {
      const created = await store.createUser({ phone: PHONE, channel: "whatsapp" });
      await store.finishOnboarding(created.id, { ...emptyDraft(), email: "cook@example.com" });

      await store.setPaused(created.id, true);
      await store.setPaused(created.id, false);

      const doc = await (await users()).findOne({ _id: new ObjectId(created.id) });
      expect(doc).toMatchObject({ status: "active" });
      expect(doc!.inactiveReason).toBeUndefined();
    });
  });

  it("deletes an account with its plans, history and meals", async () => {
    const created = await store.createUser({ phone: PHONE, channel: "whatsapp" });
    await store.savePlan(created.id, plan);
    await (
      await meals()
    ).insertOne({
      _id: new ObjectId(),
      ownerId: new ObjectId(created.id),
      id: "mine",
      name: "Mine",
      tags: [],
    });

    await store.deleteUser(created.id);

    expect(await store.findUserByPhone(PHONE)).toBeUndefined();
    expect(await store.findPlan(created.id, "2026-09-21")).toBeUndefined();
    expect(await store.historyFor(created.id)).toEqual({});
    expect(await store.mealsFor(created.id)).toHaveLength(SEED_MEALS.length);
  });
});

describe("accounts without a phone", () => {
  it("allows more than one, since the field must stay unset rather than null", async () => {
    const first = await store.createUser({ channel: "portal" });
    const second = await store.createUser({ channel: "portal" });

    expect(first.id).not.toBe(second.id);
    const doc = await (await users()).findOne({ _id: new ObjectId(first.id) });
    expect(Object.hasOwn(doc!, "phone")).toBe(false);
  });
});
