import Link from "next/link";
import { Button } from "@/components/ui";

const STEPS = [
  {
    title: "Tell it what you eat",
    body: "Halal only, never beef, Friday is biryani night, at least three light dinners a week. Rules are yours to set, and the plan explains itself when two of them collide.",
  },
  {
    title: "Get a week at a time",
    body: "Seven dinners, chosen from your own meal list and weighted against what you ate recently, so the same thing does not come around twice in a fortnight.",
  },
  {
    title: "Change it from the chat",
    body: "Text plan, today or swap. No app to install, nothing to log into while you are standing in the kitchen.",
  },
];

export function Landing({ whatsappNumber }: { whatsappNumber?: string }) {
  const startOnWhatsApp = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi")}`
    : undefined;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">WhatsForDinner 🍽️</h1>
      <p className="mt-3 text-lg text-stone-600 dark:text-stone-400">
        A week of dinners, planned for you and sent to WhatsApp. No more deciding at 6pm.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {startOnWhatsApp && (
          <a href={startOnWhatsApp} target="_blank" rel="noreferrer">
            <Button type="button">Start on WhatsApp</Button>
          </a>
        )}
        <Link
          href="/login"
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm transition hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Sign in with email
        </Link>
      </div>

      <ol className="mt-12 space-y-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-medium text-white">
              {index + 1}
            </span>
            <div>
              <h2 className="font-medium">{step.title}</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 rounded-xl border border-stone-200 bg-white p-5 text-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-1 font-medium">Free, and built to stay that way</h2>
        <p className="text-stone-600 dark:text-stone-400">
          Plans go out as ordinary WhatsApp messages while your chat is open, and by email when it
          is not. Nothing here needs a card, and it never sends you anything you did not ask for.
        </p>
      </div>

      <p className="mt-10 text-xs text-stone-500">
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
      </p>
    </main>
  );
}
