import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, startMongo } from "@/test/mongo";
import { deliveries, ensureIndexes, mealPlans, users } from "@/lib/db/collections";
import { FakeEmailSender } from "@/lib/email/fake";
import { FakeWhatsAppClient } from "@/lib/whatsapp/fake";
import type { InboundEvent } from "@/lib/whatsapp/inbound";
import { runTick } from "@/lib/delivery/schedule";
import { handleInbound, type BotDeps } from "./handler";
import { MongoBotStore } from "./mongo-store";

let mongo: Awaited<ReturnType<typeof startMongo>>;
let whatsapp: FakeWhatsAppClient;
let email: FakeEmailSender;
let deps: BotDeps;
let counter = 0;

const PHONE = "923001234567";
/** Wednesday, 8pm in Karachi. */
const NOW = new Date("2026-09-23T15:00:00Z");

beforeAll(async () => {
  mongo = await startMongo();
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

beforeEach(async () => {
  await clearCollections();
  whatsapp = new FakeWhatsAppClient();
  email = new FakeEmailSender();
  deps = { store: new MongoBotStore(), whatsapp, email };
  counter = 0;
});

const event = (text: string, replyId?: string, at = NOW): InboundEvent => ({
  type: "message",
  messageId: `wamid.${++counter}`,
  from: PHONE,
  at,
  text,
  replyId,
});

const say = (text: string, replyId?: string, at?: Date) =>
  handleInbound(event(text, replyId, at), deps);
const lastText = () => whatsapp.texts().at(-1) ?? "";

/** Signs up the way a real person would, one WhatsApp message at a time. */
async function signUp() {
  await say("Hi");
  await say("Hammad");
  await say("cook@example.com");
  await say(email.lastCode()!);
  await say("Yes", "diet_both");
  await say("Yes", "halal_yes");
  await say("no beef");
  await say("Skip", "day_skip");
  await say("Weekly plan", "mode_weekly");
  await say("Email me", "closed_email");
}

describe("signing up over WhatsApp, against a real database", () => {
  it("creates an active account, a plan and a free delivery", async () => {
    await signUp();

    const account = await (await users()).findOne({ phone: PHONE });
    expect(account).toMatchObject({
      name: "Hammad",
      email: "cook@example.com",
      status: "active",
      onboarding: { step: "done", channel: "whatsapp" },
    });
    expect(account!.rules).toEqual([
      { kind: "always", tags: ["halal"] },
      { kind: "never", tags: ["beef"] },
    ]);

    // The first plan arrives free, because they just messaged us.
    const plan = await (await mealPlans()).findOne({ userId: account!._id });
    expect(plan).toMatchObject({
      weekOf: "2026-09-21",
      status: "delivered",
      deliveredVia: "service",
    });
    expect(lastText()).toContain("*WhatsForDinner* 🍽️");

    const log = await (await deliveries()).find({}).toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ channel: "whatsapp_service", paid: false });
  });

  it("survives Meta delivering the same message twice", async () => {
    const hello = event("Hi");
    await handleInbound(hello, deps);
    await handleInbound(hello, deps);

    expect(whatsapp.sent).toHaveLength(1);
    expect(await (await users()).countDocuments({})).toBe(1);
  });

  it("picks up where it stopped when someone comes back later", async () => {
    await say("Hi");
    await say("Hammad");

    const halfway = await (await users()).findOne({ phone: PHONE });
    expect(halfway).toMatchObject({
      status: "inactive",
      inactiveReason: "onboarding_incomplete",
      onboarding: { step: "ask_email" },
    });

    const nextDay = new Date("2026-09-24T15:00:00Z");
    await say("cook@example.com", undefined, nextDay);
    expect(lastText()).toMatch(/6-digit code/);

    await say(email.lastCode()!, undefined, nextDay);
    expect(lastText()).toMatch(/Do you eat meat/);
  });

  it("answers commands once the account exists", async () => {
    await signUp();

    await say("today");
    expect(lastText()).toMatch(/^Tonight: \*/);

    await say("swap");
    const list = whatsapp.lastMessage as { list?: { rows: unknown[] } };
    expect(list.list!.rows).toHaveLength(7);
  });

  it("delivers a waiting plan the moment the user messages again", async () => {
    await signUp();

    // A week later the hourly job runs while the window is shut, so it emails instead.
    const saturday = new Date("2026-09-26T13:00:00Z");
    const summary = await runTick(deps, saturday);
    expect(summary).toMatchObject({ sent: 1 });
    expect(email.sent.at(-1)!.subject).toContain("week of 28 Sep");

    // Switch them to waiting, generate another week, then have them message.
    const account = await (await users()).findOne({ phone: PHONE });
    await (
      await users()
    ).updateOne({ _id: account!._id }, { $set: { "delivery.whenClosed": "wait" } });

    const nextSaturday = new Date("2026-10-03T13:00:00Z");
    expect(await runTick(deps, nextSaturday)).toMatchObject({ sent: 0, waiting: 1 });

    const pending = await (await mealPlans()).findOne({ weekOf: "2026-10-05" });
    expect(pending).toMatchObject({ status: "pending" });

    await say("plan", undefined, new Date("2026-10-04T10:00:00Z"));

    expect(await (await mealPlans()).findOne({ weekOf: "2026-10-05" })).toMatchObject({
      status: "delivered",
      deliveredVia: "service",
    });
    expect(
      whatsapp.texts().filter((text) => text.includes("Week of 5 Oct")).length,
    ).toBeGreaterThan(0);
  });

  it("stops and resumes without losing the account", async () => {
    await signUp();

    await say("stop");
    expect(await (await users()).findOne({ phone: PHONE })).toMatchObject({
      status: "inactive",
      inactiveReason: "paused",
    });
    expect(await runTick(deps, new Date("2026-09-26T13:00:00Z"))).toMatchObject({ considered: 0 });

    await say("resume");
    expect(await (await users()).findOne({ phone: PHONE })).toMatchObject({ status: "active" });
  });
});
