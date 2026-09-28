"use client";

import { useActionState } from "react";
import { sendLoginCode, submitLoginCode, type LoginState } from "@/app/actions/auth";
import { Button, Input } from "@/components/ui";

const START: LoginState = { step: "email" };

export function LoginForm() {
  const [emailState, askForCode, askPending] = useActionState(sendLoginCode, START);
  const [codeState, checkCode, checkPending] = useActionState(submitLoginCode, {
    ...START,
    step: "code",
    email: emailState.email,
  });

  if (emailState.step === "email") {
    return (
      <form action={askForCode} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={emailState.email}
          autoFocus
        />
        {emailState.error && <p className="text-sm text-red-600">{emailState.error}</p>}
        <Button type="submit" disabled={askPending} className="w-full">
          {askPending ? "Sending…" : "Email me a code"}
        </Button>
        <p className="text-xs text-stone-500">
          No password. We send a 6-digit code that works for 10 minutes.
        </p>
      </form>
    );
  }

  return (
    <form action={checkCode} className="space-y-3">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        A code is on its way to <span className="font-medium">{emailState.email}</span>. New here?
        Entering it creates your account.
      </p>
      <input type="hidden" name="email" value={emailState.email} />
      <input
        type="hidden"
        name="timezone"
        value={Intl.DateTimeFormat().resolvedOptions().timeZone}
      />
      <label className="block text-sm font-medium" htmlFor="code">
        6-digit code
      </label>
      <Input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        autoFocus
      />
      {codeState.error && <p className="text-sm text-red-600">{codeState.error}</p>}
      <Button type="submit" disabled={checkPending} className="w-full">
        {checkPending ? "Checking…" : "Log in"}
      </Button>
    </form>
  );
}
