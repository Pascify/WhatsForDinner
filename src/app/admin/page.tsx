import { redirect } from "next/navigation";
import { saveBudget } from "@/app/actions/admin";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth/session";
import { deliveries, users } from "@/lib/db/collections";
import { store } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const doc = await currentUser();
  if (!doc) redirect("/login");
  if (doc.role !== "admin") redirect("/");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [budget, deliveriesCol, usersCol] = await Promise.all([
    store.paidBudget(),
    deliveries(),
    users(),
  ]);

  const [freeCount, paidCount, accounts, connected] = await Promise.all([
    deliveriesCol.countDocuments({ sentAt: { $gte: monthStart }, paid: false }),
    deliveriesCol.countDocuments({ sentAt: { $gte: monthStart }, paid: true }),
    usersCol.countDocuments({}),
    usersCol.countDocuments({ phone: { $exists: true } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Nav isAdmin />
      <PageHeader title="Admin" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-medium">This month</h2>
          <p className="text-sm">
            <span className="text-2xl font-semibold">{freeCount}</span> free ·{" "}
            <span className="text-2xl font-semibold">{paidCount}</span> paid
          </p>
          <p className="mt-2 text-xs text-stone-500">
            Paid messages are WhatsApp templates sent outside the free window, to users who
            opted in.
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 font-medium">Accounts</h2>
          <p className="text-sm">
            {accounts} total · {connected} with WhatsApp connected
          </p>
          <p className="mt-3 text-sm">
            Paid sending:{" "}
            {budget.killSwitch ? (
              <Badge tone="amber">off</Badge>
            ) : (
              <Badge tone="green">on, {budget.sentThisMonth}/{budget.cap} used</Badge>
            )}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-medium">Spending limit</h2>
        <form action={saveBudget} className="space-y-3 text-sm">
          <label className="block">
            Most paid messages a month, across everyone{" "}
            <input
              type="number"
              name="cap"
              min={0}
              defaultValue={budget.cap}
              className="w-24 rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
            />
          </label>
          <label className="block">
            <input type="checkbox" name="killSwitch" defaultChecked={budget.killSwitch} /> Stop all
            paid messages
          </label>
          <p className="text-xs text-stone-500">
            When the limit is reached, or this is switched off, those sends go by email instead.
          </p>
          <Button type="submit">Save</Button>
        </form>
      </Card>
    </main>
  );
}
