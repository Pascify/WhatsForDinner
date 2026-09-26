import type { ObjectId } from "mongodb";
import type { Meal, Plan, Rule, Weekday } from "@/lib/plan/types";

/** Why an account is not active. Accounts are never deleted automatically. */
export type InactiveReason = "email_unverified" | "onboarding_incomplete" | "paused";

/** What to do when the free 24h WhatsApp window is closed at send time. */
export type ClosedWindowChannel = "wait" | "email" | "whatsapp";

export type DeliverySettings = {
  mode: "on_request" | "auto";
  weekly: { enabled: boolean; weekday: Weekday; hour: number };
  daily: { enabled: boolean; hour: number; weekdays: Weekday[] };
  whenClosed: ClosedWindowChannel;
  /** Recorded when the user opts into paid messages, as Meta requires. */
  paidOptInAt?: Date;
  paidOptInSource?: "portal" | "whatsapp";
};

export const DEFAULT_DELIVERY: DeliverySettings = {
  mode: "auto",
  weekly: { enabled: true, weekday: 6, hour: 18 },
  daily: { enabled: false, hour: 16, weekdays: [0, 1, 2, 3, 4, 5, 6] },
  whenClosed: "email",
};

export type OnboardingStep =
  | "ask_name"
  | "ask_email"
  | "verify_email"
  | "ask_diet"
  | "ask_halal"
  | "ask_restrictions"
  | "ask_day_rule"
  | "ask_day_rule_tags"
  | "ask_delivery"
  | "ask_fallback"
  | "done";

export type UserDoc = {
  _id: ObjectId;
  name?: string;
  email?: string;
  emailVerifiedAt?: Date;
  /** Digits only, country code first, no plus. Matches what the Cloud API sends. */
  phone?: string;
  phoneVerifiedAt?: Date;
  status: "active" | "inactive";
  inactiveReason?: InactiveReason;
  role: "user" | "admin";
  /** IANA zone, e.g. Asia/Karachi. Drives when the weekly job fires for this user. */
  timezone: string;
  onboarding: { step: OnboardingStep; channel: "portal" | "whatsapp"; draft?: Record<string, unknown> };
  rules: Rule[];
  repeatGapDays?: number;
  delivery: DeliverySettings;
  /** Last inbound WhatsApp message; the free window is 24h from here. */
  lastInboundAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** Someone who only receives a plan: no email, no portal account. */
export type RecipientDoc = {
  _id: ObjectId;
  ownerId: ObjectId;
  name?: string;
  phone: string;
  phoneVerifiedAt: Date;
  whenClosed: Extract<ClosedWindowChannel, "wait" | "whatsapp">;
  status: "active" | "paused";
  lastInboundAt?: Date;
  createdAt: Date;
};

export type MealDoc = Meal & { _id: ObjectId; ownerId?: ObjectId };

export type MealPlanDoc = Plan & {
  _id: ObjectId;
  userId: ObjectId;
  status: "pending" | "delivered";
  deliveredAt?: Date;
  deliveredVia?: "service" | "template" | "email";
  createdAt: Date;
};

export type MealHistoryDoc = {
  _id: ObjectId;
  userId: ObjectId;
  mealId: string;
  /** ISO date, YYYY-MM-DD */
  servedOn: string;
};

/** One row per outbound message, so free vs paid is always auditable. */
export type DeliveryDoc = {
  _id: ObjectId;
  userId?: ObjectId;
  recipientId?: ObjectId;
  channel: "whatsapp_service" | "whatsapp_template" | "email";
  kind: "weekly" | "daily" | "reply" | "otp";
  paid: boolean;
  messageId?: string;
  error?: string;
  sentAt: Date;
};

export type OtpPurpose = "signup" | "login" | "link_email";

export type OtpDoc = {
  _id: ObjectId;
  email: string;
  codeHash: string;
  purpose: OtpPurpose;
  attempts: number;
  /** TTL index drops the document once this passes. */
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
};

export type LinkCodePurpose = "connect_whatsapp" | "join_recipient" | "portal_login";

export type LinkCodeDoc = {
  _id: ObjectId;
  codeHash: string;
  purpose: LinkCodePurpose;
  userId: ObjectId;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
};

/** Meta retries webhook deliveries; this keeps us from acting twice. */
export type ProcessedMessageDoc = {
  _id: ObjectId;
  messageId: string;
  expiresAt: Date;
};

export type SessionDoc = {
  _id: ObjectId;
  /** The cookie value is never stored, only its hash. */
  tokenHash: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
};

export type AdminSettingsDoc = {
  _id: "admin";
  paidMonthlyCap: number;
  paidKillSwitch: boolean;
  /** YYYY-MM of the count below. */
  countingMonth: string;
  paidSentThisMonth: number;
};
