import type { InactiveReason, UserDoc } from "@/lib/db/types";

/** The shape the decisions below need; keeps them testable without a database. */
export type AccountFacts = {
  id: string;
  phone?: string;
  emailVerifiedAt?: Date;
  onboardingDone: boolean;
  paused?: boolean;
};

export type LinkDecision =
  | { kind: "already_linked"; userId: string }
  | { kind: "link_phone"; userId: string }
  | { kind: "needs_switch_confirmation"; userId: string; currentPhone: string }
  | { kind: "create_account" };

/**
 * What to do when a verified email is presented alongside a WhatsApp number.
 *
 * The email has already been proved by an OTP and the phone is proved by WhatsApp itself,
 * so linking them is safe. The only case that stops to ask is replacing a number that is
 * already on the account.
 */
export function decideLink(phone: string, account: AccountFacts | undefined): LinkDecision {
  if (!account) return { kind: "create_account" };
  if (!account.phone) return { kind: "link_phone", userId: account.id };
  if (account.phone === phone) return { kind: "already_linked", userId: account.id };
  return { kind: "needs_switch_confirmation", userId: account.id, currentPhone: account.phone };
}

export type Status = { status: UserDoc["status"]; inactiveReason?: InactiveReason };

/** Accounts are never deleted; they sit inactive with a reason until the gap is filled. */
export function statusFor(account: AccountFacts): Status {
  if (account.paused) return { status: "inactive", inactiveReason: "paused" };
  if (!account.emailVerifiedAt) return { status: "inactive", inactiveReason: "email_unverified" };
  if (!account.onboardingDone)
    return { status: "inactive", inactiveReason: "onboarding_incomplete" };
  return { status: "active" };
}

/** Digits only, country code first - the format the Cloud API uses for `from` and `to`. */
export function normalisePhone(input: string): string | undefined {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

/** Shown back to the user as +92 3•• •••22 so they can spot the wrong phone. */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return "•".repeat(phone.length);
  return `+${phone.slice(0, 2)} ${phone.slice(2, 3)}••  •••${phone.slice(-2)}`;
}
