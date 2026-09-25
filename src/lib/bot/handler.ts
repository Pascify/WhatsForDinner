import { findLinkCode } from "@/lib/auth/codes";
import { decideLink } from "@/lib/accounts/policy";
import type { EmailSender } from "@/lib/email/types";
import type { InboundEvent } from "@/lib/whatsapp/inbound";
import type { WhatsAppClient } from "@/lib/whatsapp/types";
import { message, type BotMessage } from "./messages";
import { advanceOnboarding, startOnboarding, type StepOutcome } from "./onboarding";
import type { BotStore, BotUser } from "./store";

export type BotDeps = {
  store: BotStore;
  whatsapp: WhatsAppClient;
  email: EmailSender;
  now?: () => Date;
};

const OTP_SUBJECT = "Your WhatsForDinner code";
const otpBody = (code: string) =>
  `Your WhatsForDinner code is ${code}.\n\nType it back into the WhatsApp chat. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`;

const HELP = message(
  "Here's what I can do:\n\n*plan* — this week's dinners\n*today* / *tomorrow* — one day\n*swap* — change a day\n*settings* — how I send plans\n*login* — a link to the website\n*stop* — pause",
);

/** Sends each reply in order, so buttons always arrive after the text that explains them. */
async function reply(deps: BotDeps, to: string, messages: BotMessage[]) {
  for (const item of messages) {
    await deps.whatsapp.send({ kind: "text", to, ...item });
  }
}

/**
 * One inbound WhatsApp event. Meta retries deliveries, so every message is checked against
 * the seen list before anything happens.
 */
export async function handleInbound(event: InboundEvent, deps: BotDeps): Promise<void> {
  if (event.type !== "message") return;
  if (await deps.store.seenMessage(event.messageId)) return;

  const now = event.at ?? deps.now?.() ?? new Date();
  const phone = event.from;
  const user = await deps.store.findUserByPhone(phone);

  if (!user) {
    await handleUnknownNumber(event, deps, phone, now);
    return;
  }

  await deps.store.touchInbound(user.id, now);

  if (user.onboarding.step !== "done") {
    await continueOnboarding(user, event, deps, phone);
    return;
  }

  // Commands land here once the account is set up.
  await reply(deps, phone, [HELP]);
}

/** Either a portal code they were asked to send, or someone brand new. */
async function handleUnknownNumber(
  event: Extract<InboundEvent, { type: "message" }>,
  deps: BotDeps,
  phone: string,
  now: Date,
) {
  const code = findLinkCode(event.text);

  if (code) {
    const claim = await deps.store.consumeLinkCode(code);
    if (!claim) {
      await reply(deps, phone, [
        message("That code has expired. Open the website and tap Connect WhatsApp again."),
      ]);
      return;
    }

    await deps.store.linkPhone(claim.userId, phone);
    await deps.store.touchInbound(claim.userId, now);
    const linked = await deps.store.findUserByPhone(phone);

    if (linked && linked.onboarding.step !== "done") {
      await continueOnboarding(linked, { ...event, text: "", replyId: undefined }, deps, phone);
      return;
    }
    await reply(deps, phone, [
      message(`✅ Connected${linked?.name ? `, ${linked.name}` : ""}! Here's your plan 👇`),
    ]);
    return;
  }

  const created = await deps.store.createUser({ phone, channel: "whatsapp" });
  const { state, messages } = startOnboarding();
  await deps.store.saveOnboarding(created.id, state);
  await reply(deps, phone, messages);
}

/** Runs one onboarding step, including the database work its effects ask for. */
async function continueOnboarding(
  user: BotUser,
  event: Extract<InboundEvent, { type: "message" }>,
  deps: BotDeps,
  phone: string,
) {
  const stepBefore = user.onboarding.step;
  const outcome = await resolveOutcome(user, event, deps);
  const result = advanceOnboarding(user.onboarding, { text: event.text, replyId: event.replyId }, outcome);

  await deps.store.saveOnboarding(user.id, result.state);

  for (const effect of result.effects) {
    if (effect.kind === "send_email_otp") {
      const code = await deps.store.issueOtp(effect.email, "signup");
      await deps.email.send({ to: effect.email, subject: OTP_SUBJECT, text: otpBody(code) });
    }
    if (effect.kind === "finish") {
      await deps.store.finishOnboarding(user.id, effect.draft);
    }
  }

  await reply(deps, phone, result.messages);

  // A verified email that already has an account means this phone belongs to that account.
  if (stepBefore === "verify_email" && outcome.emailVerified) {
    await mergeWithExistingAccount(user, deps, phone);
  }
}

/** Checks the typed code when the machine is waiting on one. */
async function resolveOutcome(
  user: BotUser,
  event: Extract<InboundEvent, { type: "message" }>,
  deps: BotDeps,
): Promise<StepOutcome> {
  if (user.onboarding.step !== "verify_email") return {};

  const typed = event.text.replace(/\D/g, "");
  const email = user.onboarding.draft.email;
  if (!email || typed.length !== 6) return {};

  const result = await deps.store.checkOtp(email, typed);
  if (result.ok) return { emailVerified: true };

  const reasons: Record<string, string> = {
    wrong_code: "That code didn't work. Try again, or type *change* to use another email.",
    expired: "That code has expired. Type *resend* for a new one.",
    already_used: "That code was already used. Type *resend* for a new one.",
    too_many_attempts: "Too many tries. Type *resend* for a new code.",
  };
  return { emailError: reasons[result.reason] };
}

/** "Welcome back": the email proves who they are, so the phone joins that account. */
async function mergeWithExistingAccount(user: BotUser, deps: BotDeps, phone: string) {
  const email = user.onboarding.draft.email;
  if (!email) return;

  const existing = await deps.store.findUserByEmail(email);
  if (!existing || existing.id === user.id) return;

  const decision = decideLink(phone, {
    id: existing.id,
    phone: existing.phone,
    emailVerifiedAt: existing.emailVerifiedAt,
    onboardingDone: existing.onboarding.step === "done",
  });

  if (decision.kind === "needs_switch_confirmation") {
    await reply(deps, phone, [
      message(
        "That email is already linked to a different number. Log in on the website to change it, then try again.",
      ),
    ]);
    return;
  }

  if (decision.kind === "link_phone") {
    await deps.store.linkPhone(existing.id, phone);
  }

  if (existing.onboarding.step === "done") {
    await reply(deps, phone, [
      message(`Welcome back${existing.name ? `, ${existing.name}` : ""}! Your preferences are all set 👇`),
    ]);
  }
}
