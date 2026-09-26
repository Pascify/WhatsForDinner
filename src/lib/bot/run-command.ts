import { generatePlan, suggestAlternative } from "@/lib/plan/generate";
import { formatDay, formatPlan, swapRows } from "@/lib/plan/format";
import { hashSeed } from "@/lib/plan/rng";
import type { Meal, Plan, Weekday } from "@/lib/plan/types";
import { addDays, dayLong, localDateISO, startOfWeek } from "@/lib/plan/week";
import { message, type BotMessage } from "./messages";
import { REPLY_IDS, type Command } from "./commands";
import type { BotStore, BotUser } from "./store";

/** Weeks run Monday to Sunday until the portal offers a choice. */
export const WEEK_STARTS_ON: Weekday = 1;

export const HELP = message(
  "Here's what I can do:\n\n*plan*: this week's dinners\n*today* / *tomorrow*: one day\n*swap*: change a day\n*settings*: how I send plans\n*login*: a link to the website\n*stop*: pause",
);

const planButtons = () => [
  { id: "today", title: "Tonight" },
  { id: REPLY_IDS.swap, title: "Swap a meal" },
  { id: REPLY_IDS.ack, title: "Looks good 👍" },
];

/** Reads back an existing plan, or builds and stores one for that week. */
export async function ensurePlan(store: BotStore, user: BotUser, weekOf: string): Promise<Plan> {
  const existing = await store.findPlan(user.id, weekOf);
  if (existing) return existing;

  const [meals, history] = await Promise.all([store.mealsFor(user.id), store.historyFor(user.id)]);
  const plan = generatePlan({
    meals,
    rules: user.rules,
    history,
    weekOf,
    seed: hashSeed(`${user.id}:${weekOf}`),
  });

  await store.savePlan(user.id, plan);
  return plan;
}

const lookupFor = (meals: Meal[]) => {
  const byId = new Map(meals.map((meal) => [meal.id, meal]));
  return (mealId: string) => byId.get(mealId);
};

/** Turns one command into the messages to send back. Nothing here sends anything itself. */
export async function runCommand(
  command: Command,
  user: BotUser,
  store: BotStore,
  now: Date,
): Promise<BotMessage[]> {
  const today = localDateISO(now, user.timezone);
  const weekOf = startOfWeek(today, WEEK_STARTS_ON);

  switch (command.kind) {
    case "plan": {
      const [plan, meals] = await Promise.all([
        ensurePlan(store, user, weekOf),
        store.mealsFor(user.id),
      ]);
      return [message(formatPlan(plan, lookupFor(meals)), { buttons: planButtons() })];
    }

    case "today":
    case "tomorrow": {
      const date = command.kind === "today" ? today : addDays(today, 1);
      const [plan, meals] = await Promise.all([
        ensurePlan(store, user, startOfWeek(date, WEEK_STARTS_ON)),
        store.mealsFor(user.id),
      ]);
      const label = command.kind === "today" ? "Tonight" : "Tomorrow";
      return [
        message(formatDay(plan, date, lookupFor(meals), label), {
          buttons: [
            { id: REPLY_IDS.swapDay(date), title: "Swap it" },
            { id: REPLY_IDS.showPlan, title: "Whole week" },
          ],
        }),
      ];
    }

    case "swap": {
      const [plan, meals] = await Promise.all([
        ensurePlan(store, user, weekOf),
        store.mealsFor(user.id),
      ]);
      return [
        message("Which day should I change?", {
          list: { button: "Pick a day", rows: swapRows(plan, lookupFor(meals)) },
        }),
      ];
    }

    case "swap_day":
    case "swap_another": {
      const attempt = command.kind === "swap_another" ? command.attempt : 0;
      const rejected = command.kind === "swap_another" && command.rejected ? [command.rejected] : [];
      const planWeek = startOfWeek(command.date, WEEK_STARTS_ON);
      const [plan, meals, history] = await Promise.all([
        ensurePlan(store, user, planWeek),
        store.mealsFor(user.id),
        store.historyFor(user.id),
      ]);

      const suggestion = suggestAlternative({
        meals,
        rules: user.rules,
        history,
        plan,
        date: command.date,
        rejected,
        attempt,
      });
      if (!suggestion) {
        return [message("I've run out of meals that fit. Add a few on the website and try again.")];
      }

      return [
        message(`How about *${suggestion.name}* for ${dayLong(command.date)}?`, {
          buttons: [
            { id: REPLY_IDS.swapAccept(command.date, suggestion.id), title: "✅ Use this" },
            { id: REPLY_IDS.swapAnother(command.date, attempt + 1, suggestion.id), title: "🔄 Another" },
          ],
        }),
      ];
    }

    case "swap_accept": {
      const planWeek = startOfWeek(command.date, WEEK_STARTS_ON);
      await store.setPlanDay(user.id, planWeek, command.date, command.mealId);

      const meals = await store.mealsFor(user.id);
      const name = lookupFor(meals)(command.mealId)?.name ?? "that";
      return [
        message(`✅ ${dayLong(command.date)} is now *${name}*.`, {
          buttons: [{ id: REPLY_IDS.showPlan, title: "Whole week" }],
        }),
      ];
    }

    case "settings": {
      const { delivery } = user;
      const what =
        delivery.mode === "on_request"
          ? "only when you ask"
          : [delivery.weekly.enabled && "the week's plan", delivery.daily.enabled && "a daily reminder"]
              .filter(Boolean)
              .join(" and ");
      const closed = {
        wait: "I wait until you message me",
        email: "I email it to you",
        whatsapp: "I send it on WhatsApp anyway",
      }[delivery.whenClosed];

      const link = await store.issueLoginLink(user.id);
      return [
        message(
          `Right now I send ${what}.\nIf WhatsApp can't reach you for free, ${closed}.\n\nChange it here: ${link}`,
        ),
      ];
    }

    case "login": {
      const link = await store.issueLoginLink(user.id);
      return [message(`Here's your login link, good for 15 minutes:\n${link}`)];
    }

    case "stop": {
      await store.setPaused(user.id, true);
      return [message("Paused 👍 I won't message you until you text *resume*.")];
    }

    case "resume": {
      await store.setPaused(user.id, false);
      return [message("Welcome back! Text *plan* whenever you want this week's dinners.")];
    }

    case "delete":
      return [
        message("This deletes your account, plans and preferences. There's no undo.", {
          buttons: [{ id: REPLY_IDS.deleteConfirm, title: "Delete everything" }],
        }),
      ];

    case "delete_confirm":
      await store.deleteUser(user.id);
      return [message("Deleted. Thanks for trying WhatsForDinner 🍽️")];

    case "ack":
      return [message("Great 🍽️")];

    default:
      return [HELP];
  }
}
