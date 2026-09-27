# Progress: where to pick up

Updated 2026-09-28. Design lives in [DESIGN.md](./DESIGN.md), deployment steps in
[DEPLOY.md](./DEPLOY.md); this file is only status.

## In one line

The app is built, tested, deployed and wired to Meta. It cannot send a message because **Meta
permanently disabled the business portfolio and its test WhatsApp account on 2026-09-27**. A
review was requested the same day. Nothing in the codebase is known to be broken.

## Live setup

| Piece          | State                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Deployment     | `https://pascify-pascify.vercel.app/projects/whatsfordinner` (Vercel project `pascify`, team Pascify, Hobby) |
| Domain note    | The bare domain redirects into the base path. `pascify.vercel.app` was taken, hence the doubled name         |
| Database       | MongoDB Atlas M0, Mumbai. Network access `0.0.0.0/0`, which production needs                                 |
| Email          | Gmail SMTP as `whatsfordinnersupport@gmail.com`, app password in Vercel                                      |
| Env vars       | All set in Vercel Production and mirrored in `.env.prod` (`.env.local` is for local development)             |
| Meta webhook   | Callback URL verified, `messages` field subscribed, app subscribed to the WABA                               |
| Meta account   | **Disabled.** Test number `+1 555-156-2911` reports `status: BANNED`                                         |
| GitHub secrets | **Not set yet**: `MONGODB_URI`, `APP_URL`, `CRON_SECRET`. The hourly workflow cannot run without them        |

Run `pnpm doctor` to see all of this in one command: number status, app subscription, and
whether production can reach the database.

## What has been proven end to end

Against the real deployment and the real database, using a signed webhook delivery
(`X-Hub-Signature-256`) rather than Meta's own delivery:

- the webhook verifies signatures, dedupes retries and routes correctly;
- onboarding creates the account and advances its step;
- outbound sends are accepted by the Cloud API;
- `POST /api/cron/tick` reaches Atlas and returns a summary.

The only untested link is Meta actually delivering an inbound message, which the ban prevents.

## If the review is refused

Create a **new app under a different business portfolio**, since a portfolio created under a
disabled one tends to be caught by the same enforcement. Then:

1. Add the test recipient numbers under **To** and verify them.
2. Assign the new app and new WABA to the `whatsfordinner-bot` system user, generate a token.
3. Update `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`,
   `WHATSAPP_APP_SECRET` and `WHATSAPP_DISPLAY_NUMBER` in Vercel and `.env.prod`, redeploy.
4. Set the callback URL and verify token, subscribe to **messages**.
5. `POST /{WABA_ID}/subscribed_apps` with the token. **The dashboard does not do this**, and
   without it Meta never delivers anything.
6. `pnpm doctor`, then message the number.

Pick a display name that reads as a real service. `What's For Dinner` was declined on review.

## Done

| Area              | State                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design doc        | Complete: flows, rules, delivery settings, templates, costs, rollout                                                                                                                          |
| Scaffold          | Next.js 16 + TS + Tailwind + ESLint, `basePath: /projects/whatsfordinner`, git repo                                                                                                           |
| Meal catalog      | `src/data/seedMeals.ts`: 40 dinners, tagged (base / protein / style / diet / vibe / cuisine)                                                                                                  |
| Plan generator    | `src/lib/plan/`: deterministic, 4 rule strengths, records what it relaxed. **12 tests**                                                                                                       |
| DB layer          | `src/lib/db/`: document types, cached Mongo client, typed collections, `ensureIndexes()`                                                                                                      |
| Codes             | `src/lib/auth/codes.ts`: OTP + link codes, hashed, expiry/attempt/resend policy. **7 tests**                                                                                                  |
| Bot onboarding    | `src/lib/bot/onboarding.ts`: pure state machine, name → email → OTP → diet → halal → restrictions → day rule → delivery → fallback. **14 tests**                                              |
| WhatsApp client   | `src/lib/whatsapp/`: `WhatsAppClient` interface, Cloud API implementation, fake, payload builder (button/list/template limits), Meta error map. **11 tests**                                  |
| Webhook plumbing  | signature check (`X-Hub-Signature-256`), subscription handshake, payload parsing for text / button / list / template replies and delivery statuses. **10 tests**                              |
| Bot handler       | `src/lib/bot/handler.ts`: dedupe, resume onboarding, portal link codes, email-OTP verification, "welcome back" merge onto an existing account. **13 tests**, run against in-memory fakes      |
| Stores & senders  | `BotStore` port with `MemoryBotStore` (tests) and `MongoBotStore` (real), `EmailSender` with a fake and Gmail SMTP                                                                            |
| Webhook route     | `src/app/api/whatsapp/webhook/route.ts`: GET verify, POST signed + deduped, per-event error isolation                                                                                         |
| Commands          | `plan`, `today`, `tomorrow`, `swap` (day list → suggestion → ✅/🔄), `settings`, `login`, `stop`/`resume`, `delete` + confirm, help. **17 tests**                                             |
| Delivery          | `src/lib/delivery/`: cheapest-first channel choice (free window → email → opt-in paid template), admin cap + kill switch, delivery log, pending plans delivered on next message. **21 tests** |
| Portal auth       | passwordless email-code login, session cookie (hashed token, TTL index), WhatsApp one-time login links, sign-up on first verified code                                                        |
| Portal pages      | dashboard (week, swap, regenerate, WhatsApp connect + free-window state), preferences (delivery, region, rule builder), meals (hide/add with tags), admin (spend, cap, kill switch)           |
| Schedule + cron   | hourly `runTick` matching each user's own timezone, weekly + daily + next-day paid fallback, `POST /api/cron/tick` behind a shared secret, `.github/workflows/deliver.yml`                    |
| Week + formatting | `src/lib/plan/week.ts` (per-user timezone, week start), `format.ts` (WhatsApp text, swap rows, template variables). **9 tests**                                                               |

