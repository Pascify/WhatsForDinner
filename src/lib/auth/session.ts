import "server-only";
import { cookies } from "next/headers";
import type { UserDoc } from "@/lib/db/types";
import { createSession, deleteSession, SESSION_TTL_MS, userForToken } from "./session-store";

export const SESSION_COOKIE = "wfd_session";

export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId);

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
  return token ? userForToken(token) : undefined;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}
