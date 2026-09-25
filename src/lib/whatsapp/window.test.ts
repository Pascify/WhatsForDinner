import { describe, expect, it } from "vitest";
import { describeWindow, windowOpen, windowRemainingMs } from "./window";

const now = new Date("2026-09-26T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("customer service window", () => {
  it("is shut for someone who never messaged", () => {
    expect(windowOpen(undefined, now)).toBe(false);
    expect(windowRemainingMs(undefined, now)).toBe(0);
    expect(describeWindow(undefined, now)).toBe("closed");
  });

  it("is open just after a message and shut after 24 hours", () => {
    expect(windowOpen(hoursAgo(0.5), now)).toBe(true);
    expect(windowOpen(hoursAgo(23), now)).toBe(true);
    expect(windowOpen(hoursAgo(24.5), now)).toBe(false);
  });

  it("shuts a few minutes early so a send in flight still counts as free", () => {
    expect(windowOpen(new Date(now.getTime() - (24 * 3_600_000 - 60_000)), now)).toBe(false);
  });

  it("describes the time left", () => {
    expect(describeWindow(hoursAgo(10), now)).toBe("14h left");
    expect(describeWindow(hoursAgo(23.9), now)).toBe("6m left");
    expect(describeWindow(hoursAgo(25), now)).toBe("closed");
  });
});
