import { ObjectId } from "mongodb";
import { checkCode, generateOtp, hashCode, OTP_TTL_MS } from "@/lib/auth/codes";
import { statusFor } from "@/lib/accounts/policy";
import { linkCodes, otpCodes, processedMessages, users } from "@/lib/db/collections";
import { DEFAULT_DELIVERY, type LinkCodePurpose, type OtpPurpose, type UserDoc } from "@/lib/db/types";
import { emptyDraft, type OnboardingDraft } from "./onboarding";
import type { BotStore, BotUser } from "./store";

const PROCESSED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function toBotUser(doc: UserDoc): BotUser {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    emailVerifiedAt: doc.emailVerifiedAt,
    status: doc.status,
    onboarding: {
      step: doc.onboarding.step,
      draft: (doc.onboarding.draft as OnboardingDraft | undefined) ?? emptyDraft(),
    },
    rules: doc.rules,
    delivery: doc.delivery,
    lastInboundAt: doc.lastInboundAt,
  };
}

/** The real BotStore. Mirrors MemoryBotStore, which is what the tests run against. */
export class MongoBotStore implements BotStore {
  async findUserByPhone(phone: string) {
    const doc = await (await users()).findOne({ phone });
    return doc ? toBotUser(doc) : undefined;
  }

  async findUserByEmail(email: string) {
    const doc = await (await users()).findOne({ email: email.toLowerCase() });
    return doc ? toBotUser(doc) : undefined;
  }

  async createUser(data: { phone?: string; channel: "portal" | "whatsapp" }) {
    const now = new Date();
    const doc: UserDoc = {
      _id: new ObjectId(),
      phone: data.phone,
      phoneVerifiedAt: data.phone ? now : undefined,
      status: "inactive",
      inactiveReason: "onboarding_incomplete",
      role: "user",
      timezone: "Asia/Karachi",
      onboarding: { step: "ask_name", channel: data.channel, draft: emptyDraft() },
      rules: [],
      delivery: structuredClone(DEFAULT_DELIVERY),
      createdAt: now,
      updatedAt: now,
    };
    await (await users()).insertOne(doc);
    return toBotUser(doc);
  }

  async saveOnboarding(userId: string, onboarding: BotUser["onboarding"]) {
    await (await users()).updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          "onboarding.step": onboarding.step,
          "onboarding.draft": onboarding.draft,
          updatedAt: new Date(),
        },
      },
    );
  }

  async finishOnboarding(userId: string, draft: OnboardingDraft) {
    const emailVerifiedAt = new Date();
    const status = statusFor({ id: userId, emailVerifiedAt, onboardingDone: true });

    await (await users()).updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          name: draft.name,
          email: draft.email,
          emailVerifiedAt,
          rules: draft.rules,
          delivery: draft.delivery,
          status: status.status,
          "onboarding.step": "done" as const,
          "onboarding.draft": draft,
          updatedAt: emailVerifiedAt,
        },
        $unset: { inactiveReason: "" },
      },
    );
  }

  async linkPhone(userId: string, phone: string) {
    await (await users()).updateOne(
      { _id: new ObjectId(userId) },
      { $set: { phone, phoneVerifiedAt: new Date(), updatedAt: new Date() } },
    );
  }

  async touchInbound(userId: string, at: Date) {
    await (await users()).updateOne({ _id: new ObjectId(userId) }, { $set: { lastInboundAt: at } });
  }

  async consumeLinkCode(code: string) {
    const now = new Date();
    const claimed = await (await linkCodes()).findOneAndUpdate(
      { codeHash: hashCode(code), consumedAt: { $exists: false }, expiresAt: { $gt: now } },
      { $set: { consumedAt: now } },
    );
    if (!claimed) return undefined;
    return {
      userId: claimed.userId.toHexString(),
      purpose: claimed.purpose as LinkCodePurpose,
    };
  }

  async issueOtp(email: string, purpose: OtpPurpose) {
    const code = generateOtp();
    await (await otpCodes()).insertOne({
      _id: new ObjectId(),
      email: email.toLowerCase(),
      codeHash: hashCode(code),
      purpose,
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      createdAt: new Date(),
    });
    return code;
  }

  async checkOtp(email: string, code: string) {
    const collection = await otpCodes();
    const record = await collection.findOne(
      { email: email.toLowerCase(), consumedAt: { $exists: false } },
      { sort: { createdAt: -1 } },
    );
    if (!record) return { ok: false as const, reason: "expired" as const };

    const result = checkCode(record, code);
    await collection.updateOne(
      { _id: record._id },
      result.ok ? { $set: { consumedAt: new Date() } } : { $inc: { attempts: 1 } },
    );
    return result;
  }

  async seenMessage(messageId: string) {
    try {
      await (await processedMessages()).insertOne({
        _id: new ObjectId(),
        messageId,
        expiresAt: new Date(Date.now() + PROCESSED_TTL_MS),
      });
      return false;
    } catch {
      // The unique index rejected it, so this delivery is a retry of one already handled.
      return true;
    }
  }
}
