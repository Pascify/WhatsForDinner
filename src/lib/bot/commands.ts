export type Command =
  | { kind: "plan" }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "swap" }
  | { kind: "swap_day"; date: string }
  | { kind: "swap_accept"; date: string; mealId: string }
  | { kind: "swap_another"; date: string; attempt: number; rejected?: string }
  | { kind: "settings" }
  | { kind: "login" }
  | { kind: "stop" }
  | { kind: "resume" }
  | { kind: "delete" }
  | { kind: "delete_confirm" }
  | { kind: "ack" }
  | { kind: "help" };

/** Button and list ids the bot sends out, so a tap comes back as a command. */
export const REPLY_IDS = {
  showPlan: "show_plan",
  ack: "ack",
  swap: "swap",
  swapDay: (date: string) => `swapday_${date}`,
  swapAccept: (date: string, mealId: string) => `swapok_${date}_${mealId}`,
  swapAnother: (date: string, attempt: number, rejected: string) =>
    `swapmore_${date}_${attempt}_${rejected}`,
  deleteConfirm: "delete_confirm",
} as const;

const WORDS: [RegExp, Command][] = [
  [/^(plan|menu|week|this week|dinners?)$/, { kind: "plan" }],
  [/^(today|tonight)$/, { kind: "today" }],
  [/^(tomorrow|tmrw)$/, { kind: "tomorrow" }],
  [/^(swap|change|another)$/, { kind: "swap" }],
  [/^(settings|preferences|prefs)$/, { kind: "settings" }],
  [/^(login|log in|website|portal)$/, { kind: "login" }],
  [/^(stop|pause|unsubscribe)$/, { kind: "stop" }],
  [/^(resume|start|continue)$/, { kind: "resume" }],
  [/^delete( my)?( account)?$/, { kind: "delete" }],
  [/^(help|hi|hello|hey|\?)$/, { kind: "help" }],
];

const DATE = "(\\d{4}-\\d{2}-\\d{2})";

/**
 * A tap always wins over the text, because the title of a tapped button is also sent as text
 * and would otherwise be parsed as words.
 */
export function parseCommand(text = "", replyId?: string): Command {
  if (replyId) {
    if (replyId === REPLY_IDS.showPlan) return { kind: "plan" };
    if (replyId === REPLY_IDS.ack) return { kind: "ack" };
    if (replyId === REPLY_IDS.swap) return { kind: "swap" };

    const day = replyId.match(new RegExp(`^swapday_${DATE}$`));
    if (day) return { kind: "swap_day", date: day[1] };

    if (replyId === REPLY_IDS.deleteConfirm) return { kind: "delete_confirm" };

    const another = replyId.match(new RegExp(`^swapmore_${DATE}_(\\d+)_(.+)$`));
    if (another) {
      return {
        kind: "swap_another",
        date: another[1],
        attempt: Number(another[2]),
        rejected: another[3],
      };
    }

    const accept = replyId.match(new RegExp(`^swapok_${DATE}_(.+)$`));
    if (accept) return { kind: "swap_accept", date: accept[1], mealId: accept[2] };
  }

  const cleaned = text.trim().toLowerCase().replace(/[!.,]+$/, "");
  for (const [pattern, command] of WORDS) {
    if (pattern.test(cleaned)) return command;
  }

  // "swap friday" and "change tuesday" are common enough to be worth reading.
  const named = cleaned.match(
    /^(?:swap|change)\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/,
  );
  if (named) return { kind: "swap" };

  return { kind: "help" };
}
