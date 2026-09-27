import type { DeliverySettings, OnboardingStep } from "@/lib/db/types";
import { DEFAULT_DELIVERY } from "@/lib/db/types";
import type { Rule, Tag, Weekday } from "@/lib/plan/types";
import { message, type BotMessage } from "./messages";

export type OnboardingDraft = {
  name?: string;
  email?: string;
  rules: Rule[];
  delivery: DeliverySettings;
  pendingDayRule?: { day?: Weekday; tags?: Tag[] };
};

export type OnboardingState = { step: OnboardingStep; draft: OnboardingDraft };

/** A button tap arrives with an id; plain typing arrives as text. */
export type Inbound = { text?: string; replyId?: string };

/** Whatever the caller had to do against the database before this step could move on. */
export type StepOutcome = { emailVerified?: boolean; emailError?: string };

export type Effect =
  | { kind: "send_email_otp"; email: string }
  | { kind: "finish"; draft: OnboardingDraft };

export type StepResult = { state: OnboardingState; messages: BotMessage[]; effects: Effect[] };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Words people actually type, mapped onto the tag vocabulary. */
const RESTRICTION_WORDS: Record<string, Tag> = {
  beef: "beef",
  mutton: "mutton",
  lamb: "mutton",
  goat: "mutton",
  fish: "fish",
  seafood: "fish",
  prawn: "fish",
  egg: "eggs",
  eggs: "eggs",
  chicken: "chicken",
  paneer: "paneer",
  cheese: "paneer",
  daal: "daal",
  lentils: "daal",
  pasta: "pasta",
  noodles: "noodles",
};

const DAY_THEMES: { id: string; title: string; tags: Tag[] }[] = [
  { id: "theme_biryani", title: "Biryani night", tags: ["rice", "chicken"] },
  { id: "theme_splurge", title: "Something special", tags: ["splurge"] },
  { id: "theme_eatout", title: "Eat out", tags: ["eat-out"] },
  { id: "theme_healthy", title: "Something light", tags: ["healthy"] },
  { id: "theme_quick", title: "Something quick", tags: ["quick"] },
];

export const emptyDraft = (): OnboardingDraft => ({
  rules: [],
  delivery: structuredClone(DEFAULT_DELIVERY),
});

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export function parseRestrictions(text: string): Tag[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const tags = new Set<Tag>();
  for (const word of words) {
    const tag = RESTRICTION_WORDS[word];
    if (tag) tags.add(tag);
  }
  return [...tags];
}

export function startOnboarding(): StepResult {
  return {
    state: { step: "ask_name", draft: emptyDraft() },
    messages: [message("Welcome to WhatsForDinner 🍽️\n\nWhat should I call you?")],
    effects: [],
  };
}

const askEmail = () =>
  message("Nice to meet you! What's your email?\n\nYou'll use it to manage your preferences on the website.");

const askDiet = () =>
  message("Do you eat meat?", {
    buttons: [
      { id: "diet_both", title: "Yes" },
      { id: "diet_veg", title: "Vegetarian" },
    ],
  });

const askHalal = () =>
  message("Should I only suggest halal meals?", {
    buttons: [
      { id: "halal_yes", title: "Yes" },
      { id: "halal_no", title: "No" },
    ],
  });

const askRestrictions = () =>
  message("Anything you never want? For example: no beef, no fish.", {
    buttons: [{ id: "skip_restrictions", title: "Nothing" }],
  });

const askDayRule = () =>
  message("Any fixed days? For example, Friday could always be biryani night.", {
    buttons: [
      { id: "day_add", title: "Set one up" },
      { id: "day_skip", title: "Skip" },
    ],
  });

const askDayRuleDay = () =>
  message("Which day?", {
    list: {
      button: "Pick a day",
      rows: DAY_NAMES.map((name, index) => ({ id: `weekday_${index}`, title: name })),
    },
  });

const askDayRuleTheme = (day: Weekday) =>
  message(`What should ${DAY_NAMES[day]} be?`, {
    list: { button: "Pick a theme", rows: DAY_THEMES.map(({ id, title }) => ({ id, title })) },
  });

const askDelivery = () =>
  message("How should I send your plans?", {
    list: {
      button: "Choose",
      rows: [
        { id: "mode_request", title: "Only when I ask", description: "Text me plan any time" },
        { id: "mode_weekly", title: "Weekly plan", description: "The whole week, Saturdays" },
        { id: "mode_daily", title: "Daily reminder", description: "Tonight's dinner, each day" },
        { id: "mode_both", title: "Weekly + daily" },
      ],
    },
  });

const askFallback = () =>
  message("If WhatsApp can't reach you for free, what should I do?", {
    buttons: [
      { id: "closed_email", title: "Email me" },
      { id: "closed_wait", title: "Wait for me" },
      { id: "closed_whatsapp", title: "WhatsApp anyway" },
    ],
  });

/**
 * Moves onboarding along by one message. Pure: the caller performs the effects (sending the
 * OTP email, creating the account) and stores the returned state on the user document, so a
 * half-finished sign-up resumes exactly where it stopped.
 */
