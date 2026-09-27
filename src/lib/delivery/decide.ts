import type { DeliverySettings } from "@/lib/db/types";

export type PaidBudget = {
  /** Most paid messages allowed across all users this month. */
  cap: number;
  sentThisMonth: number;
  killSwitch: boolean;
};

export type Channel = "whatsapp_service" | "email" | "whatsapp_template" | "wait";

export type ChannelDecision = {
  channel: Channel;
  paid: boolean;
  /** Why this channel, in words, for the delivery log and the dashboard. */
  reason: string;
};

export type DecideInput = {
  windowOpen: boolean;
  settings: DeliverySettings;
  hasEmail: boolean;
  budget: PaidBudget;
};

/**
 * Picks how to deliver a plan, cheapest first.
 *
 * An open window is always free, so it wins. With the window shut we follow the user's own
 * choice, except that paid sends stop at the owner's monthly cap or kill switch and fall back
 * to email, and someone with no email waits instead.
 */
export function decideChannel({
  windowOpen,
  settings,
  hasEmail,
  budget,
}: DecideInput): ChannelDecision {
  if (windowOpen) {
    return {
      channel: "whatsapp_service",
      paid: false,
      reason: "the free 24-hour window was open",
    };
  }

  if (settings.whenClosed === "email") {
    return hasEmail
      ? { channel: "email", paid: false, reason: "WhatsApp was closed, so it went by email" }
      : { channel: "wait", paid: false, reason: "WhatsApp was closed and there is no email" };
  }

  if (settings.whenClosed === "whatsapp") {
    if (budget.killSwitch) {
      return fallbackFromPaid(hasEmail, "paid sending is switched off");
    }
    if (budget.sentThisMonth >= budget.cap) {
      return fallbackFromPaid(
        hasEmail,
        `the monthly cap of ${budget.cap} paid messages was reached`,
      );
    }
    return {
      channel: "whatsapp_template",
      paid: true,
      reason: "WhatsApp was closed and this user opted into paid messages",
    };
  }

  return {
    channel: "wait",
    paid: false,
    reason: "WhatsApp was closed, so it waits for their next message",
  };
}

function fallbackFromPaid(hasEmail: boolean, why: string): ChannelDecision {
  return hasEmail
    ? { channel: "email", paid: false, reason: `${why}, so it went by email` }
    : { channel: "wait", paid: false, reason: `${why}, so it waits` };
}
