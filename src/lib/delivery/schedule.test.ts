import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryBotStore } from "@/lib/bot/memory-store";
import { emptyDraft } from "@/lib/bot/onboarding";
import type { BotUser } from "@/lib/bot/store";
import { FakeEmailSender } from "@/lib/email/fake";
import { FakeWhatsAppClient } from "@/lib/whatsapp/fake";
import type { DeliveryDeps } from "./service";
import { runTick, weekToSend, whatIsDue } from "./schedule";

beforeAll(() => {
  process.env.CODE_PEPPER = "test-pepper";
});

let store: MemoryBotStore;
let whatsapp: FakeWhatsAppClient;
let email: FakeEmailSender;
let deps: DeliveryDeps;

beforeEach(() => {
  store = new MemoryBotStore();
  whatsapp = new FakeWhatsAppClient();
  email = new FakeEmailSender();
  deps = { store, whatsapp, email };
});

const user = (over: Partial<BotUser> = {}): BotUser =>
  store.seedUser({
    name: "Hammad",
    phone: `9230012345${Math.floor(Math.random() * 90 + 10)}`,
    email: "cook@example.com",
    status: "active",
    timezone: "Asia/Karachi",
    onboarding: { step: "done", draft: emptyDraft() },
    ...over,
  });

/** Saturday 18:00 in Karachi is 13:00 UTC. */
const SATURDAY_6PM_PKT = new Date("2026-09-26T13:00:00Z");

describe("whatIsDue", () => {
  it("is due at the user's own local hour, not UTC", () => {
    const karachi = user();
    expect(whatIsDue(karachi, SATURDAY_6PM_PKT)).toEqual(["weekly"]);
    expect(whatIsDue(karachi, new Date("2026-09-26T18:00:00Z"))).toEqual([]);

    const toronto = user({ timezone: "America/Toronto" });
    expect(whatIsDue(toronto, SATURDAY_6PM_PKT)).toEqual([]);
    expect(whatIsDue(toronto, new Date("2026-09-26T22:00:00Z"))).toEqual(["weekly"]);
  });

  it("is quiet on other days and hours", () => {
    const karachi = user();
    expect(whatIsDue(karachi, new Date("2026-09-25T13:00:00Z"))).toEqual([]);
    expect(whatIsDue(karachi, new Date("2026-09-26T12:00:00Z"))).toEqual([]);
  });

  it("adds a daily reminder at its own hour", () => {
    const daily = user();
    daily.delivery.daily = { enabled: true, hour: 16, weekdays: [1, 2, 3, 4, 5] };

    expect(whatIsDue(daily, new Date("2026-09-28T11:00:00Z"))).toEqual(["daily"]); // Mon 16:00 PKT
    expect(whatIsDue(daily, new Date("2026-09-27T11:00:00Z"))).toEqual([]); // Sunday, not chosen
  });

  it("schedules the paid fallback a day later, and only for people who opted in", () => {
    const waiting = user();
    expect(whatIsDue(waiting, new Date("2026-09-27T13:00:00Z"))).toEqual([]);

    const optedIn = user();
    optedIn.delivery.whenClosed = "whatsapp";
    expect(whatIsDue(optedIn, new Date("2026-09-27T13:00:00Z"))).toEqual(["paid_fallback"]);
  });
});

describe("weekToSend", () => {
  it("sends the coming week, unless today starts one", () => {
    expect(weekToSend("2026-09-26")).toBe("2026-09-28"); // Saturday → next Monday
    expect(weekToSend("2026-09-28")).toBe("2026-09-28"); // Monday → this week
  });
});

describe("runTick", () => {
  it("delivers free when the user messaged recently", async () => {
    user({ lastInboundAt: new Date(SATURDAY_6PM_PKT.getTime() - 3_600_000) });

    const summary = await runTick(deps, SATURDAY_6PM_PKT);

    expect(summary).toMatchObject({ considered: 1, sent: 1, paid: 0, failed: 0 });
    expect(whatsapp.texts()[0]).toContain("Week of 28 Sep");
  });

  it("emails when the window is shut", async () => {
    user();
    await runTick(deps, SATURDAY_6PM_PKT);

    expect(email.sent).toHaveLength(1);
    expect(whatsapp.sent).toHaveLength(0);
  });

  it("leaves a plan waiting and delivers it on the fallback pass for opted-in users", async () => {
    const optedIn = user();
    optedIn.delivery.whenClosed = "whatsapp";
    store.users.get(optedIn.id)!.delivery.whenClosed = "whatsapp";
    store.budget = { cap: 10, sentThisMonth: 0, killSwitch: false };

    // First pass: nothing to fall back to yet, so the template goes out immediately.
    const first = await runTick(deps, SATURDAY_6PM_PKT);
    expect(first).toMatchObject({ sent: 1, paid: 1 });
    expect(store.budget.sentThisMonth).toBe(1);
  });

  it("skips users who are not on automatic delivery", async () => {
    const onRequest = user();
    store.users.get(onRequest.id)!.delivery.mode = "on_request";

    expect(await runTick(deps, SATURDAY_6PM_PKT)).toMatchObject({ considered: 0 });
  });

  it("skips paused accounts", async () => {
    const paused = user();
    await store.setPaused(paused.id, true);

    expect(await runTick(deps, SATURDAY_6PM_PKT)).toMatchObject({ considered: 0 });
  });

  it("does nothing at a quiet hour", async () => {
    user({ lastInboundAt: SATURDAY_6PM_PKT });
    const summary = await runTick(deps, new Date("2026-09-26T14:00:00Z"));

    expect(summary).toMatchObject({ considered: 1, sent: 0 });
    expect(whatsapp.sent).toHaveLength(0);
  });

  it("serves people in different timezones from the same hourly run", async () => {
    user({ lastInboundAt: SATURDAY_6PM_PKT });
    const toronto = user({ timezone: "America/Toronto", lastInboundAt: SATURDAY_6PM_PKT });
    store.users.get(toronto.id)!.timezone = "America/Toronto";

    expect(await runTick(deps, SATURDAY_6PM_PKT)).toMatchObject({ sent: 1 });
    expect(await runTick(deps, new Date("2026-09-26T22:00:00Z"))).toMatchObject({ sent: 1 });
  });

  it("counts failures without stopping the run", async () => {
    user({ lastInboundAt: SATURDAY_6PM_PKT });
    user({ lastInboundAt: SATURDAY_6PM_PKT });
    whatsapp.failNext({ ok: false, error: "Meta rate limit reached.", code: 4, retryable: true });

    expect(await runTick(deps, SATURDAY_6PM_PKT)).toMatchObject({ considered: 2, sent: 1, failed: 1 });
  });
});
