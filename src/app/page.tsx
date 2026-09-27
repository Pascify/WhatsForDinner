import { regenerateWeek, swapDay } from "@/app/actions/plan";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Landing } from "@/components/Landing";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth/session";
import { ensurePlan, WEEK_STARTS_ON } from "@/lib/bot/run-command";
import { issueConnectCode, store, toBotUser } from "@/lib/portal/data";
import { dayLong, localDateISO, shortDate, startOfWeek } from "@/lib/plan/week";
import { describeWindow, windowOpen } from "@/lib/whatsapp/window";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const doc = await currentUser();
  // Signed out, this is the front door rather than a redirect to a login form.
  if (!doc) return <Landing whatsappNumber={process.env.WHATSAPP_DISPLAY_NUMBER} />;

  const user = toBotUser(doc);
  const today = localDateISO(new Date(), user.timezone);
  const weekOf = startOfWeek(today, WEEK_STARTS_ON);

  const [plan, meals] = await Promise.all([
    ensurePlan(store, user, weekOf),
    store.mealsFor(user.id),
  ]);
  const names = new Map(meals.map((meal) => [meal.id, meal.name]));

  // Fetched here rather than inside the card, so the whole page renders in one pass.
  const connectCode = user.phone ? undefined : await issueConnectCode(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Nav isAdmin={doc.role === "admin"} />

      <PageHeader
        title={`Week of ${shortDate(weekOf)}`}
        action={
          <ActionForm action={regenerateWeek} className="text-right">
            <SubmitButton quiet label="Regenerate" pendingLabel="Regenerating…" />
          </ActionForm>
        }
      />

      <ol className="space-y-2">
        {plan.days.map((day) => (
          <li key={day.date}>
            <Card className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-500">
                  {dayLong(day.date)}
                  {day.date === today && <span className="ml-2 text-emerald-600">today</span>}
                </p>
                <p className="font-medium">{names.get(day.mealId) ?? "Something tasty"}</p>
              </div>
              <ActionForm action={swapDay} className="max-w-48 text-right">
                <input type="hidden" name="date" value={day.date} />
                <SubmitButton quiet label="Swap" pendingLabel="Swapping…" />
              </ActionForm>
            </Card>
          </li>
        ))}
      </ol>

      {plan.relaxations.length > 0 && (
        <p className="mt-4 text-sm text-stone-500">
          {plan.relaxations.map((relaxation) => relaxation.reason).join(". ")}.
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <WhatsAppCard user={user} connectCode={connectCode} />
        <DeliveryCard user={user} />
      </div>
    </main>
  );
}

function WhatsAppCard({
  user,
  connectCode,
}: {
  user: ReturnType<typeof toBotUser>;
  connectCode?: string;
}) {
  if (!user.phone && connectCode) {
    const number = process.env.WHATSAPP_DISPLAY_NUMBER ?? "";
    const link = `https://wa.me/${number}?text=${encodeURIComponent(`Connect ${connectCode}`)}`;

    return (
      <Card>
        <h2 className="mb-2 font-medium">Connect WhatsApp</h2>
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
          Send this message and your plans start arriving. It also proves the number is yours.
        </p>
        <a href={link} target="_blank" rel="noreferrer">
          <Button type="button">Send &ldquo;Connect {connectCode}&rdquo;</Button>
        </a>
        <p className="mt-2 text-xs text-stone-500">The code works once and lasts 15 minutes.</p>
      </Card>
    );
  }

  const open = windowOpen(user.lastInboundAt);
  return (
    <Card>
      <h2 className="mb-2 font-medium">WhatsApp</h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">Connected as +{user.phone}</p>
      <p className="mt-3 flex items-center gap-2 text-sm">
        Free window:{" "}
        <Badge tone={open ? "green" : "grey"}>{describeWindow(user.lastInboundAt)}</Badge>
      </p>
      <p className="mt-2 text-xs text-stone-500">
        {open
          ? "Anything we send right now costs nothing."
          : "Message the bot to open it again, or we fall back to your chosen option."}
      </p>
    </Card>
  );
}

function DeliveryCard({ user }: { user: ReturnType<typeof toBotUser> }) {
  const { delivery } = user;
  const what =
    delivery.mode === "on_request"
      ? "Only when you ask"
      : [delivery.weekly.enabled && "Weekly plan", delivery.daily.enabled && "Daily reminder"]
          .filter(Boolean)
          .join(" + ") || "Nothing scheduled";

  const closed = {
    wait: "Wait for your next message",
    email: "Email it to you",
    whatsapp: "Send on WhatsApp anyway (paid)",
  }[delivery.whenClosed];

  return (
    <Card>
      <h2 className="mb-2 font-medium">Delivery</h2>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">Sending</dt>
          <dd>{what}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">If WhatsApp is closed</dt>
          <dd className="text-right">{closed}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">Region</dt>
          <dd>{user.timezone}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-stone-500">
        Change these under Preferences. Only the paid option can ever cost anything.
      </p>
    </Card>
  );
}
