import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmailSender } from "@/lib/email/fake";
import { FakeWhatsAppClient } from "@/lib/whatsapp/fake";
import type { InboundEvent } from "@/lib/whatsapp/inbound";
import { REPLY_IDS } from "./commands";
import { handleInbound, type BotDeps } from "./handler";
import { MemoryBotStore } from "./memory-store";
import { emptyDraft } from "./onboarding";

beforeAll(() => {
  process.env.CODE_PEPPER = "test-pepper";
});

const PHONE = "923001234567";
/** A Wednesday, 8pm in Karachi. */
const NOW = new Date("2026-09-23T15:00:00Z");

let store: MemoryBotStore;
let whatsapp: FakeWhatsAppClient;
let deps: BotDeps;
let userId: string;
let counter = 0;

beforeEach(() => {
  store = new MemoryBotStore();
  whatsapp = new FakeWhatsAppClient();
  deps = { store, whatsapp, email: new FakeEmailSender(), now: () => NOW };
  counter = 0;

  userId = store.seedUser({
    name: "Hammad",
    phone: PHONE,
    email: "cook@example.com",
    status: "active",
    timezone: "Asia/Karachi",
    onboarding: { step: "done", draft: emptyDraft() },
  }).id;
});

const event = (text: string, replyId?: string): InboundEvent => ({
  type: "message",
  messageId: `wamid.${++counter}`,
  from: PHONE,
  at: NOW,
  text,
  replyId,
});

const say = (text: string, replyId?: string) => handleInbound(event(text, replyId), deps);
const last = () => whatsapp.lastMessage as { text: string; buttons?: { id: string }[]; list?: unknown };

describe("commands", () => {
  it("builds the week on first ask and repeats the same one after", async () => {
    await say("plan");
    const first = last().text;

    expect(first).toContain("*WhatsForDinner* 🍽️");
    expect(first).toContain("Week of 21 Sep");
    expect(last().buttons?.map((button) => button.id)).toEqual(["today", "swap", "ack"]);

    await say("plan");
    expect(last().text).toBe(first);
  });

  it("answers today and tomorrow from that week's plan", async () => {
    await say("tonight");
    expect(last().text).toMatch(/^Tonight: \*.+\* 🍽️$/);

    await say("tomorrow");
    expect(last().text).toMatch(/^Tomorrow: \*.+\* 🍽️$/);
  });

  it("generates next week's plan when tomorrow crosses the week end", async () => {
    // Sunday night in Karachi, so "tomorrow" is Monday of the following week.
    await handleInbound(
      { ...(event("tomorrow") as Extract<InboundEvent, { type: "message" }>), at: new Date("2026-09-27T15:00:00Z") },
      deps,
    );

    expect(last().text).toMatch(/^Tomorrow: \*/);
    expect(await store.findPlan(userId, "2026-09-28")).toBeDefined();
  });

  it("offers each day of the week when swapping", async () => {
    await say("swap");

    const list = last().list as { rows: { id: string; title: string }[] };
    expect(list.rows).toHaveLength(7);
    expect(list.rows[0]).toMatchObject({ id: "swapday_2026-09-21", title: "Monday" });
  });

  it("suggests, re-suggests and then applies a swap", async () => {
    await say("plan");
    const before = (await store.findPlan(userId, "2026-09-21"))!;
    const friday = before.days.find((day) => day.date === "2026-09-25")!;

    await say("Friday", REPLY_IDS.swapDay("2026-09-25"));
    expect(last().text).toMatch(/^How about \*.+\* for Friday\?$/);
    const firstOffer = last().buttons![0].id;

    await say("🔄 Another", last().buttons![1].id);
    expect(last().buttons![0].id).not.toBe(firstOffer);

    const accept = last().buttons![0].id;
    await say("✅ Use this", accept);

    const after = (await store.findPlan(userId, "2026-09-21"))!;
    const swapped = after.days.find((day) => day.date === "2026-09-25")!;
    expect(swapped.mealId).not.toBe(friday.mealId);
    expect(last().text).toContain("Friday is now");
  });

  it("says so when nothing is left to suggest", async () => {
    await say("plan");
    store.seedUser({ id: "unused" });
    // Every meal that fits is already on the plan once the catalog is this small.
    store.mealsFor = async () => (await store.findPlan(userId, "2026-09-21"))!.days.map((day) => ({
      id: day.mealId,
      name: day.mealId,
      tags: [],
    }));

    await say("Friday", REPLY_IDS.swapDay("2026-09-25"));
    expect(last().text).toMatch(/run out of meals/);
  });

  it("describes the current delivery settings with a login link", async () => {
    await say("settings");

    expect(last().text).toContain("the week's plan");
    expect(last().text).toContain("I email it to you");
    expect(last().text).toMatch(/https:\/\/example\.test\/login\//);
  });

  it("hands out a login link", async () => {
    await say("login");
    expect(last().text).toMatch(/good for 15 minutes/);
  });

  it("pauses and resumes", async () => {
    await say("stop");
    expect(last().text).toMatch(/Paused/);
    expect(store.users.get(userId)!.status).toBe("inactive");

    await say("resume");
    expect(store.users.get(userId)!.status).toBe("active");
  });

  it("asks before deleting, then deletes", async () => {
    await say("delete my account");
    expect(last().text).toMatch(/no undo/);
    expect(store.users.has(userId)).toBe(true);

    await say("Delete everything", REPLY_IDS.deleteConfirm);
    expect(store.deleted).toEqual([userId]);
  });

  it("thanks a thumbs up and helps with anything else", async () => {
    await say("Looks good 👍", REPLY_IDS.ack);
    expect(last().text).toBe("Great 🍽️");

    await say("what's for dinner");
    expect(last().text).toMatch(/Here's what I can do/);
  });

  it("uses the user's own timezone for today", async () => {
    store.users.get(userId)!.timezone = "America/Toronto";
    await say("plan");

    // 15:00 UTC is still Wednesday in Toronto and Wednesday evening in Karachi,
    // so both land in the same week, but the date used comes from the user's zone.
    expect(last().text).toContain("Week of 21 Sep");
  });
});