| Portal logic | `src/lib/portal/forms.ts` (delivery, rules and timezone parsed from untrusted form data). **12 tests** |
| Integration tests | real MongoDB through `mongodb-memory-server`: indexes, `MongoBotStore`, sessions, portal login, meal catalog, and a full WhatsApp sign-up end to end. **58 tests** |

| Component tests | jsdom + Testing Library: UI primitives, nav, login form, dashboard, preferences, meals and admin pages. **50 tests** |

`pnpm test` runs every suite (260 passing). `pnpm test:unit`, `pnpm test:integration` and `pnpm test:dom` split them.
`npx eslint src --max-warnings 0` is clean and `pnpm build` succeeds.

Two bugs the integration tests found, both fixed here:

- an unset `phone` was stored as `null`, so a second portal sign-up would have collided on the
  sparse unique index (the Mongo client now runs with `ignoreUndefined`);
- meal ids took their suffix from `Date.now()`, so two meals added in the same millisecond hit a
  duplicate key error (the suffix is random now, with a retry).

## Next, in order

1. **Unblock Meta**: wait on the review, or rebuild the app under a fresh portfolio as above.
2. **Add the GitHub Actions secrets** (`MONGODB_URI`, `APP_URL`, `CRON_SECRET`) so the hourly
   delivery workflow and the index workflow can run.
3. **Recipients**: join codes, a read-only share link, and their own delivery settings.
4. **Interaction tests** stop at the form boundary: pages render and forms are inspected, but
   server actions are mocked, so submitting end to end in a browser is untested.

### Deferred on purpose

- **Server action wiring** is thin by design: parsing lives in `src/lib/portal/forms.ts` and is
  unit tested, so the action itself is a session check plus two calls.
- **Better Auth** was dropped in favour of a small session layer; the reasoning is in DESIGN.md.
- **Switching a number.** If a verified email already has a different phone, the bot says to change
  it on the website rather than offering a Switch button. Needs a confirm step to do properly.
- **Delivery status callbacks** are parsed (including Meta's `billable` flag) but not yet written to
  the `deliveries` log. That happens with the delivery service.
- **Join codes for recipients** are recognised by the same link-code path but have no flow yet.
- **Cron double-runs.** Overlapping runs now queue behind a `concurrency` group, but a manual
  `workflow_dispatch` later in the same hour could still send twice; a `lastRunAt` guard would fix it.
- **Delivery of bot replies is fire and forget** beyond the send call: a refused send now throws
  and is reported, but there is no retry.

## Lessons that cost time

- A **banned number accepts sends** and returns a message id, then delivers nothing. Check
  `status` on the phone number first, which is what `pnpm doctor` does.
- **Configuring the webhook is not subscribing.** The app must appear in the WABA's
  `subscribed_apps`, which only the API sets.
- Atlas rejects an IP that is not on the access list **at the TLS layer**, so the error reads
  `tlsv1 alert internal error` rather than anything about permissions.
- Squash merging a stacked PR makes every branch above it conflict, since squash rewrites
  history. Use a merge commit for stacks.

## CI

`ci.yml` runs typecheck, lint, `check:rules`, 262 tests and a build on every pull request, plus
branch-name and commit-message checks. `indexes.yml` creates the database indexes from main.
Both need repository secrets: `MONGODB_URI` for indexes, and `APP_URL` plus `CRON_SECRET` for
the hourly delivery workflow.

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
