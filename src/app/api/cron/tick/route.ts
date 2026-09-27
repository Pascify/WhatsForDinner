import { timingSafeEqual } from "node:crypto";
import { botDepsFromEnv } from "@/lib/bot/deps";
import { runTick } from "@/lib/delivery/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || !provided) return false;

  const expected = Buffer.from(secret);
  const received = Buffer.from(provided);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Called every hour by the GitHub Actions workflow. Hourly rather than weekly because users
 * choose their own region, so "Saturday 6pm" happens at a different UTC hour for each of them.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });

  try {
    const summary = await runTick(botDepsFromEnv());
    console.log("cron tick", summary);
    return Response.json(summary);
  } catch (error) {
    // Behind the shared secret, so the reason can be reported rather than hidden in the logs.
    const message = error instanceof Error ? error.message : String(error);
    console.error("cron tick failed", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
