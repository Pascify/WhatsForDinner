import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook delivery with the app secret. Without this check anyone who guesses
 * the URL could drive the bot, so the raw body must be verified before it is parsed.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(header.slice("sha256=".length), "hex");
  } catch {
    return false;
  }

  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Meta's subscription handshake: echo the challenge when the verify token matches. */
export function verifySubscription(
  params: URLSearchParams,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) return { ok: true, challenge };
  return { ok: false };
}
