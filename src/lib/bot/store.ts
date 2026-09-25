import type { DeliverySettings, LinkCodePurpose, OnboardingStep, OtpPurpose } from "@/lib/db/types";
import type { Rule } from "@/lib/plan/types";
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
  onboarding: { step: OnboardingStep; draft: OnboardingDraft };
  rules: Rule[];
  delivery: DeliverySettings;
  lastInboundAt?: Date;
};

/**
 * Everything the bot needs to read or write. Implemented once against MongoDB and once in
 * memory, so the conversation can be tested end to end without a database.
 */
export interface BotStore {
  findUserByPhone(phone: string): Promise<BotUser | undefined>;
  findUserByEmail(email: string): Promise<BotUser | undefined>;
  createUser(data: { phone?: string; channel: "portal" | "whatsapp" }): Promise<BotUser>;
  saveOnboarding(userId: string, onboarding: BotUser["onboarding"]): Promise<void>;
  finishOnboarding(userId: string, draft: OnboardingDraft): Promise<void>;
  linkPhone(userId: string, phone: string): Promise<void>;
  touchInbound(userId: string, at: Date): Promise<void>;

  /** Returns and burns a portal-issued code such as WFD-7Q4K. */
  consumeLinkCode(code: string): Promise<{ userId: string; purpose: LinkCodePurpose } | undefined>;

  /** Stores a hashed one-time code and hands back the plain one to email. */
  issueOtp(email: string, purpose: OtpPurpose): Promise<string>;
  checkOtp(email: string, code: string): Promise<CodeCheck>;

  /** True when this webhook message was already handled; Meta retries deliveries. */
  seenMessage(messageId: string): Promise<boolean>;
}
