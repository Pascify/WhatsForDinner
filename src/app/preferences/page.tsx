import { redirect } from "next/navigation";
import { addRule, removeRule, saveDelivery } from "@/app/actions/preferences";
import { Button, Card, PageHeader, QuietButton } from "@/components/ui";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth/session";
import { toBotUser } from "@/lib/portal/data";
import { TAG_GROUPS, type Rule } from "@/lib/plan/types";

export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "America/Toronto",
  "America/Los_Angeles",
  "Australia/Sydney",
];
const RULE_TAGS = [...TAG_GROUPS.protein, ...TAG_GROUPS.base, ...TAG_GROUPS.vibe, ...TAG_GROUPS.diet];

function describeRule(rule: Rule): string {
  const tags = rule.tags.join(" + ");
  switch (rule.kind) {
    case "always":
      return `Always ${tags}`;
    case "never":
      return `Never ${tags}`;
    case "day":
      return `${DAYS[rule.day]}: ${tags}`;
    case "quota":
      return [
        rule.max !== undefined && `At most ${rule.max} ${tags} a week`,
        rule.min !== undefined && `At least ${rule.min} ${tags} a week`,
      ]
        .filter(Boolean)
        .join(", ");
    default:
      return `Prefer ${tags}`;
  }
}

export default async function PreferencesPage() {
  const doc = await currentUser();
  if (!doc) redirect("/login");
  const user = toBotUser(doc);

  const what = user.delivery.weekly.enabled && user.delivery.daily.enabled
    ? "both"
    : user.delivery.daily.enabled
      ? "daily"
      : "weekly";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Nav isAdmin={doc.role === "admin"} />
      <PageHeader title="Preferences" />

      <Card className="mb-6">
        <h2 className="mb-3 font-medium">Delivery</h2>
        <form action={saveDelivery} className="space-y-4 text-sm">
          <fieldset>
            <legend className="mb-1 font-medium">How should we send plans?</legend>
            <label className="mr-4">
              <input type="radio" name="mode" value="auto" defaultChecked={user.delivery.mode === "auto"} />{" "}
              Automatically
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                value="on_request"
                defaultChecked={user.delivery.mode === "on_request"}
              />{" "}
              Only when I ask
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-1 font-medium">What?</legend>
            {[
              ["weekly", "The week's plan"],
              ["daily", "A daily reminder"],
              ["both", "Both"],
            ].map(([value, label]) => (
              <label key={value} className="mr-4">
                <input type="radio" name="what" value={value} defaultChecked={what === value} /> {label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-4">
            <label>
              Weekly on{" "}
              <select
                name="weeklyDay"
                defaultValue={user.delivery.weekly.weekday}
                className="rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
              >
                {DAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label>
              at{" "}
              <input
                type="number"
                name="weeklyHour"
                min={0}
                max={23}
                defaultValue={user.delivery.weekly.hour}
                className="w-16 rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
              />
              :00
            </label>
            <label>
              Daily at{" "}
              <input
                type="number"
                name="dailyHour"
                min={0}
                max={23}
                defaultValue={user.delivery.daily.hour}
                className="w-16 rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
              />
              :00
            </label>
          </div>

          <fieldset>
            <legend className="mb-1 font-medium">If WhatsApp can&rsquo;t reach you for free</legend>
            {[
              ["email", "Email me", "Free"],
              ["wait", "Wait for my next message", "Free"],
              ["whatsapp", "Send on WhatsApp anyway", "Costs money each time"],
            ].map(([value, label, note]) => (
              <label key={value} className="block">
                <input
                  type="radio"
                  name="whenClosed"
                  value={value}
                  defaultChecked={user.delivery.whenClosed === value}
                />{" "}
                {label} <span className="text-xs text-stone-500">({note})</span>
              </label>
            ))}
          </fieldset>

          <label className="block">
            Region{" "}
            <select
              name="timezone"
              defaultValue={user.timezone}
              className="rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
            >
              {[...new Set([user.timezone, ...ZONES])].map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit">Save</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-medium">Rules</h2>
        <p className="mb-3 text-sm text-stone-500">
          Always and never rules are never broken. Day rules and weekly limits bend only when
          nothing else fits, and the plan says when that happened.
        </p>

        {user.rules.length === 0 ? (
          <p className="mb-4 text-sm text-stone-500">No rules yet.</p>
        ) : (
          <ul className="mb-4 space-y-1 text-sm">
            {user.rules.map((rule, index) => (
              <li key={index} className="flex items-center justify-between gap-3">
                <span>{describeRule(rule)}</span>
                <form action={removeRule}>
                  <input type="hidden" name="index" value={index} />
                  <QuietButton type="submit">Remove</QuietButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addRule} className="space-y-3 border-t border-stone-200 pt-4 text-sm dark:border-stone-800">
          <div className="flex flex-wrap items-center gap-3">
            <select
              name="kind"
              className="rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
            >
              <option value="never">Never</option>
              <option value="always">Always</option>
              <option value="day">On a day</option>
              <option value="quota">Weekly limit</option>
            </select>
            <select
              name="day"
              className="rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
            >
              {DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <label>
              min{" "}
              <input
                type="number"
                name="min"
                min={0}
                max={7}
                className="w-14 rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
              />
            </label>
            <label>
              max{" "}
              <input
                type="number"
                name="max"
                min={0}
                max={7}
                className="w-14 rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {RULE_TAGS.map((tag) => (
              <label
                key={tag}
                className="rounded-full border border-stone-300 px-2 py-0.5 text-xs dark:border-stone-700"
              >
                <input type="checkbox" name="tags" value={tag} className="mr-1" />
                {tag}
              </label>
            ))}
          </div>

          <Button type="submit">Add rule</Button>
        </form>
      </Card>
    </main>
  );
}
