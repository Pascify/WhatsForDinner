import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { hashCode } from "./codes";
import { sessions, users } from "@/lib/db/collections";
import type { UserDoc } from "@/lib/db/types";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 32 random bytes: long enough that guessing is hopeless, short enough for a cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Stores the hash of a new token and hands back the token itself. */
export async function createSession(userId: string, now = new Date()): Promise<string> {
  const token = generateSessionToken();

  await (await sessions()).insertOne({
    _id: new ObjectId(),
    tokenHash: hashCode(token),
    userId: new ObjectId(userId),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });

  return token;
}

/** The account behind a session token, or undefined if it is unknown or expired. */
export async function userForToken(token: string, now = new Date()): Promise<UserDoc | undefined> {
  const session = await (await sessions()).findOne({
    tokenHash: hashCode(token),
    expiresAt: { $gt: now },
  });
  if (!session) return undefined;

  return (await (await users()).findOne({ _id: session.userId })) ?? undefined;
}

export async function deleteSession(token: string): Promise<void> {
  await (await sessions()).deleteOne({ tokenHash: hashCode(token) });
}
