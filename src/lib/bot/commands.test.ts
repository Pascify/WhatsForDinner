import { describe, expect, it } from "vitest";
import { parseCommand, REPLY_IDS } from "./commands";

describe("parseCommand", () => {
  it("reads the typed words people actually use", () => {
    expect(parseCommand("plan")).toEqual({ kind: "plan" });
    expect(parseCommand("  MENU ")).toEqual({ kind: "plan" });
    expect(parseCommand("tonight")).toEqual({ kind: "today" });
    expect(parseCommand("Tomorrow!")).toEqual({ kind: "tomorrow" });
    expect(parseCommand("stop")).toEqual({ kind: "stop" });
    expect(parseCommand("delete my account")).toEqual({ kind: "delete" });
    expect(parseCommand("login")).toEqual({ kind: "login" });
  });

  it("falls back to help", () => {
    expect(parseCommand("what's for dinner?")).toEqual({ kind: "help" });
    expect(parseCommand("")).toEqual({ kind: "help" });
    expect(parseCommand("hi")).toEqual({ kind: "help" });
  });

  it("reads swap with a day name as a plain swap", () => {
    expect(parseCommand("swap friday")).toEqual({ kind: "swap" });
    expect(parseCommand("change tue")).toEqual({ kind: "swap" });
  });

  it("reads taps, and prefers them over the button's own title text", () => {
    expect(parseCommand("Show my plan", REPLY_IDS.showPlan)).toEqual({ kind: "plan" });
    expect(parseCommand("Looks good 👍", REPLY_IDS.ack)).toEqual({ kind: "ack" });
    expect(parseCommand("Swap a meal", REPLY_IDS.swap)).toEqual({ kind: "swap" });
    expect(parseCommand("Friday", REPLY_IDS.swapDay("2026-09-25"))).toEqual({
      kind: "swap_day",
      date: "2026-09-25",
    });
    expect(
      parseCommand("Another", REPLY_IDS.swapAnother("2026-09-25", 1, "chicken-karahi")),
    ).toEqual({
      kind: "swap_another",
      date: "2026-09-25",
      attempt: 1,
      rejected: "chicken-karahi",
    });
    expect(parseCommand("Delete", REPLY_IDS.deleteConfirm)).toEqual({ kind: "delete_confirm" });
    expect(parseCommand("Use this", REPLY_IDS.swapAccept("2026-09-25", "chicken-karahi"))).toEqual({
      kind: "swap_accept",
      date: "2026-09-25",
      mealId: "chicken-karahi",
    });
  });

  it("ignores ids it does not recognise", () => {
    expect(parseCommand("plan", "something_else")).toEqual({ kind: "plan" });
    expect(parseCommand("", "swapday_not-a-date")).toEqual({ kind: "help" });
  });
});
