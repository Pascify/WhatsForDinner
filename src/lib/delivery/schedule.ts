import type { BotUser } from "@/lib/bot/store";
import { WEEK_STARTS_ON, ensurePlan } from "@/lib/bot/run-command";
import { addDays, localDateISO, localHour, startOfWeek, weekdayOf } from "@/lib/plan/week";
import { deliverPlan, type DeliveryDeps, type DeliveryKind } from "./service";

/**
 * Which week a send made today should cover: the current one if today is the first day of it,
 * otherwise the week about to start.
 */
export function weekToSend(today: string): string {
  const start = startOfWeek(today, WEEK_STARTS_ON);
  return today === start ? start : addDays(start, 7);
}

export type DueReason = "weekly" | "daily" | "paid_fallback";

/** Decides, from one user's own clock, what is due right now. Pure, so it is easy to test. */
export function whatIsDue(user: BotUser, now: Date): DueReason[] {
  const today = localDateISO(now, user.timezone);
  const hour = localHour(now, user.timezone);
  const weekday = weekdayOf(today);
  const due: DueReason[] = [];

  const { weekly, daily, whenClosed } = user.delivery;

  if (weekly.enabled && weekday === weekly.weekday && hour === weekly.hour) due.push("weekly");

  // A day later, same hour: the last chance for anyone who opted into paid messages.
  const dayAfterWeekly = (weekly.weekday + 1) % 7;
  if (
    weekly.enabled &&
    whenClosed === "whatsapp" &&
    weekday === dayAfterWeekly &&
    hour === weekly.hour
  ) {
    due.push("paid_fallback");
  }

  if (daily.enabled && daily.weekdays.includes(weekday) && hour === daily.hour) due.push("daily");

  return due;
}

export type TickSummary = {
  considered: number;
  sent: number;
  paid: number;
  waiting: number;
  failed: number;
};

/**
 * One hourly pass. Every active user on automatic delivery is checked against their own
 * timezone, so a single schedule serves people in different countries.
 */
export async function runTick(deps: DeliveryDeps, now = new Date()): Promise<TickSummary> {
  const users = await deps.store.activeAutoUsers();
  const summary: TickSummary = {
    considered: users.length,
    sent: 0,
    paid: 0,
    waiting: 0,
    failed: 0,
  };

  for (const user of users) {
    for (const reason of whatIsDue(user, now)) {
      const today = localDateISO(now, user.timezone);

      if (reason === "paid_fallback") {
        const pending = await deps.store.findPendingPlan(user.id);
        if (!pending) continue;
        tally(summary, await deliverPlan(user, pending, "weekly", deps, now));
        continue;
      }

      const kind: DeliveryKind = reason;
      const weekOf = kind === "weekly" ? weekToSend(today) : startOfWeek(today, WEEK_STARTS_ON);
      const plan = await ensurePlan(deps.store, user, weekOf);
      tally(summary, await deliverPlan(user, plan, kind, deps, now));
    }
  }

  return summary;
}

function tally(summary: TickSummary, outcome: { sent: boolean; paid: boolean; channel: string }) {
  if (outcome.channel === "wait") summary.waiting += 1;
  else if (outcome.sent) {
    summary.sent += 1;
    if (outcome.paid) summary.paid += 1;
  } else summary.failed += 1;
}
