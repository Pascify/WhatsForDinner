import type { Collection } from "mongodb";
import { getDb } from "./mongo";
import type {
  AdminSettingsDoc,
  DeliveryDoc,
  LinkCodeDoc,
  MealDoc,
  MealHistoryDoc,
  MealPlanDoc,
  OtpDoc,
  ProcessedMessageDoc,
  RecipientDoc,
  SessionDoc,
  UserDoc,
} from "./types";

async function collection<T extends Document | object>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export const users = () => collection<UserDoc>("users");
export const recipients = () => collection<RecipientDoc>("recipients");
export const meals = () => collection<MealDoc>("meals");
export const mealPlans = () => collection<MealPlanDoc>("mealPlans");
export const mealHistory = () => collection<MealHistoryDoc>("mealHistory");
export const deliveries = () => collection<DeliveryDoc>("deliveries");
export const otpCodes = () => collection<OtpDoc>("otpCodes");
export const linkCodes = () => collection<LinkCodeDoc>("linkCodes");
export const processedMessages = () => collection<ProcessedMessageDoc>("processedMessages");
export const adminSettings = () => collection<AdminSettingsDoc>("adminSettings");
export const sessions = () => collection<SessionDoc>("sessions");

/**
 * Idempotent; safe to run on every deploy. The `expiresAt` TTL indexes are what keep the
 * free 512 MB from filling up with one-time codes and webhook receipts.
 */
export async function ensureIndexes(): Promise<void> {
  const [
    usersCol,
    recipientsCol,
    mealsCol,
    plansCol,
    historyCol,
    deliveriesCol,
    otpCol,
    linkCol,
    processedCol,
    sessionsCol,
  ] = await Promise.all([
    users(),
    recipients(),
    meals(),
    mealPlans(),
    mealHistory(),
    deliveries(),
    otpCodes(),
    linkCodes(),
    processedMessages(),
    sessions(),
  ]);

  await Promise.all([
    // One account per email and per phone; sparse so half-finished sign-ups are allowed.
    usersCol.createIndex({ email: 1 }, { unique: true, sparse: true }),
    usersCol.createIndex({ phone: 1 }, { unique: true, sparse: true }),
    usersCol.createIndex({ status: 1, "delivery.mode": 1 }),

    recipientsCol.createIndex({ phone: 1 }, { unique: true }),
    recipientsCol.createIndex({ ownerId: 1 }),

    mealsCol.createIndex({ ownerId: 1 }),
    mealsCol.createIndex({ id: 1, ownerId: 1 }, { unique: true }),

    plansCol.createIndex({ userId: 1, weekOf: 1 }, { unique: true }),
    plansCol.createIndex({ userId: 1, status: 1 }),

    historyCol.createIndex({ userId: 1, mealId: 1 }),
    historyCol.createIndex({ userId: 1, servedOn: -1 }),

    deliveriesCol.createIndex({ sentAt: -1 }),
    deliveriesCol.createIndex({ paid: 1, sentAt: -1 }),

    otpCol.createIndex({ email: 1, purpose: 1 }),
    otpCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

    linkCol.createIndex({ codeHash: 1 }, { unique: true }),
    linkCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

    processedCol.createIndex({ messageId: 1 }, { unique: true }),
    processedCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

    sessionsCol.createIndex({ tokenHash: 1 }, { unique: true }),
    sessionsCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
