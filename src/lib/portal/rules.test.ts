import { describe, expect, it } from "vitest";
import { describeRule } from "./rules";

describe("describeRule", () => {
  it("reads each kind of rule as a sentence", () => {
    expect(describeRule({ kind: "never", tags: ["beef", "fish"] })).toBe("No beef or fish");
    expect(describeRule({ kind: "always", tags: ["halal"] })).toBe("Every dinner is halal");
    expect(describeRule({ kind: "day", day: 5, tags: ["rice", "chicken"] })).toBe(
      "Fridays: rice and chicken",
    );
    expect(describeRule({ kind: "prefer", tags: ["healthy"], weight: 2 })).toBe("More healthy");
  });

  it("says how often in words", () => {
    expect(describeRule({ kind: "quota", tags: ["pasta"], max: 1 })).toBe("Pasta at most once a week");
    expect(describeRule({ kind: "quota", tags: ["healthy"], min: 3 })).toBe(
      "Healthy at least 3 times a week",
    );
    expect(describeRule({ kind: "quota", tags: ["chicken"], min: 2, max: 2 })).toBe(
      "Chicken exactly twice a week",
    );
    expect(describeRule({ kind: "quota", tags: ["beef"], min: 1, max: 3 })).toBe(
      "Beef 1 to 3 times a week",
    );
  });

  it("lists three or more tags naturally", () => {
    expect(describeRule({ kind: "never", tags: ["beef", "mutton", "fish"] })).toBe(
      "No beef, mutton or fish",
    );
  });
});
