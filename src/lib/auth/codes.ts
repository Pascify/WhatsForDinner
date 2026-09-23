import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const LINK_CODE_TTL_MS = 15 * 60_000;

/** No 0/O/1/I: these get read aloud, retyped and screenshotted. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pepper(): string {
  const value = process.env.CODE_PEPPER;
  if (!value) throw new Error("CODE_PEPPER is not set");
  return value;
}

/** Codes are stored hashed, never in plain text, the same way passwords would be. */
export function hashCode(code: string): string {
  return createHmac("sha256", pepper()).update(code.trim().toUpperCase()).digest("hex");
}

export function codeMatches(code: string, hash: string): boolean {
  const candidate = Buffer.from(hashCode(code), "hex");
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** e.g. WFD-7Q4K. Random, single use, meaningless on its own. */
export function generateLinkCode(): string {
  let body = "";
  for (let i = 0; i < 4; i++) body += ALPHABET[randomInt(0, ALPHABET.length)];
  return `WFD-${body}`;
}

/** Pulls a link code out of a WhatsApp message like "Connect WFD-7Q4K" or "join wfd-h8k2". */
export function findLinkCode(text: string): string | undefined {
  const match = text.match(/\bWFD-[A-Z2-9]{4}\b/i);
  return match?.[0].toUpperCase();
}

export type CodeRecord = {
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt?: Date;
};

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "already_used" | "too_many_attempts" | "wrong_code" };

/**
 * Pure so it can be tested without a database: the caller persists the attempt count
 * and the consumed timestamp.
 */
export function checkCode(record: CodeRecord, code: string, now = new Date()): CodeCheck {
  if (record.consumedAt) return { ok: false, reason: "already_used" };
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (record.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  if (!codeMatches(code, record.codeHash)) return { ok: false, reason: "wrong_code" };
  return { ok: true };
}

export function canResend(lastSentAt: Date | undefined, now = new Date()): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= OTP_RESEND_COOLDOWN_MS;
}
