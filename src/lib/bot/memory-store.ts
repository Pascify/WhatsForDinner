import { checkCode, generateLinkCode, hashCode, OTP_TTL_MS } from "@/lib/auth/codes";
import { SEED_MEALS } from "@/data/seedMeals";
import { DEFAULT_DELIVERY, type LinkCodePurpose, type OtpPurpose } from "@/lib/db/types";
import type { History, Meal, Plan } from "@/lib/plan/types";
import { emptyDraft, type OnboardingDraft } from "./onboarding";
import type { BotStore, BotUser } from "./store";

/** In-memory BotStore for tests and local development. */
export class MemoryBotStore implements BotStore {
  readonly users = new Map<string, BotUser>();
  private linkCodes = new Map<string, { userId: string; purpose: LinkCodePurpose }>();
  private otps = new Map<string, { codeHash: string; attempts: number; expiresAt: Date }>();
  private seen = new Set<string>();
  private plans = new Map<string, Plan>();
  private history = new Map<string, History>();
  /** Meals added by a user, on top of the seeded catalog. */
  private extraMeals = new Map<string, Meal[]>();
  readonly deleted: string[] = [];
  private nextId = 1;
  /** Set by issueOtp so tests can read the code without an email sender. */
  lastOtp?: string;

  seedUser(user: Partial<BotUser> & { id?: string }): BotUser {
    const created: BotUser = {
      id: user.id ?? `user-${this.nextId++}`,
      status: "inactive",
      timezone: "Asia/Karachi",
      onboarding: { step: "done", draft: emptyDraft() },
      rules: [],
      delivery: structuredClone(DEFAULT_DELIVERY),
      ...user,
    };
    this.users.set(created.id, created);
    return created;
  }

  addLinkCode(code: string, userId: string, purpose: LinkCodePurpose = "connect_whatsapp") {
    this.linkCodes.set(code.toUpperCase(), { userId, purpose });
  }

  /** Copies on read, like a real database would, so callers cannot mutate stored state. */
  private copy(user: BotUser | undefined) {
    return user ? structuredClone(user) : undefined;
  }

  async findUserByPhone(phone: string) {
    return this.copy([...this.users.values()].find((user) => user.phone === phone));
  }

  async findUserByEmail(email: string) {
    return this.copy([...this.users.values()].find((user) => user.email === email.toLowerCase()));
  }

  async createUser(data: { phone?: string; channel: "portal" | "whatsapp" }) {
    const user = this.seedUser({
      phone: data.phone,
      onboarding: { step: "ask_name", draft: emptyDraft() },
    });
    return this.copy(user)!;
  }

  async saveOnboarding(userId: string, onboarding: BotUser["onboarding"]) {
    const user = this.users.get(userId);
    if (user) user.onboarding = onboarding;
  }

  async finishOnboarding(userId: string, draft: OnboardingDraft) {
    const user = this.users.get(userId);
    if (!user) return;
    user.name = draft.name;
    user.email = draft.email;
    user.rules = draft.rules;
    user.delivery = draft.delivery;
    user.status = "active";
    user.onboarding = { step: "done", draft };
  }

  async linkPhone(userId: string, phone: string) {
    const user = this.users.get(userId);
    if (user) user.phone = phone;
  }

  async touchInbound(userId: string, at: Date) {
    const user = this.users.get(userId);
    if (user) user.lastInboundAt = at;
  }

  async consumeLinkCode(code: string) {
    const key = code.toUpperCase();
    const found = this.linkCodes.get(key);
    if (found) this.linkCodes.delete(key);
    return found;
  }

  async issueOtp(email: string, purpose: OtpPurpose) {
    void purpose;
    const code = "123456";
    this.lastOtp = code;
    this.otps.set(email.toLowerCase(), {
      codeHash: hashCode(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    return code;
  }

  async checkOtp(email: string, code: string) {
    const record = this.otps.get(email.toLowerCase());
    if (!record) return { ok: false as const, reason: "expired" as const };

    const result = checkCode(record, code);
    if (result.ok) this.otps.delete(email.toLowerCase());
    else record.attempts += 1;
    return result;
  }

  async seenMessage(messageId: string) {
    if (this.seen.has(messageId)) return true;
    this.seen.add(messageId);
    return false;
  }

  async mealsFor(userId: string) {
    return [...SEED_MEALS, ...(this.extraMeals.get(userId) ?? [])].filter((meal) => !meal.hidden);
  }

  async historyFor(userId: string) {
    return this.history.get(userId) ?? {};
  }

  async findPlan(userId: string, weekOf: string) {
    const plan = this.plans.get(`${userId}:${weekOf}`);
    return plan ? structuredClone(plan) : undefined;
  }

  async savePlan(userId: string, plan: Plan) {
    this.plans.set(`${userId}:${plan.weekOf}`, structuredClone(plan));
    const history = this.history.get(userId) ?? {};
    for (const day of plan.days) history[day.mealId] = day.date;
    this.history.set(userId, history);
  }

  async setPlanDay(userId: string, weekOf: string, date: string, mealId: string) {
    const plan = this.plans.get(`${userId}:${weekOf}`);
    const day = plan?.days.find((entry) => entry.date === date);
    if (day) day.mealId = mealId;

    const history = this.history.get(userId) ?? {};
    history[mealId] = date;
    this.history.set(userId, history);
  }

  async setPaused(userId: string, paused: boolean) {
    const user = this.users.get(userId);
    if (user) user.status = paused ? "inactive" : "active";
  }

  async deleteUser(userId: string) {
    this.users.delete(userId);
    this.deleted.push(userId);
  }

  async issueLoginLink(userId: string) {
    return `https://example.test/login/${generateLinkCode()}?u=${userId}`;
  }
}
