# Progress — where to pick up

Paused 2026-09-23. Design lives in [DESIGN.md](./DESIGN.md); this file is only status.

## Done

| Area | State |
| --- | --- |
| Design doc | Complete — flows, rules, delivery settings, templates, costs, rollout |
| Scaffold | Next.js 16 + TS + Tailwind + ESLint, `basePath: /projects/whatsfordinner`, git repo |
| Meal catalog | `src/data/seedMeals.ts` — 40 dinners, tagged (base / protein / style / diet / vibe / cuisine) |
| Plan generator | `src/lib/plan/` — deterministic, 4 rule strengths, records what it relaxed. **12 tests** |
| DB layer | `src/lib/db/` — document types, cached Mongo client, typed collections, `ensureIndexes()` |
| Codes | `src/lib/auth/codes.ts` — OTP + link codes, hashed, expiry/attempt/resend policy. **7 tests** |
| Bot onboarding | `src/lib/bot/onboarding.ts` — pure state machine, name → email → OTP → diet → halal → restrictions → day rule → delivery → fallback. **Typechecks, tests not written yet** |

`pnpm test` → 19 passing. `npx eslint src --max-warnings 0` → clean.

## Next, in order

1. **Tests for the onboarding machine** (happy path, wrong OTP, skips, restriction parsing). Start here.
2. **Account service** — create/find user by phone or email, link phone to an existing account,
   the "switch number?" case, active/inactive transitions.
3. **WhatsApp client behind an interface** — `send(message)` with a real Cloud API implementation
   and a fake used by tests, so everything below can be built before the Meta credentials land.
4. **Webhook route** `/api/whatsapp/webhook` — GET verify token, POST signature check, dedupe by
   message id, then route: link code → join code → OTP → onboarding step → pending plan → command.
5. **Commands** — `plan`, `today`, `tomorrow`, `swap`, `settings`, `login`, `stop` / `resume`, `delete`.
6. **Delivery service** — window-aware: free service message, else email, else (opt-in only) template;
   admin monthly cap and kill switch; every send logged to `deliveries`.
7. **Cron** `/api/cron/tick` + hourly GitHub Actions workflow, matching each user's timezone.
8. **Portal** — passwordless email-OTP login (Better Auth), dashboard, meals, rules builder,
   delivery settings, household/recipients, admin page.
9. **Deploy to Vercel**, then point the Meta webhook at the deployed URL.

## Waiting on you

- **Meta:** create the app, test number, add + verify recipient numbers, generate the
  never-expiring system user token. (You have developer access now.)
- **MongoDB Atlas:** free M0 cluster, network access `0.0.0.0/0`, connection string.
- **Gmail:** dedicated account with 2-step verification and an app password, for OTP email.
- Templates can wait: they're only used by the opt-in paid fallback.

## Environment variables (none set yet)

```
MONGODB_URI=            # Atlas M0
MONGODB_DB=whatsfordinner
CODE_PEPPER=            # random string; hashes OTP and link codes
WHATSAPP_TOKEN=         # system user token, never expires
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_APP_SECRET=    # verifies webhook signatures
WHATSAPP_VERIFY_TOKEN=  # any random string, also pasted into Meta's webhook config
GMAIL_USER=
GMAIL_APP_PASSWORD=
CRON_SECRET=            # shared with the GitHub Actions workflow
```

## Open questions

- Week start: Monday or Sunday? (Generator takes any `weekOf`; the UI needs a default.)
- Drinks: parked by request, add later.
