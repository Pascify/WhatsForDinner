import { describe, expect, it } from "vitest";
import { decideLink, maskPhone, normalisePhone, statusFor, type AccountFacts } from "./policy";

const account = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  id: "user-1",
  emailVerifiedAt: new Date(),
  onboardingDone: true,
  ...over,
});

describe("decideLink", () => {
  it("creates an account when the email is new", () => {
    expect(decideLink("923001234567", undefined)).toEqual({ kind: "create_account" });
  });

  it("links the phone to an account that has none", () => {
    expect(decideLink("923001234567", account())).toEqual({ kind: "link_phone", userId: "user-1" });
  });

  it("does nothing when the same phone is already linked", () => {
    expect(decideLink("923001234567", account({ phone: "923001234567" }))).toEqual({
      kind: "already_linked",
      userId: "user-1",
    });
  });

  it("asks before replacing a different number", () => {
    expect(decideLink("923009999999", account({ phone: "923001234567" }))).toEqual({
      kind: "needs_switch_confirmation",
      userId: "user-1",
      currentPhone: "923001234567",
    });
  });
});

describe("statusFor", () => {
  it("is active once the email is verified and onboarding is done", () => {
    expect(statusFor(account())).toEqual({ status: "active" });
  });

  it("explains why an account is inactive", () => {
    expect(statusFor(account({ emailVerifiedAt: undefined }))).toEqual({
      status: "inactive",
      inactiveReason: "email_unverified",
    });
    expect(statusFor(account({ onboardingDone: false }))).toEqual({
      status: "inactive",
      inactiveReason: "onboarding_incomplete",
    });
    expect(statusFor(account({ paused: true }))).toEqual({
      status: "inactive",
      inactiveReason: "paused",
    });
  });

  it("puts pausing ahead of the other reasons", () => {
    expect(statusFor(account({ paused: true, emailVerifiedAt: undefined })).inactiveReason).toBe(
      "paused",
    );
  });
});

describe("phone numbers", () => {
  it("keeps digits only", () => {
    expect(normalisePhone("+92 300 1234567")).toBe("923001234567");
    expect(normalisePhone("(92) 300-1234567")).toBe("923001234567");
  });

  it("rejects anything too short or too long", () => {
    expect(normalisePhone("1234")).toBeUndefined();
    expect(normalisePhone("1".repeat(16))).toBeUndefined();
  });

  it("masks all but the ends", () => {
    expect(maskPhone("923001234567")).toContain("67");
    expect(maskPhone("923001234567")).not.toContain("300123");
  });
});
