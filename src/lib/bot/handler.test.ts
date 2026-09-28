import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmailSender } from "@/lib/email/fake";
import { FakeWhatsAppClient } from "@/lib/whatsapp/fake";
import type { InboundEvent } from "@/lib/whatsapp/inbound";
import { handleInbound, type BotDeps } from "./handler";
import { MemoryBotStore } from "./memory-store";
import { emptyDraft } from "./onboarding";

beforeAll(() => {
  process.env.CODE_PEPPER = "test-pepper";
});

const PHONE = "923001234567";
const NOW = new Date("2026-09-26T12:00:00Z");
let store: MemoryBotStore;
let whatsapp: FakeWhatsAppClient;
let email: FakeEmailSender;
let deps: BotDeps;
let counter = 0;

beforeEach(() => {
  store = new MemoryBotStore();
  whatsapp = new FakeWhatsAppClient();
  email = new FakeEmailSender();
  deps = { store, whatsapp, email, now: () => NOW };
  counter = 0;
});

const incoming = (text: string, replyId?: string): InboundEvent => ({
  type: "message",
  messageId: `wamid.${++counter}`,
  from: PHONE,
  at: NOW,
  text,
  replyId,
});

const say = (text: string, replyId?: string) => handleInbound(incoming(text, replyId), deps);
const lastText = () => whatsapp.texts().at(-1) ?? "";

