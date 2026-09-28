import { ObjectId } from "mongodb";
import {
  canResend,
  checkCode,
  generateLinkCode,
  generateOtp,
  hashCode,
  LINK_CODE_TTL_MS,
  OTP_TTL_MS,
} from "@/lib/auth/codes";
import { linkCodes, otpCodes, users } from "@/lib/db/collections";
import { MongoBotStore } from "@/lib/bot/mongo-store";
import type { BotUser } from "@/lib/bot/store";
import { DEFAULT_DELIVERY, type UserDoc } from "@/lib/db/types";
import { emailSenderFromEnv } from "@/lib/email/smtp";
import type { EmailSender } from "@/lib/email/types";

export const store = new MongoBotStore();

/** The portal and the bot share one account shape, so pages reuse BotUser. */
export function toBotUser(doc: UserDoc): BotUser {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    emailVerifiedAt: doc.emailVerifiedAt,
    status: doc.status,
    onboarding: { step: doc.onboarding.step, draft: doc.onboarding.draft as never },
    rules: doc.rules,
    delivery: doc.delivery,
    lastInboundAt: doc.lastInboundAt,
    timezone: doc.timezone,
  };
}

export type LoginRequest = { ok: true } | { ok: false; error: string };

/**
 * Emails a one-time code. The reply never says whether the address has an account, so the
 * form cannot be used to find out who is registered.
 */
export async function requestLoginCode(
  rawEmail: string,
  sender: EmailSender = emailSenderFromEnv(),
  now = new Date(),
): Promise<LoginRequest> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const collection = await otpCodes();
  const recent = await collection.findOne({ email, purpose: "login" }, { sort: { createdAt: -1 } });
  if (recent && !canResend(recent.createdAt, now)) {
    return { ok: false, error: "Hold on a moment before asking for another code." };
  }

  const code = generateOtp();
  await collection.insertOne({
    _id: new ObjectId(),
    email,
    codeHash: hashCode(code),
    purpose: "login",
    attempts: 0,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    createdAt: now,
  });

  await sender.send({
    to: email,
    subject: "Your WhatsForDinner code",
    text: `Your code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
  });

  return { ok: true };
}

export type LoginResult = { ok: true; userId: string } | { ok: false; error: string };

export async function verifyLoginCode(
  rawEmail: string,
  code: string,
  timezone = "Asia/Karachi",
): Promise<LoginResult> {
  const email = rawEmail.trim().toLowerCase();
  const collection = await otpCodes();
  const record = await collection.findOne(
    { email, purpose: "login", consumedAt: { $exists: false } },
    { sort: { createdAt: -1 } },
  );
  if (!record) return { ok: false, error: "Ask for a new code." };

  const result = checkCode(record, code);
  if (!result.ok) {
    await collection.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    const messages: Record<string, string> = {
      wrong_code: "That code isn't right.",
      expired: "That code has expired. Ask for a new one.",
      already_used: "That code was already used.",
      too_many_attempts: "Too many tries. Ask for a new code.",
    };
    return { ok: false, error: messages[result.reason] };
  }

  await collection.updateOne({ _id: record._id }, { $set: { consumedAt: new Date() } });

  const account = await (await users()).findOne({ email });
  if (account) return { ok: true, userId: account._id.toHexString() };

  // First time on the portal: the verified code is enough to open an account.
  return { ok: true, userId: await createPortalAccount(email, timezone) };
}

/** Sign-up is just a verified email: preferences and WhatsApp are set up afterwards. */
async function createPortalAccount(email: string, timezone: string): Promise<string> {
  const now = new Date();
  const doc: UserDoc = {
    _id: new ObjectId(),
    email,
    emailVerifiedAt: now,
    status: "active",
    role: "user",
    timezone,
    onboarding: { step: "done", channel: "portal" },
    rules: [],
    delivery: structuredClone(DEFAULT_DELIVERY),
    createdAt: now,
    updatedAt: now,
  };

  await (await users()).insertOne(doc);
  return doc._id.toHexString();
}

/** Burns a one-time login link sent over WhatsApp. */
export async function consumeLoginLink(code: string): Promise<string | undefined> {
  const claimed = await (
    await linkCodes()
  ).findOneAndUpdate(
    {
      codeHash: hashCode(code),
      purpose: "portal_login",
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
  );
  return claimed?.userId.toHexString();
}

/** A fresh code the user sends from WhatsApp to connect their number. */
export async function issueConnectCode(userId: string): Promise<string> {
  const code = generateLinkCode();

  await (
    await linkCodes()
  ).insertOne({
    _id: new ObjectId(),
    codeHash: hashCode(code),
    purpose: "connect_whatsapp",
    userId: new ObjectId(userId),
    expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
    createdAt: new Date(),
  });

  return code;
}

/** Portal writes that are not part of the bot's own store. */
export async function updateDelivery(userId: string, delivery: UserDoc["delivery"]): Promise<void> {
  await (
    await users()
  ).updateOne({ _id: new ObjectId(userId) }, { $set: { delivery, updatedAt: new Date() } });
}

export async function updateRules(userId: string, rules: UserDoc["rules"]): Promise<void> {
  await (
    await users()
  ).updateOne({ _id: new ObjectId(userId) }, { $set: { rules, updatedAt: new Date() } });
}

export async function updateTimezone(userId: string, timezone: string): Promise<void> {
  await (
    await users()
  ).updateOne({ _id: new ObjectId(userId) }, { $set: { timezone, updatedAt: new Date() } });
}
