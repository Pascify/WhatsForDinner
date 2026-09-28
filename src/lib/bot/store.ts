import type {
  DeliveryDoc,
  DeliverySettings,
  LinkCodePurpose,
  OnboardingStep,
  OtpPurpose,
} from "@/lib/db/types";
import type { PaidBudget } from "@/lib/delivery/decide";
import type { History, Meal, Plan, Rule } from "@/lib/plan/types";
import type { CodeCheck } from "@/lib/auth/codes";
import type { OnboardingDraft } from "./onboarding";

/** The slice of an account the bot needs. Keeps the handler free of Mongo details. */
export type BotUser = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  emailVerifiedAt?: Date;
  status: "active" | "inactive";
  /** `rev` counts saves, so a stale read cannot overwrite a newer step. */
  onboarding: { step: OnboardingStep; draft: OnboardingDraft; rev?: number };
  rules: Rule[];
  delivery: DeliverySettings;
  lastInboundAt?: Date;
  /** IANA zone; "today" and the weekly send time are both local to the user. */
  timezone: string;
};

/**
 * Everything the bot needs to read or write. Implemented once against MongoDB and once in
 * memory, so the conversation can be tested end to end without a database.
 */
export interface BotStore {
  findUserByPhone(phone: string): Promise<BotUser | undefined>;
  findUserByEmail(email: string): Promise<BotUser | undefined>;
  /** Throws when the phone already has an account, like the unique index does. */
  createUser(data: { phone?: string; channel: "portal" | "whatsapp" }): Promise<BotUser>;
  /**
   * Saves only if `onboarding.rev` still matches what is stored, and bumps it. False means a
   * parallel delivery for the same user got there first.
   */
  saveOnboarding(userId: string, onboarding: BotUser["onboarding"]): Promise<boolean>;
  finishOnboarding(userId: string, draft: OnboardingDraft): Promise<void>;
  linkPhone(userId: string, phone: string): Promise<void>;
  touchInbound(userId: string, at: Date): Promise<void>;

  /** Returns and burns a portal-issued code such as WFD-7Q4K. */
  consumeLinkCode(code: string): Promise<{ userId: string; purpose: LinkCodePurpose } | undefined>;

  /** Stores a hashed one-time code and hands back the plain one to email. */
  issueOtp(email: string, purpose: OtpPurpose, now?: Date): Promise<string>;
  /** When the newest code for this email went out, for the resend cooldown. */
  lastOtpAt(email: string, purpose: OtpPurpose): Promise<Date | undefined>;
  checkOtp(email: string, code: string, now?: Date): Promise<CodeCheck>;

  /** True when this webhook message was already handled; Meta retries deliveries. */
  seenMessage(messageId: string): Promise<boolean>;
  /** Adds one to a counter that disappears at `expiresAt`, and returns the new count. */
  bumpCounter(key: string, expiresAt: Date): Promise<number>;

  /** The seeded catalog plus this user's own meals, minus the ones they hid. */
  mealsFor(userId: string): Promise<Meal[]>;
  /** When each meal was last served, which is what keeps weeks from repeating. */
  historyFor(userId: string): Promise<History>;
  findPlan(userId: string, weekOf: string): Promise<Plan | undefined>;
  savePlan(userId: string, plan: Plan): Promise<void>;
  setPlanDay(userId: string, weekOf: string, date: string, mealId: string): Promise<void>;
  setPaused(userId: string, paused: boolean): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  /** A one-time link that signs the user into the portal. */
  issueLoginLink(userId: string): Promise<string>;

  /** The most recent plan that has not reached the user yet. */
  findPendingPlan(userId: string): Promise<Plan | undefined>;
  markPlanDelivered(
    userId: string,
    weekOf: string,
    via: "service" | "template" | "email",
  ): Promise<void>;
  /** One row per outbound message, so free vs paid stays auditable. */
  logDelivery(
    entry: Omit<DeliveryDoc, "_id" | "userId" | "sentAt"> & { userId: string },
  ): Promise<void>;
  paidBudget(): Promise<PaidBudget>;
  recordPaidSend(): Promise<void>;
  /** Active accounts set to automatic delivery; the hourly job filters these by local time. */
  activeAutoUsers(): Promise<BotUser[]>;
}
