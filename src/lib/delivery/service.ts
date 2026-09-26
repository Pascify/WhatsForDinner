import type { BotStore, BotUser } from "@/lib/bot/store";
import type { EmailSender } from "@/lib/email/types";
import { formatDay, formatPlan, templateVariables } from "@/lib/plan/format";
import type { Meal, Plan } from "@/lib/plan/types";
import { localDateISO, shortDate } from "@/lib/plan/week";
import { REPLY_IDS } from "@/lib/bot/commands";
import { TEMPLATES } from "@/lib/whatsapp/templates";
import type { WhatsAppClient } from "@/lib/whatsapp/types";
import { windowOpen } from "@/lib/whatsapp/window";
import { decideChannel, type ChannelDecision } from "./decide";

export type DeliveryDeps = {
  store: BotStore;
  whatsapp: WhatsAppClient;
  email: EmailSender;
};

export type DeliveryKind = "weekly" | "daily";

export type DeliveryOutcome = ChannelDecision & { sent: boolean; error?: string };

const lookupFor = (meals: Meal[]) => {
  const byId = new Map(meals.map((meal) => [meal.id, meal]));
  return (mealId: string) => byId.get(mealId);
};

/**
 * Delivers a plan by the cheapest route the user agreed to, and records what it cost.
 *
 * A plan that cannot be delivered for free stays pending, so it goes out the moment the user
 * next messages the bot, which is free again.
 */
export async function deliverPlan(
  user: BotUser,
  plan: Plan,
  kind: DeliveryKind,
  deps: DeliveryDeps,
  now = new Date(),
): Promise<DeliveryOutcome> {
  const [meals, budget] = await Promise.all([deps.store.mealsFor(user.id), deps.store.paidBudget()]);
  const lookup = lookupFor(meals);

  let decision = decideChannel({
    windowOpen: windowOpen(user.lastInboundAt, now),
    settings: user.delivery,
    hasEmail: Boolean(user.email),
    budget,
  });

  if (decision.channel === "whatsapp_service") {
    const outcome = await sendFreeMessage(user, plan, kind, deps, now, lookup);
    if (outcome.sent || outcome.error !== "window_closed") {
      return finish(user, plan, kind, deps, decision, outcome.sent, outcome.error);
    }

    // Meta says the window shut between our check and the send, so decide again as if closed.
    decision = decideChannel({
      windowOpen: false,
      settings: user.delivery,
      hasEmail: Boolean(user.email),
      budget,
    });
  }

  if (decision.channel === "email" && user.email) {
    const result = await deps.email.send({
      to: user.email,
      subject:
        kind === "weekly"
          ? `Your dinner plan for the week of ${shortDate(plan.weekOf)}`
          : "Tonight's dinner",
      text: bodyFor(plan, kind, now, user, lookup),
    });
    return finish(user, plan, kind, deps, decision, result.ok, result.ok ? undefined : result.error);
  }

  if (decision.channel === "whatsapp_template" && user.phone) {
    const result = await deps.whatsapp.send({
      kind: "template",
      to: user.phone,
      template: {
        name: kind === "weekly" ? TEMPLATES.weekly : TEMPLATES.daily,
        language: TEMPLATES.language,
        variables:
          kind === "weekly"
            ? templateVariables(plan, lookup)
            : [oneDayName(plan, now, user, lookup)],
      },
    });

    if (result.ok) await deps.store.recordPaidSend();
    return finish(user, plan, kind, deps, decision, result.ok, result.ok ? undefined : result.error);
  }

  return finish(user, plan, kind, deps, decision, false);
}

/** Sends whatever is pending the moment a user messages, which is always free. */
export async function deliverPending(
  user: BotUser,
  deps: DeliveryDeps,
  now = new Date(),
): Promise<DeliveryOutcome | undefined> {
  const pending = await deps.store.findPendingPlan(user.id);
  if (!pending) return undefined;
  return deliverPlan(user, pending, "weekly", deps, now);
}

async function sendFreeMessage(
  user: BotUser,
  plan: Plan,
  kind: DeliveryKind,
  deps: DeliveryDeps,
  now: Date,
  lookup: ReturnType<typeof lookupFor>,
) {
  if (!user.phone) return { sent: false, error: "no phone number" };

  const result = await deps.whatsapp.send({
    kind: "text",
    to: user.phone,
    text: bodyFor(plan, kind, now, user, lookup),
    buttons: [
      { id: REPLY_IDS.swap, title: "Swap a meal" },
      { id: REPLY_IDS.ack, title: "Looks good 👍" },
    ],
  });

  if (result.ok) return { sent: true };
  // 131047 is Meta's "re-engagement required", meaning the free window has closed.
  return { sent: false, error: result.code === 131047 ? "window_closed" : result.error };
}

function bodyFor(
  plan: Plan,
  kind: DeliveryKind,
  now: Date,
  user: BotUser,
  lookup: ReturnType<typeof lookupFor>,
) {
  if (kind === "weekly") return formatPlan(plan, lookup);
  return formatDay(plan, localDateISO(now, user.timezone), lookup, "Tonight");
}

function oneDayName(
  plan: Plan,
  now: Date,
  user: BotUser,
  lookup: ReturnType<typeof lookupFor>,
): string {
  const today = localDateISO(now, user.timezone);
  const day = plan.days.find((entry) => entry.date === today);
  return (day && lookup(day.mealId)?.name) ?? "Dinner";
}

async function finish(
  user: BotUser,
  plan: Plan,
  kind: DeliveryKind,
  deps: DeliveryDeps,
  decision: ChannelDecision,
  sent: boolean,
  error?: string,
): Promise<DeliveryOutcome> {
  if (decision.channel !== "wait") {
    await deps.store.logDelivery({
      userId: user.id,
      channel: decision.channel,
      kind,
      paid: decision.paid && sent,
      error,
    });
  }

  if (sent && kind === "weekly") {
    const via =
      decision.channel === "whatsapp_template"
        ? "template"
        : decision.channel === "email"
          ? "email"
          : "service";
    await deps.store.markPlanDelivered(user.id, plan.weekOf, via);
  }

  return { ...decision, sent, error };
}
