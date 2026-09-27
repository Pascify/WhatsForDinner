"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/portal/plan";
import { Button, QuietButton } from "./ui";

type Action = (previous: ActionResult | undefined, form: FormData) => Promise<ActionResult>;

/** A form that says what happened, instead of failing silently. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [result, run] = useActionState(action, undefined);

  return (
    <form action={run} className={className}>
      {children}
      {result && (
        <p
          role="status"
          className={`mt-2 text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}

/** Disables itself and swaps its label while the surrounding form is running. */
export function SubmitButton({
  label,
  pendingLabel,
  quiet = false,
}: {
  label: string;
  pendingLabel: string;
  quiet?: boolean;
}) {
  const { pending } = useFormStatus();
  const Component = quiet ? QuietButton : Button;
  return (
    <Component type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </Component>
  );
}
