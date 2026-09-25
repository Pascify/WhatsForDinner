/**
 * Meta's customer service window: 24 hours from the user's last message to us.
 * While it is open, anything we send is free; once it closes, only a paid template gets through.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** A little slack so a send that starts at 23h59m doesn't land after the window shuts. */
export const WINDOW_SAFETY_MS = 5 * 60 * 1000;

export function windowOpen(lastInboundAt: Date | undefined, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < WINDOW_MS - WINDOW_SAFETY_MS;
}

/** Milliseconds until the free window shuts; 0 when it is already shut. */
export function windowRemainingMs(lastInboundAt: Date | undefined, now = new Date()): number {
  if (!lastInboundAt) return 0;
  return Math.max(0, lastInboundAt.getTime() + WINDOW_MS - now.getTime());
}

/** "14h left" / "closed", for the dashboard. */
export function describeWindow(lastInboundAt: Date | undefined, now = new Date()): string {
  const remaining = windowRemainingMs(lastInboundAt, now);
  if (remaining === 0) return "closed";
  const hours = Math.floor(remaining / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.round(remaining / 60_000))}m left`;
}
