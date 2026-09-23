/** Tag vocabulary. Tags are flat strings; this map says which group each belongs to. */
export const TAG_GROUPS = {
  base: ["rice", "roti", "pasta", "noodles", "bread"],
  protein: ["chicken", "beef", "mutton", "fish", "eggs", "daal", "paneer", "veg"],
  style: ["gravy", "dry", "grilled", "fried", "bbq", "soup", "stir-fry"],
  diet: ["halal", "vegetarian", "vegan", "gluten-free"],
  vibe: ["healthy", "splurge", "quick", "comfort", "eat-out"],
  cuisine: ["desi", "chinese", "italian", "middle-eastern", "american"],
} as const;

export type TagGroup = keyof typeof TAG_GROUPS;
export type Tag = (typeof TAG_GROUPS)[TagGroup][number];

export type Meal = {
  id: string;
  name: string;
  tags: Tag[];
  /** User-added meals belong to one owner; seeded meals have no owner. */
  ownerId?: string;
  hidden?: boolean;
};

/** Every meal must carry all of these tags (e.g. always halal). Never broken. */
export type AlwaysRule = { kind: "always"; tags: Tag[] };
/** No meal may carry any of these tags (e.g. never beef). Never broken. */
export type NeverRule = { kind: "never"; tags: Tag[] };
/** On this weekday the meal must carry all these tags. Relaxed only if nothing fits. */
export type DayRule = { kind: "day"; day: Weekday; tags: Tag[] };
/** Weekly quota for meals carrying all these tags. */
export type QuotaRule = { kind: "quota"; tags: Tag[]; min?: number; max?: number };
/** Weighting only: >1 makes matches likelier, <1 rarer. */
export type PreferRule = { kind: "prefer"; tags: Tag[]; weight: number };

export type Rule = AlwaysRule | NeverRule | DayRule | QuotaRule | PreferRule;

/** 0 = Sunday, matching Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Last time each meal was served, as an ISO date (YYYY-MM-DD). */
export type History = Record<string, string>;

export type PlanDay = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  mealId: string;
  /** Set when the day was pinned by the user and left untouched. */
  locked?: boolean;
};

export type Relaxation = {
  date: string;
  /** Which rule had to give way, in plain words. */
  reason: string;
};

export type Plan = {
  weekOf: string;
  days: PlanDay[];
  relaxations: Relaxation[];
  seed: number;
};

export type GenerateInput = {
  meals: Meal[];
  rules?: Rule[];
  history?: History;
  /** Monday (or whichever day the week starts on) as YYYY-MM-DD. */
  weekOf: string;
  seed: number;
  /** Days already chosen by the user that must not change. */
  locked?: PlanDay[];
  /** Meals served fewer than this many days ago are strongly avoided. */
  repeatGapDays?: number;
};
