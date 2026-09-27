import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth/session";
import { consumeLoginLink } from "@/lib/portal/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The one-time link the bot sends when someone texts "login". */
export async function GET(_request: Request, { params }: RouteContext<"/login/[code]">) {
  const { code } = await params;
  const userId = await consumeLoginLink(code);

  if (!userId) redirect("/login?expired=1");
  await startSession(userId);
  redirect("/");
}
