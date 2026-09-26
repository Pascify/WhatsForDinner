# WhatsForDinner — Design

Weekly dinner planning, delivered over WhatsApp. Portfolio project, free tier only.

- Public route: `hammad.vercel.app/projects/whatsfordinner` (Vercel multi-zone rewrite from the portfolio repo)
- Brand in messages: **WhatsForDinner**
- Last updated: 2026-09-23

---

## 1. Guiding constraint: low / no cost

Cost is the first filter on every decision.

| Part | Cost | Free limit vs. our use |
| --- | --- | --- |
| WhatsApp messages inside the 24h window | Free | Unlimited |
| WhatsApp delivery status callbacks | Free | A few per message |
| WhatsApp template (window closed) | **Paid** | Opt-in only, capped by admin |
| Email (Gmail SMTP, dedicated account) | Free | ~500/day |
| Vercel Hobby | Free | 1M function calls/month |
| MongoDB Atlas M0 | Free | 512 MB |
| GitHub Actions (hourly cron) | Free | Unlimited public / 2,000 min private |
| Domain | Free | `.vercel.app` |

**The only billable event in the entire product** is a WhatsApp template sent to a user who
(a) turned on "WhatsApp anyway" and (b) has no open 24h window at send time.

### Meta pricing rules we rely on
- A **customer service window** opens when a user messages the business and lasts 24 hours from their last message.
- **Non-template messages** are free and can only be sent inside that window.
- **Utility templates delivered inside an open window are free** (since 2025-07-01).
- Business-initiated templates outside the window are billed.

---

## 2. Identity model

**One person = one account.** Email unique, phone unique.

| Field | Notes |
| --- | --- |
| `name` | asked on both paths |
| `email` (verified) | required; verified by 6-digit OTP |
| `phone` (verified) | optional on portal; implicit on WhatsApp (sender is authenticated by WhatsApp) |
| `status` | `active` / `inactive` |
| `inactiveReason` | `email_unverified` / `onboarding_incomplete` / `paused` |

Accounts are **never auto-deleted**. Incomplete sign-ups sit as `inactive` and resume where they
stopped. `delete` (chat) or the portal wipes an account on request.

Proof of ownership:
- **Email** → 6-digit OTP (10 min, 5 attempts, 60s resend cooldown, stored hashed).
- **Phone** → the user messaged us from it.
- **Auto-link (no OTP)** → first WhatsApp message carries a portal-issued code (`Connect WFD-7Q4K`):
  random, single-use, 15 min, stored hashed. Never embed username/email/hash-of-username in the
  prefilled message.

### Auth
Passwordless. Email + 6-digit OTP for portal login, 30-day sessions.

Better Auth was the earlier plan, but the WhatsApp side already needed hashed one-time codes
with expiry, attempt limits and resend cooldowns, plus its own `users` shape carrying phone,
onboarding state and delivery settings. Adding a framework on top would have meant a second
user table and a mapping layer for the one feature we use. The session layer is a random token
stored hashed, an httpOnly cookie, and a TTL index — `src/lib/auth/session.ts`.
Second option: **Log in with WhatsApp** — page shows a code, user sends it, bot asks
"Log in on Chrome · Karachi? [Yes, it's me] [No]" to block QR-jacking.

---

## 3. Flows

### A. WhatsApp first (any inbound message)
1. **Message contains a portal code** → link phone to that account, continue.
2. **Number known** → resume: mid-onboarding step / command / "Resume?" if paused.
3. **Number unknown** →
   1. name
   2. email (required)
   3. OTP emailed → typed into chat
      - email new → create account
      - email exists → **link this phone to that account** ("Welcome back")
      - that account has another phone → "Switch to this number? [Switch] [Cancel]"
   4. onboarding basics (diet, halal, never-eat, 1-2 day rules)
   5. delivery setting (§5)
   6. first plan sent — free, window is open

### B. Portal first
1. email → OTP → verified
2. name
3. preferences + full rule builder
4. delivery setting
5. **Connect WhatsApp** (optional): button on mobile, QR on desktop, sends `Connect WFD-7Q4K`;
   first plan arrives immediately. Skipping keeps the account active (plans visible on the web);
   a banner + one reminder email follow.

### C. Sharing with family — no account needed
- **Share link**: read-only page of the current plan, always current.
- **Recipient**: sends a join code to the bot once; receives the owner's plan on WhatsApp; can use
  `plan`, `today`, `tomorrow`, `swap`; has no email and no portal access. Window-closed options are
  Wait or WhatsApp anyway (no email fallback).

### D. Weekly cycle (per user, in their own timezone)
1. Hourly job finds users whose delivery time has arrived.
2. Generate the plan (§4).
3. Deliver per §5.
4. Record every send as free or paid.
5. Served meals feed history → next plan avoids repeats.

### E. Bot commands (all free, inside the window)
`plan` · `today` · `tomorrow` · `swap` (day list → next-best meal → ✅/🔄) · `settings` ·
`login` (one-time portal link) · `stop` / `resume` · `delete` · anything else → help.
Replies carry quick-reply buttons; every tap re-opens the 24h window.

---

