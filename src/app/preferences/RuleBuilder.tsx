"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ActionForm";
import type { ActionResult } from "@/lib/portal/plan";
import {
  DAYS,
  describeRule,
  GROUP_LABELS,
  groupTags,
  RULE_CHOICES,
  type RuleKindChoice,
} from "@/lib/portal/rules";
import type { Rule, Tag, Weekday } from "@/lib/plan/types";

type Action = (previous: ActionResult | undefined, form: FormData) => Promise<ActionResult>;
type How = "at_most" | "at_least" | "exactly";

const SELECT =
  "rounded-lg border border-stone-300 bg-white px-2 py-1 dark:border-stone-700 dark:bg-stone-900";

const LEAD: Record<RuleKindChoice, string> = {
  never: "I don't eat",
  always: "Every dinner must be",
  day: "I want",
  quota: "I want",
};

/** Pick a kind of rule first, then fill in a sentence that only asks what that kind needs. */
export function RuleBuilder({ action }: { action: Action }) {
  const [kind, setKind] = useState<RuleKindChoice>();
  const [tags, setTags] = useState<Tag[]>([]);
  const [day, setDay] = useState<Weekday>(5);
  const [how, setHow] = useState<How>("at_most");
  const [count, setCount] = useState(2);

  const [result, run] = useActionState(async (previous: ActionResult | undefined, form: FormData) => {
    const outcome = await action(previous, form);
    if (outcome.ok) {
      setKind(undefined);
      setTags([]);
    }
    return outcome;
  }, undefined);

  const choice = RULE_CHOICES.find((option) => option.kind === kind);
  const toggle = (tag: Tag) =>
    setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  const draft: Rule | undefined =
    kind && tags.length > 0
      ? kind === "day"
        ? { kind, day, tags }
        : kind === "quota"
          ? {
              kind,
              tags,
              ...(how !== "at_least" ? { max: count } : {}),
              ...(how !== "at_most" ? { min: count } : {}),
            }
          : { kind, tags }
      : undefined;

  return (
    <div className="space-y-4 border-t border-stone-200 pt-4 text-sm dark:border-stone-800">
      <fieldset>
        <legend className="mb-2 font-medium">Add a rule</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {RULE_CHOICES.map((option) => (
            <label
              key={option.kind}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                kind === option.kind
                  ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                  : "border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
              }`}
            >
              <input
                type="radio"
                name="ruleType"
                value={option.kind}
                checked={kind === option.kind}
                onChange={() => {
                  setKind(option.kind);
                  setTags([]);
                }}
                className="sr-only"
              />
              <span className="block font-medium">{option.title}</span>
              <span className="text-xs text-stone-500">e.g. {option.example}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {choice && (
        <form action={run} className="space-y-4 rounded-lg bg-stone-50 p-4 dark:bg-stone-800/40">
          <input type="hidden" name="kind" value={choice.kind} />

          <p className="flex flex-wrap items-center gap-2">
            {choice.kind === "day" && (
              <>
                On
                <select
                  name="day"
                  aria-label="Day"
                  value={day}
                  onChange={(event) => setDay(Number(event.target.value) as Weekday)}
                  className={SELECT}
                >
                  {DAYS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}s
                    </option>
                  ))}
                </select>
              </>
            )}
            <span>{LEAD[choice.kind]}</span>
            <span className="font-medium">{tags.length > 0 ? tags.join(", ") : "…"}</span>
            {choice.kind === "quota" && (
              <>
                <select
                  name="how"
                  aria-label="How often"
                  value={how}
                  onChange={(event) => setHow(event.target.value as How)}
                  className={SELECT}
                >
                  <option value="at_most">at most</option>
                  <option value="at_least">at least</option>
                  <option value="exactly">exactly</option>
                </select>
                <input
                  type="number"
                  name="times"
                  aria-label="Times a week"
                  min={1}
                  max={7}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className={`${SELECT} w-16`}
                />
                times a week
              </>
            )}
          </p>

          {choice.groups.map((group) => (
            <fieldset key={group}>
              <legend className="mb-1 text-xs uppercase tracking-wide text-stone-500">
                {GROUP_LABELS[group]}
              </legend>
              <div className="flex flex-wrap gap-2">
                {groupTags(group).map((tag) => (
                  <label
                    key={tag}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition ${
                      tags.includes(tag)
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag}
                      checked={tags.includes(tag)}
                      onChange={() => toggle(tag)}
                      className="sr-only"
                    />
                    {tag}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          {choice.kind !== "never" && tags.length > 1 && (
            <p className="text-xs text-stone-500">
              A meal has to be all of these at once. Add separate rules to treat them apart.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton label="Add rule" pendingLabel="Adding…" />
            {draft && <span className="text-stone-600 dark:text-stone-300">{describeRule(draft)}</span>}
          </div>
        </form>
      )}

      {result && (
        <p role="status" className={`text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
