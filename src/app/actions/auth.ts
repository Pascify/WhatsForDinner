"use server";

import { redirect } from "next/navigation";
import { requestLoginCode, verifyLoginCode } from "@/lib/portal/data";
import { endSession, startSession } from "@/lib/auth/session";

export type LoginState = { step: "email" | "code"; email?: string; error?: string };

/** Step one: email a code. The answer is the same whether or not the address has an account. */
export async function sendLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const result = await requestLoginCode(email);

  if (!result.ok) return { step: "email", email, error: result.error };
  return { step: "code", email };
}

/** Step two: check the code and start a session. */
export async function submitLoginCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = prev.email ?? String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const timezone = String(formData.get("timezone") ?? "") || undefined;

  const result = await verifyLoginCode(email, code, timezone);
  if (!result.ok) return { step: "code", email, error: result.error };

  await startSession(result.userId);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