export function advanceOnboarding(
  state: OnboardingState,
  input: Inbound,
  outcome: StepOutcome = {},
): StepResult {
  const draft: OnboardingDraft = structuredClone(state.draft);
  const text = (input.text ?? "").trim();
  const reply = input.replyId;
  const stay = (...messages: BotMessage[]): StepResult => ({
    state: { step: state.step, draft },
    messages,
    effects: [],
  });
  const goto = (step: OnboardingStep, messages: BotMessage[], effects: Effect[] = []): StepResult => ({
    state: { step, draft },
    messages,
    effects,
  });

  switch (state.step) {
    case "ask_name": {
      if (!text) return stay(message("What should I call you?"));
      draft.name = text.slice(0, 60);
      return goto("ask_email", [askEmail()]);
    }

    case "ask_email": {
      if (!isEmail(text)) {
        return stay(message("That doesn't look like an email address. Try again?"));
      }
      draft.email = text.toLowerCase();
      return goto(
        "verify_email",
        [message(`I've sent a 6-digit code to ${draft.email}. Type it here.`)],
        [{ kind: "send_email_otp", email: draft.email }],
      );
    }

    case "verify_email": {
      if (/^(resend|change)$/i.test(text)) {
        if (/^change$/i.test(text)) return goto("ask_email", [askEmail()]);
        return stay(message(`Sent again to ${draft.email}.`));
      }
      if (outcome.emailVerified) return goto("ask_diet", [message("✅ Verified."), askDiet()]);
      return stay(message(outcome.emailError ?? "That code didn't work. Try again, or type *change*."));
    }

    case "ask_diet": {
      if (reply === "diet_veg") draft.rules.push({ kind: "always", tags: ["vegetarian"] });
      else if (reply !== "diet_both") return stay(askDiet());
      return goto("ask_halal", [askHalal()]);
    }

    case "ask_halal": {
      if (reply === "halal_yes") draft.rules.push({ kind: "always", tags: ["halal"] });
      else if (reply !== "halal_no") return stay(askHalal());
      return goto("ask_restrictions", [askRestrictions()]);
    }

    case "ask_restrictions": {
      if (reply !== "skip_restrictions") {
        const tags = parseRestrictions(text);
        if (tags.length === 0) {
          return stay(message("I didn't catch that. Name an ingredient, or tap Nothing."));
        }
        draft.rules.push({ kind: "never", tags });
      }
      return goto("ask_day_rule", [askDayRule()]);
    }

    case "ask_day_rule": {
      if (reply === "day_add") {
        draft.pendingDayRule = {};
        return goto("ask_day_rule_tags", [askDayRuleDay()]);
      }
      return goto("ask_delivery", [askDelivery()]);
    }

    case "ask_day_rule_tags": {
      const dayMatch = reply?.match(/^weekday_([0-6])$/);
      if (dayMatch) {
        const day = Number(dayMatch[1]) as Weekday;
        draft.pendingDayRule = { day };
        return stay(askDayRuleTheme(day));
      }

      const theme = DAY_THEMES.find((option) => option.id === reply);
      const day = draft.pendingDayRule?.day;
      if (!theme || day === undefined) return stay(askDayRuleDay());

      draft.rules.push({ kind: "day", day, tags: theme.tags });
      delete draft.pendingDayRule;
      return goto("ask_delivery", [
        message(`✅ ${DAY_NAMES[day]}: ${theme.title.toLowerCase()}.`),
        askDelivery(),
      ]);
    }

    case "ask_delivery": {
      const modes: Record<string, () => void> = {
        mode_request: () => {
          draft.delivery.mode = "on_request";
          draft.delivery.weekly.enabled = false;
          draft.delivery.daily.enabled = false;
        },
        mode_weekly: () => {
          draft.delivery.weekly.enabled = true;
          draft.delivery.daily.enabled = false;
        },
        mode_daily: () => {
          draft.delivery.weekly.enabled = false;
          draft.delivery.daily.enabled = true;
        },
        mode_both: () => {
          draft.delivery.weekly.enabled = true;
          draft.delivery.daily.enabled = true;
        },
      };
      const apply = reply ? modes[reply] : undefined;
      if (!apply) return stay(askDelivery());
      apply();

      if (draft.delivery.mode === "on_request") {
        return goto("done", [message("Done! Text *plan* whenever you want this week's dinners.")], [
          { kind: "finish", draft },
        ]);
      }
      return goto("ask_fallback", [askFallback()]);
    }

    case "ask_fallback": {
      const choice = reply?.replace("closed_", "");
      if (choice !== "email" && choice !== "wait" && choice !== "whatsapp") return stay(askFallback());
      draft.delivery.whenClosed = choice;
      if (choice === "whatsapp") {
        draft.delivery.paidOptInAt = new Date();
        draft.delivery.paidOptInSource = "whatsapp";
      }
      return goto("done", [message("All set 🎉 Here's your first plan 👇")], [
        { kind: "finish", draft },
      ]);
    }

    default:
      return stay();
  }
}
