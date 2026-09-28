import { describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY, type DeliverySettings } from "@/lib/db/types";
import { decideChannel, type PaidBudget } from "./decide";

const settings = (whenClosed: DeliverySettings["whenClosed"]): DeliverySettings => ({
  ...structuredClone(DEFAULT_DELIVERY),
  whenClosed,
});
const budget = (over: Partial<PaidBudget> = {}): PaidBudget => ({
  cap: 50,
  sentThisMonth: 0,
  killSwitch: false,
  ...over,
});

describe("decideChannel", () => {
  it("sends free over WhatsApp whenever the window is open, whatever the setting", () => {
    for (const choice of ["wait", "email", "whatsapp"] as const) {
      expect(
        decideChannel({
          windowOpen: true,
          settings: settings(choice),
          hasEmail: true,
          budget: budget(),
        }),
      ).toMatchObject({ channel: "whatsapp_service", paid: false });
    }
  });

  it("emails when the window is shut and email is the choice", () => {
    expect(
      decideChannel({
        windowOpen: false,
        settings: settings("email"),
        hasEmail: true,
        budget: budget(),
      }),
    ).toMatchObject({ channel: "email", paid: false });
  });

  it("waits when the user asked to be left alone", () => {
    expect(
      decideChannel({
        windowOpen: false,
        settings: settings("wait"),
        hasEmail: true,
        budget: budget(),
      }),
    ).toMatchObject({ channel: "wait", paid: false });
  });

  it("sends the paid template only for users who opted in", () => {
    expect(
      decideChannel({
        windowOpen: false,
        settings: settings("whatsapp"),
        hasEmail: true,
        budget: budget(),
      }),
    ).toMatchObject({ channel: "whatsapp_template", paid: true });
  });

  it("drops to email when the monthly cap is reached", () => {
    const decision = decideChannel({
      windowOpen: false,
      settings: settings("whatsapp"),
      hasEmail: true,
      budget: budget({ cap: 50, sentThisMonth: 50 }),
    });

    expect(decision).toMatchObject({ channel: "email", paid: false });
    expect(decision.reason).toContain("monthly cap");
  });

  it("drops to email when paid sending is switched off", () => {
    expect(
      decideChannel({
        windowOpen: false,
        settings: settings("whatsapp"),
        hasEmail: true,
        budget: budget({ killSwitch: true }),
      }),
    ).toMatchObject({ channel: "email", paid: false });
  });

  it("waits rather than paying when there is no email to fall back to", () => {
    expect(
      decideChannel({
        windowOpen: false,
        settings: settings("whatsapp"),
        hasEmail: false,
        budget: budget({ killSwitch: true }),
      }),
    ).toMatchObject({ channel: "wait" });

    expect(
      decideChannel({
        windowOpen: false,
        settings: settings("email"),
        hasEmail: false,
        budget: budget(),
      }),
    ).toMatchObject({ channel: "wait" });
  });

  it("never pays for a recipient whose window is open", () => {
    expect(
      decideChannel({
        windowOpen: true,
        settings: settings("whatsapp"),
        hasEmail: false,
        budget: budget({ sentThisMonth: 49 }),
      }).paid,
    ).toBe(false);
  });
});
