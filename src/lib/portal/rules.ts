import { TAG_GROUPS, type Rule, type Tag, type TagGroup } from "@/lib/plan/types";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type RuleKindChoice = "never" | "always" | "day" | "quota";

/** The rule types the builder offers, in the words a person would use. */
export const RULE_CHOICES: {
  kind: RuleKindChoice;
  title: string;
  example: string;
  groups: TagGroup[];
}[] = [
  { kind: "never", title: "I don't eat…", example: "No beef, no fish", groups: ["protein", "base", "style", "cuisine"] },
  // Diet only: "every dinner must be chicken" leaves a handful of meals and a repeating week.
  { kind: "always", title: "Every dinner must be…", example: "Always halal", groups: ["diet"] },
  { kind: "day", title: "On a certain day…", example: "Daal on Fridays", groups: ["protein", "base", "style", "cuisine", "vibe"] },
  { kind: "quota", title: "How often…", example: "Chicken at most twice a week", groups: ["protein", "base", "style", "cuisine", "vibe"] },
];

export const GROUP_LABELS: Record<TagGroup, string> = {
  protein: "Protein",
  base: "Served with",
  style: "Cooking style",
  diet: "Diet",
  vibe: "Kind of night",
  cuisine: "Cuisine",
};

export const groupTags = (group: TagGroup): readonly Tag[] => TAG_GROUPS[group];

const list = (tags: readonly string[], joiner: "and" | "or") =>
  tags.length <= 1
    ? (tags[0] ?? "")
    : `${tags.slice(0, -1).join(", ")} ${joiner} ${tags[tags.length - 1]}`;

const times = (count: number) => (count === 1 ? "once" : count === 2 ? "twice" : `${count} times`);

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One plain sentence per rule. Never matches any tag; the others need every tag at once. */
export function describeRule(rule: Rule): string {
  switch (rule.kind) {
    case "never":
      return `No ${list(rule.tags, "or")}`;
    case "always":
      return `Every dinner is ${list(rule.tags, "and")}`;
    case "day":
      return `${DAYS[rule.day]}s: ${list(rule.tags, "and")}`;
    case "quota": {
      const what = capitalise(list(rule.tags, "and"));
      const { min, max } = rule;
      if (min !== undefined && min === max) return `${what} exactly ${times(min)} a week`;
      if (min !== undefined && max !== undefined) return `${what} ${min} to ${max} times a week`;
      if (max !== undefined) return `${what} at most ${times(max)} a week`;
      return `${what} at least ${times(min ?? 0)} a week`;
    }
    case "prefer":
      return `${rule.weight >= 1 ? "More" : "Less"} ${list(rule.tags, "and")}`;
  }
}
