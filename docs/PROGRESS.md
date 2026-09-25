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
| Bot onboarding | `src/lib/bot/onboarding.ts` — pure state machine, name → email → OTP → diet → halal → restrictions → day rule → delivery → fallback. **14 tests** |
| WhatsApp client | `src/lib/whatsapp/` — `WhatsAppClient` interface, Cloud API implementation, fake, payload builder (button/list/template limits), Meta error map. **11 tests** |
| Webhook plumbing | signature check (`X-Hub-Signature-256`), subscription handshake, payload parsing for text / button / list / template replies and delivery statuses. **10 tests** |
| Bot handler | `src/lib/bot/handler.ts` — dedupe, resume onboarding, portal link codes, email-OTP verification, "welcome back" merge onto an existing account. **13 tests**, run against in-memory fakes |
| Stores & senders | `BotStore` port with `MemoryBotStore` (tests) and `MongoBotStore` (real), `EmailSender` with a fake and Gmail SMTP |
| Webhook route | `src/app/api/whatsapp/webhook/route.ts` — GET verify, POST signed + deduped, per-event error isolation |

`pnpm test` → 78 passing. `npx eslint src --max-warnings 0` → clean. `pnpm build` → succeeds.

## Next, in order

1. **Commands** — `plan`, `today`, `tomorrow`, `swap`, `settings`, `login`, `stop` / `resume`, `delete`.
2. **Delivery service** — window-aware: free service message, else email, else (opt-in only) template;
   admin monthly cap and kill switch; every send logged to `deliveries`.
3. **Cron** `/api/cron/tick` + hourly GitHub Actions workflow, matching each user's timezone.
4. **Portal** — passwordless email-OTP login (Better Auth), dashboard, meals, rules builder,
   delivery settings, household/recipients, admin page.
5. **Deploy to Vercel**, then point the Meta webhook at the deployed URL.

### Deferred on purpose

- **Switching a number.** If a verified email already has a different phone, the bot says to change
  it on the website rather than offering a Switch button. Needs a confirm step to do properly.
- **Delivery status callbacks** are parsed (including Meta's `billable` flag) but not yet written to
  the `deliveries` log. That happens with the delivery service.
- **Join codes for recipients** are recognised by the same link-code path but have no flow yet.

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
