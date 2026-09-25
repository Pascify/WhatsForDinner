import { describe, expect, it } from "vitest";
import {
  advanceOnboarding,
  parseRestrictions,
  startOnboarding,
  type Inbound,
  type OnboardingState,
  type StepOutcome,
} from "./onboarding";

/** Walks the machine through a list of replies, like a real conversation. */
function converse(steps: { input: Inbound; outcome?: StepOutcome }[]) {
  let result = startOnboarding();
  const transcript: string[] = result.messages.map((m) => m.text);
  const effects = [...result.effects];

  for (const step of steps) {
    result = advanceOnboarding(result.state, step.input, step.outcome);
    transcript.push(...result.messages.map((m) => m.text));
    effects.push(...result.effects);
  }
  return { state: result.state, transcript, effects, last: result };
}

const HAPPY_PATH = [
  { input: { text: "Hammad" } },
  { input: { text: "cook@example.com" } },
  { input: { text: "123456" }, outcome: { emailVerified: true } },
  { input: { replyId: "diet_both" } },
  { input: { replyId: "halal_yes" } },
  { input: { text: "no beef, no fish" } },
  { input: { replyId: "day_add" } },
  { input: { replyId: "weekday_5" } },
  { input: { replyId: "theme_biryani" } },
  { input: { replyId: "mode_weekly" } },
  { input: { replyId: "closed_email" } },
];

describe("onboarding", () => {
  it("starts by asking for a name", () => {
    const { state, messages } = startOnboarding();
    expect(state.step).toBe("ask_name");
    expect(messages[0].text).toMatch(/What should I call you/);
  });

  it("collects a whole sign-up and finishes", () => {
    const { state, effects } = converse(HAPPY_PATH);

    expect(state.step).toBe("done");
    expect(state.draft.name).toBe("Hammad");
    expect(state.draft.email).toBe("cook@example.com");
    expect(state.draft.rules).toEqual([
      { kind: "always", tags: ["halal"] },
      { kind: "never", tags: ["beef", "fish"] },
      { kind: "day", day: 5, tags: ["rice", "chicken"] },
    ]);
    expect(state.draft.delivery).toMatchObject({
      mode: "auto",
      weekly: { enabled: true },
      daily: { enabled: false },
      whenClosed: "email",
    });
    expect(effects).toContainEqual({ kind: "send_email_otp", email: "cook@example.com" });
    expect(effects.at(-1)).toMatchObject({ kind: "finish" });
  });

  it("asks again when the email is malformed, and does not send a code", () => {
    const { state, effects, last } = converse([
      { input: { text: "Hammad" } },
      { input: { text: "not-an-email" } },
    ]);

    expect(state.step).toBe("ask_email");
    expect(effects).toHaveLength(0);
    expect(last.messages[0].text).toMatch(/doesn't look like an email/);
  });

  it("stays on the code step until the code is right", () => {
    const start = converse([{ input: { text: "Hammad" } }, { input: { text: "cook@example.com" } }]);

    const wrong = advanceOnboarding(start.state, { text: "000000" }, { emailError: "Wrong code." });
    expect(wrong.state.step).toBe("verify_email");
    expect(wrong.messages[0].text).toBe("Wrong code.");

    const right = advanceOnboarding(wrong.state, { text: "123456" }, { emailVerified: true });
    expect(right.state.step).toBe("ask_diet");
  });

  it("lets someone correct a mistyped email", () => {
    const start = converse([{ input: { text: "Hammad" } }, { input: { text: "typo@example.com" } }]);
    const changed = advanceOnboarding(start.state, { text: "change" });

    expect(changed.state.step).toBe("ask_email");

    const retry = advanceOnboarding(changed.state, { text: "right@example.com" });
    expect(retry.state.draft.email).toBe("right@example.com");
    expect(retry.effects).toEqual([{ kind: "send_email_otp", email: "right@example.com" }]);
  });

  it("adds a vegetarian rule only when asked", () => {
    const veg = converse([
      { input: { text: "A" } },
      { input: { text: "a@b.co" } },
      { input: { text: "1" }, outcome: { emailVerified: true } },
      { input: { replyId: "diet_veg" } },
    ]);
    expect(veg.state.draft.rules).toEqual([{ kind: "always", tags: ["vegetarian"] }]);
    expect(veg.state.step).toBe("ask_halal");
  });

  it("skips restrictions and day rules when the user taps past them", () => {
    const { state } = converse([
      { input: { text: "A" } },
      { input: { text: "a@b.co" } },
      { input: { text: "1" }, outcome: { emailVerified: true } },
      { input: { replyId: "diet_both" } },
      { input: { replyId: "halal_no" } },
      { input: { replyId: "skip_restrictions" } },
      { input: { replyId: "day_skip" } },
    ]);

    expect(state.draft.rules).toEqual([]);
    expect(state.step).toBe("ask_delivery");
  });

  it("re-asks when a tap makes no sense for the step", () => {
    const { state, last } = converse([
      { input: { text: "A" } },
      { input: { text: "a@b.co" } },
      { input: { text: "1" }, outcome: { emailVerified: true } },
      { input: { replyId: "nonsense" } },
    ]);

    expect(state.step).toBe("ask_diet");
    expect(last.messages[0].buttons).toHaveLength(2);
  });

  it("finishes without a fallback question when plans are on request only", () => {
    const { state, effects } = converse([
      { input: { text: "A" } },
      { input: { text: "a@b.co" } },
      { input: { text: "1" }, outcome: { emailVerified: true } },
      { input: { replyId: "diet_both" } },
      { input: { replyId: "halal_no" } },
      { input: { replyId: "skip_restrictions" } },
      { input: { replyId: "day_skip" } },
      { input: { replyId: "mode_request" } },
    ]);

    expect(state.step).toBe("done");
    expect(state.draft.delivery.mode).toBe("on_request");
    expect(effects.at(-1)).toMatchObject({ kind: "finish" });
  });

  it("records consent when someone opts into paid messages", () => {
    const { state } = converse([
      ...HAPPY_PATH.slice(0, -1),
      { input: { replyId: "closed_whatsapp" } },
    ]);

    expect(state.draft.delivery.whenClosed).toBe("whatsapp");
    expect(state.draft.delivery.paidOptInAt).toBeInstanceOf(Date);
    expect(state.draft.delivery.paidOptInSource).toBe("whatsapp");
  });

  it("does not record consent for the free choices", () => {
    const { state } = converse(HAPPY_PATH);
    expect(state.draft.delivery.paidOptInAt).toBeUndefined();
  });

  it("reads ingredients out of plain text", () => {
    expect(parseRestrictions("no beef, no seafood")).toEqual(["beef", "fish"]);
    expect(parseRestrictions("I hate EGGS")).toEqual(["eggs"]);
    expect(parseRestrictions("nothing really")).toEqual([]);
  });

  it("keeps state immutable so a resumed step cannot corrupt the draft", () => {
    const first = converse([{ input: { text: "Hammad" } }]);
    const before: OnboardingState = structuredClone(first.state);

    advanceOnboarding(first.state, { text: "cook@example.com" });
    expect(first.state).toEqual(before);
  });
});