## 4. Plan generation

Deterministic: same inputs + same seed → same plan (seed derived from user + week). Testable.

### Meal tags
| Group | Examples |
| --- | --- |
| Base | rice, roti/naan, pasta, noodles, bread |
| Protein | chicken, beef, mutton, fish, eggs, daal, paneer, veg |
| Style | gravy/curry, dry, grilled, fried, BBQ, soup |
| Diet | halal, vegetarian, vegan, gluten-free |
| Vibe | healthy, splurge, quick, comfort, eat-out |
| Cuisine | desi, chinese, italian, middle-eastern, ... |

Seed catalog: the ~40 dishes from `~/Projects/monthly-food-generator/src/data/seedDishes.ts`,
re-tagged against the groups above. Users can add their own meals (tag picker) and hide any meal.

### Rule types
| Type | Example | Strictness |
| --- | --- | --- |
| Always / Never | always halal; never beef | hard, never broken |
| Day | Friday → rice + chicken; Sunday → splurge | hard unless nothing fits |
| How often | pasta ≤ 1/week; healthy ≥ 3/week | soft |
| Prefer | more chicken; less fried | weighting only |

Relaxation order when a day has no candidates: Prefer → How often → Day → (never) Always/Never.
The plan records why a rule was relaxed and the UI shows it.

Repeat avoidance: weight down meals served in recent weeks (history), configurable gap.

Rules are edited in the portal builder. WhatsApp onboarding only captures basics (no free-text
parsing beyond a small keyword vocabulary — NLP would mean a paid LLM).

---

## 5. Delivery settings (per user, opt-in)

**1. How should we send plans?**
- `on_request` — nothing unsolicited. Always $0.
- `auto` — then: `weekly` (e.g. Sat 18:00) / `daily` (tonight's dinner, e.g. 16:00, chosen days) / both.

**2. If the WhatsApp window is closed at send time:**
- `wait` — delivered with their next message. Free.
- `email` — free, always available (email is mandatory). **Default.**
- `whatsapp` — template. 💰 Paid, requires explicit confirmation; opt-in timestamp + source recorded.

Default for new users: `auto` · `weekly` · `email`.

Daily reminders carry `[👍 Got it] [Swap]`; a tap re-opens the window so the next day is free.

### Admin (owner only)
- **Monthly paid-message cap** across all users; on reaching it, paid sends degrade to email.
  Test number: 50. Real number: starts at 0.
- **Kill switch** for all paid sends.
- Spend + free/paid counters.

---

## 6. WhatsApp templates

| Name | Purpose | Body sketch |
| --- | --- | --- |
| `whatsfordinner_weekly` | full week (default) | header `WhatsForDinner 🍽️`, body `Here is your dinner plan for the week of {{1}}:` + `Mon: {{2}}` … `Sun: {{8}}`, footer `Your automatic weekly plan`, buttons `Looks good 👍` / `Swap a meal` |
| `whatsfordinner_daily` | tonight's dinner | `Tonight's dinner: {{1}}` + buttons |
| `whatsfordinner_ready` | generic nudge / backup | `Your plan for the week of {{1}} is ready` + button `Show my plan` |

Constraints: parameters cannot contain newlines/tabs/4+ spaces; body may not start or end with a
variable; too many variables for the body length gets rejected; `example` values are mandatory;
promotional tone risks re-categorisation to Marketing.

---

## 7. Architecture

- **Next.js (App Router) on Vercel Hobby**, `basePath: /projects/whatsfordinner`.
- **MongoDB Atlas M0**, cached connection across invocations, `0.0.0.0/0` network access (disclosed).
- **GitHub Actions hourly cron** → `POST /api/cron/tick` with a shared secret.
  Hourly because users span timezones; Vercel Hobby cron is daily-only. Note: scheduled workflows
  are disabled after 60 days of repo inactivity — needs a keepalive.
- **Webhook** `/api/whatsapp/webhook`: `GET` verify token; `POST` verifies `X-Hub-Signature-256`,
  dedupes by message id, routes: portal code → join code → OTP → onboarding step → pending plan →
  command. Meta calls the project's own `.vercel.app` URL directly, not the portfolio domain.
- **Email**: Gmail SMTP (dedicated account + app password) for OTP, plan delivery, reminders.

### Collections
`users`, `meals`, `mealPlans` (+`status`, `deliveredVia`, unique index on user+weekOf),
`mealHistory`, `recipients`, `deliveries` (free/paid log), `settings` (admin), plus TTL collections
`otpCodes`, `linkCodes`, `processedMessages`, and Better Auth's session tables.

---

## 8. Rollout

- **Phase 1 — test number.** Up to 5 numbers added by hand in Meta's dashboard. Everything works
  for those numbers; public WhatsApp sign-up cannot.
- **Phase 2 — real business number.** Needed to open sign-up. Registration is free; requires a SIM
  not already on WhatsApp and a display-name review. Unverified businesses are capped at 250
  business-initiated conversations/day, which we barely use.

Disclosed in the portfolio write-up: test-number recipient cap, Hobby plan is non-commercial,
Atlas open network access, and the cost-aware delivery design.
