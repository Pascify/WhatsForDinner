import { canResend, findLinkCode } from "@/lib/auth/codes";
import { decideLink } from "@/lib/accounts/policy";
import type { EmailSender } from "@/lib/email/types";
import type { InboundEvent } from "@/lib/whatsapp/inbound";
import type { WhatsAppClient } from "@/lib/whatsapp/types";
import { message, type BotMessage } from "./messages";
import { parseCommand } from "./commands";
import { deliverPending, deliverPlan } from "@/lib/delivery/service";
import { advanceOnboarding, startOnboarding, type StepOutcome } from "./onboarding";
import { ensurePlan, runCommand } from "./run-command";
import { localDateISO, startOfWeek } from "@/lib/plan/week";
import { WEEK_STARTS_ON } from "./run-command";
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

/**
 * Sends each reply in order, so buttons always arrive after the text that explains them.
 * A failed send throws: silently dropping it makes a broken token look like a silent bot.
 */
async function reply(deps: BotDeps, to: string, messages: BotMessage[]) {
  for (const item of messages) {
    const result = await deps.whatsapp.send({ kind: "text", to, ...item });
    if (!result.ok) {
      throw new Error(
        `WhatsApp refused the reply${result.code ? ` (${result.code})` : ""}: ${result.error}`,
      );
    }
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
    await continueOnboarding(user, event, deps, phone, now);
    return;
  }

  // They just messaged, so the free window is open: anything waiting goes out now.
  await deliverPending({ ...user, lastInboundAt: now }, deps, now);

  const command = parseCommand(event.text, event.replyId);
  const replies = await runCommand(command, user, deps.store, now);
  await reply(deps, phone, replies);
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
      await continueOnboarding(
        linked,
        { ...event, text: "", replyId: undefined },
        deps,
        phone,
        now,
      );
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
  now: Date,
) {
  const stepBefore = user.onboarding.step;
  const outcome = await resolveOutcome(user, event, deps, now);
  const result = advanceOnboarding(
    user.onboarding,
    { text: event.text, replyId: event.replyId },
    outcome,
  );

  await deps.store.saveOnboarding(user.id, result.state);

  for (const effect of result.effects) {
    if (effect.kind === "send_email_otp") {
      const code = await deps.store.issueOtp(effect.email, "signup", now);
      await deps.email.send({ to: effect.email, subject: OTP_SUBJECT, text: otpBody(code) });
    }
    if (effect.kind === "finish") {
      await deps.store.finishOnboarding(user.id, effect.draft);
    }
  }

  await reply(deps, phone, result.messages);

  if (result.effects.some((effect) => effect.kind === "finish")) {
    await sendFirstPlan(user.id, deps, phone);
  }

  // A verified email that already has an account means this phone belongs to that account.
  if (stepBefore === "verify_email" && outcome.emailVerified) {
    await mergeWithExistingAccount(user, deps, phone);
  }
}

/** The reward for finishing sign-up: this week's plan, free, since the window is open. */
async function sendFirstPlan(userId: string, deps: BotDeps, phone: string) {
  const user = await deps.store.findUserByPhone(phone);
  if (!user || user.id !== userId) return;

  const now = user.lastInboundAt ?? new Date();
  const weekOf = startOfWeek(localDateISO(now, user.timezone), WEEK_STARTS_ON);
  const plan = await ensurePlan(deps.store, user, weekOf);
  await deliverPlan(user, plan, "weekly", deps, now);
}

/** Checks the typed code, or the resend cooldown, when the machine is waiting on a code. */
async function resolveOutcome(
  user: BotUser,
  event: Extract<InboundEvent, { type: "message" }>,
  deps: BotDeps,
  now: Date,
): Promise<StepOutcome> {
  if (user.onboarding.step !== "verify_email") return {};

  const email = user.onboarding.draft.email;
  if (!email) return {};

  if (/^resend$/i.test(event.text.trim())) {
    const lastSentAt = await deps.store.lastOtpAt(email, "signup");
    return { resendTooSoon: !canResend(lastSentAt, now) };
  }

  const typed = event.text.replace(/\D/g, "");
  if (typed.length !== 6) return {};

  const result = await deps.store.checkOtp(email, typed, now);
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
      message(
        `Welcome back${existing.name ? `, ${existing.name}` : ""}! Your preferences are all set 👇`,
      ),
    ]);
  }
}
