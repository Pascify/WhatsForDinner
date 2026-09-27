# Progress: where to pick up

Paused 2026-09-23. Design lives in [DESIGN.md](./DESIGN.md); this file is only status.

## Done

| Area | State |
| --- | --- |
| Design doc | Complete: flows, rules, delivery settings, templates, costs, rollout |
| Scaffold | Next.js 16 + TS + Tailwind + ESLint, `basePath: /projects/whatsfordinner`, git repo |
| Meal catalog | `src/data/seedMeals.ts`: 40 dinners, tagged (base / protein / style / diet / vibe / cuisine) |
| Plan generator | `src/lib/plan/`: deterministic, 4 rule strengths, records what it relaxed. **12 tests** |
| DB layer | `src/lib/db/`: document types, cached Mongo client, typed collections, `ensureIndexes()` |
| Codes | `src/lib/auth/codes.ts`: OTP + link codes, hashed, expiry/attempt/resend policy. **7 tests** |
| Bot onboarding | `src/lib/bot/onboarding.ts`: pure state machine, name → email → OTP → diet → halal → restrictions → day rule → delivery → fallback. **14 tests** |
| WhatsApp client | `src/lib/whatsapp/`: `WhatsAppClient` interface, Cloud API implementation, fake, payload builder (button/list/template limits), Meta error map. **11 tests** |
| Webhook plumbing | signature check (`X-Hub-Signature-256`), subscription handshake, payload parsing for text / button / list / template replies and delivery statuses. **10 tests** |
| Bot handler | `src/lib/bot/handler.ts`: dedupe, resume onboarding, portal link codes, email-OTP verification, "welcome back" merge onto an existing account. **13 tests**, run against in-memory fakes |
| Stores & senders | `BotStore` port with `MemoryBotStore` (tests) and `MongoBotStore` (real), `EmailSender` with a fake and Gmail SMTP |
| Webhook route | `src/app/api/whatsapp/webhook/route.ts`: GET verify, POST signed + deduped, per-event error isolation |
| Commands | `plan`, `today`, `tomorrow`, `swap` (day list → suggestion → ✅/🔄), `settings`, `login`, `stop`/`resume`, `delete` + confirm, help. **17 tests** |
| Delivery | `src/lib/delivery/`: cheapest-first channel choice (free window → email → opt-in paid template), admin cap + kill switch, delivery log, pending plans delivered on next message. **21 tests** |
| Portal auth | passwordless email-code login, session cookie (hashed token, TTL index), WhatsApp one-time login links, sign-up on first verified code |
| Portal pages | dashboard (week, swap, regenerate, WhatsApp connect + free-window state), preferences (delivery, region, rule builder), meals (hide/add with tags), admin (spend, cap, kill switch) |
| Schedule + cron | hourly `runTick` matching each user's own timezone, weekly + daily + next-day paid fallback, `POST /api/cron/tick` behind a shared secret, `.github/workflows/deliver.yml` |
| Week + formatting | `src/lib/plan/week.ts` (per-user timezone, week start), `format.ts` (WhatsApp text, swap rows, template variables). **9 tests** |

| Portal logic | `src/lib/portal/forms.ts` (delivery, rules and timezone parsed from untrusted form data). **12 tests** |
| Integration tests | real MongoDB through `mongodb-memory-server`: indexes, `MongoBotStore`, sessions, portal login, meal catalog, and a full WhatsApp sign-up end to end. **58 tests** |

`pnpm test` runs both suites (210 passing). `pnpm test:unit` and `pnpm test:integration` split them.
`npx eslint src --max-warnings 0` is clean and `pnpm build` succeeds.

Two bugs the integration tests found, both fixed here:
- an unset `phone` was stored as `null`, so a second portal sign-up would have collided on the
  sparse unique index (the Mongo client now runs with `ignoreUndefined`);
- meal ids took their suffix from `Date.now()`, so two meals added in the same millisecond hit a
  duplicate key error (the suffix is random now, with a retry).

## Next, in order

1. **Deploy to Vercel**, set the environment variables, run `pnpm setup-db`, then point Meta's
   webhook at `<deployment>/api/whatsapp/webhook` and add the GitHub Actions secrets.
2. **Recipients**: join codes, a read-only share link, and their own delivery settings.
3. **Portal tests**: the pages and server actions are typechecked and built but have no
   automated tests; they need an in-memory MongoDB or a thin port like the bot has.

### Deferred on purpose

- **Server action wiring** is thin by design: parsing lives in `src/lib/portal/forms.ts` and is
  unit tested, so the action itself is a session check plus two calls.
- **Better Auth** was dropped in favour of a small session layer; the reasoning is in DESIGN.md.
- **Switching a number.** If a verified email already has a different phone, the bot says to change
  it on the website rather than offering a Switch button. Needs a confirm step to do properly.
- **Delivery status callbacks** are parsed (including Meta's `billable` flag) but not yet written to
  the `deliveries` log. That happens with the delivery service.
- **Join codes for recipients** are recognised by the same link-code path but have no flow yet.
- **Cron double-runs.** An hourly schedule means one attempt per scheduled hour. A manual
  `workflow_dispatch` inside the same hour could send twice; a `lastRunAt` guard would fix it.
- **GitHub disables scheduled workflows** after 60 days without repo activity. Needs a keepalive.

## Waiting on you

- **Meta:** create the app, test number, add + verify recipient numbers, generate the
  never-expiring system user token. (You have developer access now.)
- **MongoDB Atlas:** free M0 cluster, network access `0.0.0.0/0`, connection string.
- **Gmail:** dedicated account with 2-step verification and an app password, for OTP email.
- Templates can wait: they're only used by the opt-in paid fallback.

## Environment variables

`.env.example` lists them all. None are set yet.

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

- Week start: Monday or Sunday? Monday is hardcoded as `WEEK_STARTS_ON` in `src/lib/bot/run-command.ts`
  until the portal offers a choice.
- Drinks: parked by request, add later.
