import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { hashCode } from "./codes";
import { sessions, users } from "@/lib/db/collections";
import type { UserDoc } from "@/lib/db/types";

export const SESSION_COOKIE = "wfd_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 32 random bytes: long enough that guessing is hopeless, short enough for a cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Stores the hash, hands back the token, and sets the cookie. */
export async function startSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const now = new Date();

  await (await sessions()).insertOne({
    _id: new ObjectId(),
    tokenHash: hashCode(token),
    userId: new ObjectId(userId),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** The signed-in user, or undefined. Every page and server action calls this itself. */
export async function currentUser(): Promise<UserDoc | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;

  const session = await (await sessions()).findOne({
    tokenHash: hashCode(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return undefined;

  return (await (await users()).findOne({ _id: session.userId })) ?? undefined;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await (await sessions()).deleteOne({ tokenHash: hashCode(token) });
  store.delete(SESSION_COOKIE);
}
