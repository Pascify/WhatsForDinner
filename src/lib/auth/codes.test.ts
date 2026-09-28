import { beforeAll, describe, expect, it } from "vitest";
import {
  canResend,
  checkCode,
  codeMatches,
  findLinkCode,
  generateLinkCode,
  generateOtp,
  hashCode,
  OTP_MAX_ATTEMPTS,
} from "./codes";

beforeAll(() => {
  process.env.CODE_PEPPER = "test-pepper";
});

const record = (over: Partial<Parameters<typeof checkCode>[0]> = {}) => ({
  codeHash: hashCode("123456"),
  attempts: 0,
  expiresAt: new Date("2026-09-23T12:10:00Z"),
  ...over,
});
const now = new Date("2026-09-23T12:05:00Z");

describe("codes", () => {
  it("generates 6-digit OTPs", () => {
    for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("generates link codes without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(generateLinkCode()).toMatch(/^WFD-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("hashes codes and compares case-insensitively", () => {
    expect(hashCode("wfd-7q4k")).toBe(hashCode("WFD-7Q4K "));
    expect(codeMatches("WFD-7Q4K", hashCode("wfd-7q4k"))).toBe(true);
    expect(codeMatches("WFD-0000", hashCode("wfd-7q4k"))).toBe(false);
  });

  it("finds a link code in a message", () => {
    expect(findLinkCode("Connect WFD-7Q4K")).toBe("WFD-7Q4K");
    expect(findLinkCode("join wfd-h8k2 please")).toBe("WFD-H8K2");
    expect(findLinkCode("hi")).toBeUndefined();
  });

  it("accepts the right code", () => {
    expect(checkCode(record(), "123456", now)).toEqual({ ok: true });
  });

  it("rejects wrong, expired, reused and over-tried codes", () => {
    expect(checkCode(record(), "000000", now)).toEqual({ ok: false, reason: "wrong_code" });
    expect(
      checkCode(record({ expiresAt: new Date("2026-09-23T12:00:00Z") }), "123456", now),
    ).toEqual({ ok: false, reason: "expired" });
    expect(checkCode(record({ consumedAt: now }), "123456", now)).toEqual({
      ok: false,
      reason: "already_used",
    });
    expect(checkCode(record({ attempts: OTP_MAX_ATTEMPTS }), "123456", now)).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("holds resends to one a minute", () => {
    expect(canResend(undefined, now)).toBe(true);
    expect(canResend(new Date("2026-09-23T12:04:30Z"), now)).toBe(false);
    expect(canResend(new Date("2026-09-23T12:03:30Z"), now)).toBe(true);
  });
});
