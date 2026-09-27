import { botDepsFromEnv } from "@/lib/bot/deps";
import { handleInbound } from "@/lib/bot/handler";
import { parseWebhook } from "@/lib/whatsapp/inbound";
import { verifySignature, verifySubscription } from "@/lib/whatsapp/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta's subscription handshake, run once when the callback URL is saved in the dashboard. */
export async function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return new Response("Not configured", { status: 500 });

  const result = verifySubscription(new URL(request.url).searchParams, verifyToken);
  return result.ok ? new Response(result.challenge) : new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return new Response("Not configured", { status: 500 });

  // The signature covers the exact bytes Meta sent, so the body is read as text first.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Bad signature", { status: 401 });
  }

  let events;
  try {
    events = parseWebhook(JSON.parse(rawBody));
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  const deps = botDepsFromEnv();
  const failures: string[] = [];

  for (const event of events) {
    try {
      await handleInbound(event, deps);
    } catch (error) {
      // One bad event must not make Meta retry the whole delivery, which would repeat the rest.
      console.error("whatsapp webhook: failed to handle event", event.messageId, error);
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Meta ignores the body; this is for a human running the simulator against production.
  return Response.json({ handled: events.length, failures });
}
