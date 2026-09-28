/**
 * Caps how many inbound messages from one phone the bot answers. Every reply is an outbound
 * send, and a number that answers a flood (a spammer, or another bot in a loop) is what gets
 * reported and blocked, which is what drops Meta's quality rating.
 */
export const RATE_WINDOWS = [
  { name: "minute", ms: 60_000, max: 15 },
  { name: "hour", ms: 60 * 60_000, max: 100 },
] as const;

export type RateVerdict = "allow" | "warn" | "drop";

/** Counter keys for this phone at this moment, one per window, with when each can go. */
export function rateKeys(phone: string, now: Date) {
  return RATE_WINDOWS.map((window) => {
    const index = Math.floor(now.getTime() / window.ms);
    return {
      key: `${phone}:${window.name}:${index}`,
      expiresAt: new Date((index + 1) * window.ms),
    };
  });
}

/**
 * `counts` follows `RATE_WINDOWS`. The first message over a limit gets one warning, anything
 * after that is ignored until the window rolls over.
 */
export function rateVerdict(counts: number[]): RateVerdict {
  const over = counts.map((count, i) => count - RATE_WINDOWS[i].max).filter((excess) => excess > 0);
  if (over.length === 0) return "allow";
  return over.every((excess) => excess === 1) ? "warn" : "drop";
}