describe("handleInbound", () => {
  it("greets an unknown number and starts onboarding", async () => {
    await say("Hi");

    expect(lastText()).toMatch(/Welcome to WhatsForDinner/);
    expect(await store.findUserByPhone(PHONE)).toMatchObject({
      phone: PHONE,
      onboarding: { step: "ask_name" },
    });
  });

  it("ignores a message Meta delivers twice", async () => {
    const event = incoming("Hi");
    await handleInbound(event, deps);
    await handleInbound(event, deps);

    expect(whatsapp.sent).toHaveLength(1);
    expect(store.users.size).toBe(1);
  });

  it("walks a new user all the way through sign-up", async () => {
    await say("Hi");
    await say("Hammad");
    await say("cook@example.com");

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("cook@example.com");
    expect(email.lastCode()).toMatch(/^\d{6}$/);

    await say(email.lastCode()!);
    expect(lastText()).toMatch(/Do you eat meat/);

    await say("Yes", "diet_both");
    await say("Yes", "halal_yes");
    await say("no beef", "");
    await say("Skip", "day_skip");
    await say("Weekly plan", "mode_weekly");
    await say("Email me", "closed_email");

    const user = await store.findUserByPhone(PHONE);
    expect(user).toMatchObject({
      name: "Hammad",
      email: "cook@example.com",
      status: "active",
      onboarding: { step: "done" },
    });
    expect(user!.rules).toEqual([
      { kind: "always", tags: ["halal"] },
      { kind: "never", tags: ["beef"] },
    ]);
    expect(user!.delivery).toMatchObject({ weekly: { enabled: true }, whenClosed: "email" });
  });

  it("rejects a wrong code and accepts the right one", async () => {
    await say("Hi");
    await say("Hammad");
    await say("cook@example.com");

    await say("000000");
    expect(lastText()).toMatch(/didn't work/);
    expect((await store.findUserByPhone(PHONE))!.onboarding.step).toBe("verify_email");

    await say(email.lastCode()!);
    expect(lastText()).toMatch(/Do you eat meat/);
  });

  it("ignores a backlog Meta replays long after it was sent", async () => {
    await handleInbound({ ...incoming("Hi"), at: new Date(NOW.getTime() - 60 * 60_000) }, deps);

    expect(whatsapp.sent).toHaveLength(0);
    expect(store.users.size).toBe(0);
  });

  it("answers only one of several messages handled in parallel", async () => {
    await say("Hi");
    await Promise.all([say("hi"), say("hi"), say("hi")]);

    expect(whatsapp.texts().filter((text) => /What's your email/.test(text))).toHaveLength(1);
    expect((await store.findUserByPhone(PHONE))!.onboarding).toMatchObject({
      step: "ask_email",
      draft: { name: "hi" },
    });
  });

  it("creates one account when a new number's first messages arrive in parallel", async () => {
    await Promise.all([say("Hi"), say("Hi")]);

    expect(store.users.size).toBe(1);
    expect(whatsapp.texts().filter((text) => /Welcome/.test(text))).toHaveLength(1);
  });

  it("starts onboarding over when the user types r", async () => {
    await say("Hi");
    await say("hi");
    await say("r");

    expect(lastText()).toMatch(/Starting over/);
    await say("Hammad");
    expect((await store.findUserByPhone(PHONE))!.onboarding).toMatchObject({
      step: "ask_email",
      draft: { name: "Hammad" },
    });
  });

  it("warns once when a number floods the bot, then goes quiet", async () => {
    for (let i = 0; i < 20; i++) await say("plan");

    // 15 replies are allowed per minute, the 16th gets the warning, the rest nothing.
    expect(whatsapp.sent).toHaveLength(16);
    expect(lastText()).toMatch(/a lot of messages/);
  });

  it("records when the user last messaged, which is what keeps sending free", async () => {
    await say("Hi");
    await say("Hammad");

    expect((await store.findUserByPhone(PHONE))!.lastInboundAt).toEqual(
      new Date("2026-09-26T12:00:00Z"),
    );
  });

  it("links a phone to a portal account when the code from the website arrives", async () => {
    const portalUser = store.seedUser({
      name: "Hammad",
      email: "cook@example.com",
      status: "active",
      onboarding: { step: "done", draft: emptyDraft() },
    });
    store.addLinkCode("WFD-7Q4K", portalUser.id);

    await say("Connect WFD-7Q4K");

    expect((await store.findUserByPhone(PHONE))?.id).toBe(portalUser.id);
    expect(lastText()).toMatch(/Connected, Hammad/);
  });

  it("tells the user when a link code has expired", async () => {
    await say("Connect WFD-ZZZZ");

    expect(lastText()).toMatch(/expired/);
    expect(await store.findUserByPhone(PHONE)).toBeUndefined();
  });

  it("joins an existing account when the verified email already has one", async () => {
    store.seedUser({
      name: "Hammad",
      email: "cook@example.com",
      emailVerifiedAt: new Date(),
      status: "active",
      onboarding: { step: "done", draft: emptyDraft() },
    });

    await say("Hi");
    await say("Hammad");
    await say("cook@example.com");
    await say(email.lastCode()!);

    expect(lastText()).toMatch(/Welcome back, Hammad/);
    expect((await store.findUserByEmail("cook@example.com"))!.phone).toBe(PHONE);
  });

  it("refuses to move an email that is already on another number", async () => {
    store.seedUser({
      name: "Hammad",
      email: "cook@example.com",
      phone: "923009999999",
      emailVerifiedAt: new Date(),
      status: "active",
      onboarding: { step: "done", draft: emptyDraft() },
    });

    await say("Hi");
    await say("Hammad");
    await say("cook@example.com");
    await say(email.lastCode()!);

    expect(lastText()).toMatch(/already linked to a different number/);
    expect((await store.findUserByEmail("cook@example.com"))!.phone).toBe("923009999999");
  });

  it("offers help to a set-up account", async () => {
    store.seedUser({
      phone: PHONE,
      status: "active",
      onboarding: { step: "done", draft: emptyDraft() },
    });

    await say("hello");
    expect(lastText()).toMatch(/Here's what I can do/);
  });

  it("does nothing for delivery status callbacks", async () => {
    await handleInbound(
      { type: "status", messageId: "wamid.out1", status: "delivered", at: new Date() },
      deps,
    );
    expect(whatsapp.sent).toHaveLength(0);
  });
});

describe("when WhatsApp refuses a reply", () => {
  it("says why, rather than looking like a bot that ignored you", async () => {
    whatsapp.failNext({
      ok: false,
      error: "The access token is invalid or expired.",
      code: 190,
      retryable: false,
    });

    await expect(say("Hi")).rejects.toThrow(/WhatsApp refused the reply \(190\)/);
  });
});
