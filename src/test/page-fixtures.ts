import { ObjectId } from "mongodb";
import { DEFAULT_DELIVERY, type UserDoc } from "@/lib/db/types";

/** A saved account, as a page would read it back from Mongo. */
export function userDoc(over: Partial<UserDoc> = {}): UserDoc {
  return {
    _id: new ObjectId("6ab749696b5a9d1a64f884c7"),
    name: "Hammad",
    email: "cook@example.com",
    phone: "923001234567",
    emailVerifiedAt: new Date("2026-09-01T00:00:00Z"),
    status: "active",
    role: "user",
    timezone: "Asia/Karachi",
    onboarding: { step: "done", channel: "portal" },
    rules: [],
    delivery: structuredClone(DEFAULT_DELIVERY),
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}
