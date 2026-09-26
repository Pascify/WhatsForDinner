import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-1 text-2xl font-semibold">WhatsForDinner 🍽️</h1>
      <p className="mb-6 text-sm text-stone-600 dark:text-stone-400">
        A week of dinners, planned for you and sent over WhatsApp.
      </p>
      <Card>
        <LoginForm />
      </Card>
      <p className="mt-4 text-center text-xs text-stone-500">
        No account? Message the WhatsForDinner number on WhatsApp and it will set you up.
      </p>
    </main>
  );
}
