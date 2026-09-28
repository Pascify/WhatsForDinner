import { ObjectId } from "mongodb";
import {
  checkCode,
  generateLinkCode,
  generateOtp,
  hashCode,
  LINK_CODE_TTL_MS,
  OTP_TTL_MS,
} from "@/lib/auth/codes";
import { SEED_MEALS } from "@/data/seedMeals";
import { statusFor } from "@/lib/accounts/policy";
import {
  adminSettings,
  deliveries,
  linkCodes,
  mealHistory,
  mealPlans,
  meals as mealsCollection,
  otpCodes,
  processedMessages,
  rateCounters,
  users,
} from "@/lib/db/collections";
import {
  DEFAULT_DELIVERY,
  type DeliveryDoc,
  type LinkCodePurpose,
  type OtpPurpose,
  type UserDoc,
} from "@/lib/db/types";
import type { History, Meal, Plan } from "@/lib/plan/types";
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
      rev: doc.onboarding.rev ?? 0,
    },
    rules: doc.rules,
    delivery: doc.delivery,
    lastInboundAt: doc.lastInboundAt,
    timezone: doc.timezone,
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
    const rev = onboarding.rev ?? 0;
    const result = await (
      await users()
    ).updateOne(
      // Accounts saved before `rev` existed have no field, which counts as 0.
      { _id: new ObjectId(userId), "onboarding.rev": rev === 0 ? { $in: [null, 0] } : rev },
      {
        $set: {
          "onboarding.step": onboarding.step,
          "onboarding.draft": onboarding.draft,
          "onboarding.rev": rev + 1,
          updatedAt: new Date(),
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async finishOnboarding(userId: string, draft: OnboardingDraft) {
    const emailVerifiedAt = new Date();
    const status = statusFor({ id: userId, emailVerifiedAt, onboardingDone: true });

    await (
      await users()
    ).updateOne(
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
    await (
      await users()
    ).updateOne(
      { _id: new ObjectId(userId) },
      { $set: { phone, phoneVerifiedAt: new Date(), updatedAt: new Date() } },
    );
  }

  async touchInbound(userId: string, at: Date) {
    await (await users()).updateOne({ _id: new ObjectId(userId) }, { $set: { lastInboundAt: at } });
  }

  async consumeLinkCode(code: string) {
    const now = new Date();
    const claimed = await (
      await linkCodes()
    ).findOneAndUpdate(
      { codeHash: hashCode(code), consumedAt: { $exists: false }, expiresAt: { $gt: now } },
      { $set: { consumedAt: now } },
    );
    if (!claimed) return undefined;
    return {
      userId: claimed.userId.toHexString(),
      purpose: claimed.purpose as LinkCodePurpose,
    };
  }

  async issueOtp(email: string, purpose: OtpPurpose, now = new Date()) {
    const code = generateOtp();
    await (
      await otpCodes()
    ).insertOne({
      _id: new ObjectId(),
      email: email.toLowerCase(),
      codeHash: hashCode(code),
      purpose,
      attempts: 0,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      createdAt: now,
    });
    return code;
  }

  async lastOtpAt(email: string, purpose: OtpPurpose) {
    const latest = await (
      await otpCodes()
    ).findOne({ email: email.toLowerCase(), purpose }, { sort: { createdAt: -1 } });
    return latest?.createdAt;
  }

  async checkOtp(email: string, code: string, now = new Date()) {
    const collection = await otpCodes();
    const record = await collection.findOne(
      { email: email.toLowerCase(), consumedAt: { $exists: false } },
      { sort: { createdAt: -1 } },
    );
    if (!record) return { ok: false as const, reason: "expired" as const };

    const result = checkCode(record, code, now);
    await collection.updateOne(
      { _id: record._id },
      result.ok ? { $set: { consumedAt: now } } : { $inc: { attempts: 1 } },
    );
    return result;
  }

  async mealsFor(userId: string) {
    const own = await (await mealsCollection()).find({ ownerId: new ObjectId(userId) }).toArray();

    const hidden = new Set(own.filter((meal) => meal.hidden).map((meal) => meal.id));
    const seeded = SEED_MEALS.filter((meal) => !hidden.has(meal.id));
    const added: Meal[] = own
      .filter((meal) => !meal.hidden)
      .map(({ id, name, tags }) => ({ id, name, tags }));

    return [...seeded, ...added];
  }

  async historyFor(userId: string) {
    const rows = await (
      await mealHistory()
    )
      .find({ userId: new ObjectId(userId) })
      .sort({ servedOn: -1 })
      .toArray();

    const history: History = {};
    for (const row of rows) history[row.mealId] ??= row.servedOn;
    return history;
  }

  async findPlan(userId: string, weekOf: string) {
    const doc = await (await mealPlans()).findOne({ userId: new ObjectId(userId), weekOf });
    if (!doc) return undefined;
    return { weekOf: doc.weekOf, days: doc.days, relaxations: doc.relaxations, seed: doc.seed };
  }

  async savePlan(userId: string, plan: Plan) {
    const id = new ObjectId(userId);
    await (
      await mealPlans()
    ).updateOne(
      { userId: id, weekOf: plan.weekOf },
      {
        $set: { days: plan.days, relaxations: plan.relaxations, seed: plan.seed },
        $setOnInsert: { userId: id, weekOf: plan.weekOf, status: "pending", createdAt: new Date() },
      },
      { upsert: true },
    );
    await this.recordServed(
      id,
      plan.days.map((day) => ({ mealId: day.mealId, servedOn: day.date })),
    );
  }

  async setPlanDay(userId: string, weekOf: string, date: string, mealId: string) {
    const id = new ObjectId(userId);
    await (
      await mealPlans()
    ).updateOne({ userId: id, weekOf, "days.date": date }, { $set: { "days.$.mealId": mealId } });
    await this.recordServed(id, [{ mealId, servedOn: date }]);
  }

  /** History drives repeat avoidance, so it is written whenever a meal lands on a date. */
  private async recordServed(userId: ObjectId, entries: { mealId: string; servedOn: string }[]) {
    if (entries.length === 0) return;
    const collection = await mealHistory();
    await collection.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: { userId, mealId: entry.mealId, servedOn: entry.servedOn },
          update: { $setOnInsert: { _id: new ObjectId(), userId, ...entry } },
          upsert: true,
        },
      })),
    );
  }

  async setPaused(userId: string, paused: boolean) {
    await (
      await users()
    ).updateOne(
      { _id: new ObjectId(userId) },
      paused
        ? { $set: { status: "inactive", inactiveReason: "paused", updatedAt: new Date() } }
        : { $set: { status: "active", updatedAt: new Date() }, $unset: { inactiveReason: "" } },
    );
  }

  async deleteUser(userId: string) {
    const id = new ObjectId(userId);
    await Promise.all([
      (await users()).deleteOne({ _id: id }),
      (await mealPlans()).deleteMany({ userId: id }),
      (await mealHistory()).deleteMany({ userId: id }),
      (await mealsCollection()).deleteMany({ ownerId: id }),
    ]);
  }

  async issueLoginLink(userId: string) {
    const code = generateLinkCode();
    await (
      await linkCodes()
    ).insertOne({
      _id: new ObjectId(),
      codeHash: hashCode(code),
      purpose: "portal_login",
      userId: new ObjectId(userId),
      expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      createdAt: new Date(),
    });
    const base = process.env.APP_URL ?? "https://hammad.vercel.app/projects/whatsfordinner";
    return `${base}/login/${code}`;
  }

  async findPendingPlan(userId: string) {
    const doc = await (
      await mealPlans()
    ).findOne({ userId: new ObjectId(userId), status: "pending" }, { sort: { weekOf: -1 } });
    if (!doc) return undefined;
    return { weekOf: doc.weekOf, days: doc.days, relaxations: doc.relaxations, seed: doc.seed };
  }

  async markPlanDelivered(userId: string, weekOf: string, via: "service" | "template" | "email") {
    await (
      await mealPlans()
    ).updateOne(
      { userId: new ObjectId(userId), weekOf },
      { $set: { status: "delivered", deliveredAt: new Date(), deliveredVia: via } },
    );
  }

  async logDelivery(entry: Omit<DeliveryDoc, "_id" | "userId" | "sentAt"> & { userId: string }) {
    const { userId, ...rest } = entry;
    await (
      await deliveries()
    ).insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      sentAt: new Date(),
      ...rest,
    });
  }

  /** Paid sends are capped per calendar month; the count resets when the month rolls over. */
  async activeAutoUsers() {
    const docs = await (
      await users()
    )
      .find({ status: "active", "delivery.mode": "auto", phone: { $type: "string" } })
      .toArray();
    return docs.map(toBotUser);
  }

  async paidBudget() {
    const month = new Date().toISOString().slice(0, 7);
    const collection = await adminSettings();
    const doc = await collection.findOne({ _id: "admin" });

    if (!doc) {
      const fresh = {
        _id: "admin" as const,
        paidMonthlyCap: 50,
        paidKillSwitch: false,
        countingMonth: month,
        paidSentThisMonth: 0,
      };
      await collection.insertOne(fresh);
      return { cap: fresh.paidMonthlyCap, sentThisMonth: 0, killSwitch: false };
    }

    return {
      cap: doc.paidMonthlyCap,
      killSwitch: doc.paidKillSwitch,
      sentThisMonth: doc.countingMonth === month ? doc.paidSentThisMonth : 0,
    };
  }

  async recordPaidSend() {
    const month = new Date().toISOString().slice(0, 7);
    const collection = await adminSettings();
    const reset = await collection.updateOne(
      { _id: "admin", countingMonth: { $ne: month } },
      { $set: { countingMonth: month, paidSentThisMonth: 1 } },
    );
    if (reset.modifiedCount === 0) {
      await collection.updateOne({ _id: "admin" }, { $inc: { paidSentThisMonth: 1 } });
    }
  }

  async bumpCounter(key: string, expiresAt: Date) {
    const doc = await (
      await rateCounters()
    ).findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after" },
    );
    return doc?.count ?? 1;
  }

  async seenMessage(messageId: string) {
    try {
      await (
        await processedMessages()
      ).insertOne({
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
