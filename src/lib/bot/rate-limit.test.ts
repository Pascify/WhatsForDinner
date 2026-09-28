import { describe, expect, it } from "vitest";
import { rateKeys, rateVerdict } from "./rate-limit";

describe("rateVerdict", () => {
  it("allows anything up to each window's limit", () => {
    expect(rateVerdict([15, 100])).toBe("allow");
  });

  it("warns on the first message over a limit", () => {
    expect(rateVerdict([16, 40])).toBe("warn");
    expect(rateVerdict([3, 101])).toBe("warn");
  });

  it("drops everything after the warning", () => {
    expect(rateVerdict([17, 40])).toBe("drop");
    expect(rateVerdict([16, 102])).toBe("drop");
  });
});

describe("rateKeys", () => {
  it("keys each window by phone and expires it when the window ends", () => {
    const [minute, hour] = rateKeys("923001234567", new Date("2026-09-26T12:34:56Z"));

    expect(minute.expiresAt).toEqual(new Date("2026-09-26T12:35:00Z"));
    expect(hour.expiresAt).toEqual(new Date("2026-09-26T13:00:00Z"));
    expect(minute.key).toMatch(/^923001234567:minute:\d+$/);
  });
});
