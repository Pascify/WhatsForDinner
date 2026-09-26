import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryBotStore } from "@/lib/bot/memory-store";
import { emptyDraft } from "@/lib/bot/onboarding";
import type { BotUser } from "@/lib/bot/store";
import { FakeEmailSender } from "@/lib/email/fake";
import { generatePlan } from "@/lib/plan/generate";
import { SEED_MEALS } from "@/data/seedMeals";
import { FakeWhatsAppClient } from "@/lib/whatsapp/fake";
import { deliverPending, deliverPlan, type DeliveryDeps } from "./service";

beforeAll(() => {
  process.env.CODE_PEPPER = "test-pepper";
});

const NOW = new Date("2026-09-26T12:00:00Z");
const plan = generatePlan({ meals: SEED_MEALS, weekOf: "2026-09-21", seed: 42 });

let store: MemoryBotStore;
let whatsapp: FakeWhatsAppClient;
let email: FakeEmailSender;
let deps: DeliveryDeps;

const makeUser = (over: Partial<BotUser> = {}): BotUser =>
  store.seedUser({
    name: "Hammad",
    phone: "923001234567",
    email: "cook@example.com",
    status: "active",
    timezone: "Asia/Karachi",
    onboarding: { step: "done", draft: emptyDraft() },
    ...over,
  });

beforeEach(() => {
  store = new MemoryBotStore();
  whatsapp = new FakeWhatsAppClient();
  email = new FakeEmailSender();
  deps = { store, whatsapp, email };
});

describe("deliverPlan", () => {
  it("sends free over WhatsApp when the window is open", async () => {
    const user = makeUser({ lastInboundAt: new Date(NOW.getTime() - 3_600_000) });
    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ channel: "whatsapp_service", paid: false, sent: true });
    expect(whatsapp.lastMessage).toMatchObject({ kind: "text" });
    expect(whatsapp.texts()[0]).toContain("*WhatsForDinner* 🍽️");
    expect(email.sent).toHaveLength(0);
    expect(store.budget.sentThisMonth).toBe(0);
  });

  it("emails when the window is shut and that is the choice", async () => {
    const user = makeUser();
    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ channel: "email", paid: false, sent: true });
    expect(email.sent[0].subject).toBe("Your dinner plan for the week of 21 Sep");
    expect(whatsapp.sent).toHaveLength(0);
  });

  it("leaves the plan pending when the user asked to be left alone", async () => {
    const user = makeUser({
      delivery: { ...structuredClone(makeUser().delivery), whenClosed: "wait" },
    });
    await store.savePlan(user.id, plan);

    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ channel: "wait", sent: false });
    expect(whatsapp.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
    expect(await store.findPendingPlan(user.id)).toBeDefined();
    expect(store.deliveryLog).toHaveLength(0);
  });

  it("sends the paid template only for users who opted in, and counts it", async () => {
    const base = makeUser();
    const user = makeUser({ delivery: { ...base.delivery, whenClosed: "whatsapp" } });

    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ channel: "whatsapp_template", paid: true, sent: true });
    expect(whatsapp.lastMessage).toMatchObject({
      kind: "template",
      template: { name: "whatsfordinner_weekly", language: "en" },
    });
    expect(store.budget.sentThisMonth).toBe(1);
    expect(store.deliveryLog.at(-1)).toMatchObject({ channel: "whatsapp_template", paid: true });
  });

  it("passes the week and seven meals to the template", async () => {
    const base = makeUser();
    const user = makeUser({ delivery: { ...base.delivery, whenClosed: "whatsapp" } });
    await deliverPlan(user, plan, "weekly", deps, NOW);

    const sent = whatsapp.lastMessage as { template: { variables: string[] } };
    expect(sent.template.variables).toHaveLength(8);
    expect(sent.template.variables[0]).toBe("21 Sep");
  });

  it("falls back to email instead of paying once the cap is reached", async () => {
    store.budget = { cap: 2, sentThisMonth: 2, killSwitch: false };
    const base = makeUser();
    const user = makeUser({ delivery: { ...base.delivery, whenClosed: "whatsapp" } });

    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ channel: "email", paid: false, sent: true });
    expect(outcome.reason).toContain("monthly cap");
    expect(store.budget.sentThisMonth).toBe(2);
  });

  it("re-decides when Meta says the window closed mid-send", async () => {
    const user = makeUser({ lastInboundAt: new Date(NOW.getTime() - 3_600_000) });
    whatsapp.failNext({ ok: false, error: "closed", code: 131047, retryable: false });

    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ channel: "email", sent: true });
    expect(email.sent).toHaveLength(1);
  });

  it("records a failed send without marking the plan delivered", async () => {
    const user = makeUser({ lastInboundAt: new Date(NOW.getTime() - 3_600_000) });
    await store.savePlan(user.id, plan);
    whatsapp.failNext({ ok: false, error: "Meta rate limit reached.", code: 4, retryable: true });

    const outcome = await deliverPlan(user, plan, "weekly", deps, NOW);

    expect(outcome).toMatchObject({ sent: false, error: "Meta rate limit reached." });
    expect(store.deliveryLog.at(-1)).toMatchObject({ paid: false });
    expect(await store.findPendingPlan(user.id)).toBeDefined();
  });

  it("sends only tonight's meal for a daily reminder", async () => {
    const user = makeUser({ lastInboundAt: NOW });
    await deliverPlan(user, plan, "daily", deps, NOW);

    const text = whatsapp.texts()[0];
    expect(text).toMatch(/^Tonight: \*/);
    expect(text).not.toContain("Week of");
  });

  it("marks the plan delivered so it stops being pending", async () => {
    const user = makeUser({ lastInboundAt: NOW });
    await store.savePlan(user.id, plan);

    await deliverPlan(user, plan, "weekly", deps, NOW);
    expect(await store.findPendingPlan(user.id)).toBeUndefined();
  });
});

describe("deliverPending", () => {
  it("delivers a waiting plan for free once the user messages", async () => {
    const user = makeUser({ lastInboundAt: NOW });
    await store.savePlan(user.id, plan);

    const outcome = await deliverPending(user, deps, NOW);

    expect(outcome).toMatchObject({ channel: "whatsapp_service", sent: true, paid: false });
    expect(await store.findPendingPlan(user.id)).toBeUndefined();
  });

  it("does nothing when there is nothing waiting", async () => {
    const user = makeUser({ lastInboundAt: NOW });
    expect(await deliverPending(user, deps, NOW)).toBeUndefined();
    expect(whatsapp.sent).toHaveLength(0);
  });
});
