@AGENTS.md

# WhatsForDinner

## Project Context

A weekly dinner planner that generates a 7-day plan and delivers it over WhatsApp. Portfolio
project, free tier only, public sign-up over both the portal and WhatsApp.

**App** (`src/app/`): Next.js 16 App Router, TypeScript, Tailwind v4, server components plus
server actions. Served under `basePath: /projects/whatsfordinner` behind a Vercel multi-zone
rewrite from the portfolio repo.
**Domain** (`src/lib/`): plain TypeScript, no framework imports, unit tested.
**Data**: MongoDB Atlas M0. **Messaging**: Meta WhatsApp Cloud API. **Email**: Gmail SMTP.
**Cron**: GitHub Actions hourly.

Read `docs/DESIGN.md` for the product design and `docs/PROGRESS.md` for what is built.

## Audience

Full-stack engineer who knows the stack. Do not simplify explanations or code.

## Cost Rules (this project's first filter)

Every design choice is judged on running cost before anything else.

- **The only billable event in the product** is a WhatsApp template sent to a user who opted in
  and whose 24 hour window is shut. Everything else must stay free.
- Meta bills the app owner, not the user, so any new send path needs the admin cap and kill
  switch applied (`store.paidBudget()`, `decideChannel`).
- A message inside the customer service window is free, and so is a Utility template delivered
  while that window is open. The window opens when the user messages us and lasts 24 hours from
  their last message, measured from the inbound message timestamp, not from processing time.
- Before proposing anything that adds a service, state what it costs and which free-tier limit
  it lands in. Gmail SMTP is about 500 mails a day, Atlas M0 is 512 MB, Vercel Hobby is 1M
  function calls a month, GitHub Actions is free on public repos.
- No AI/LLM calls anywhere in the product. They cost money per request.

## Layout

```
src/lib/plan/        generator, rules, rng, week/date helpers, WhatsApp formatting
src/lib/bot/         onboarding state machine, command parser, handler, BotStore port + impls
src/lib/whatsapp/    Cloud API client, fake, payload builder, webhook parsing, signature, window
src/lib/delivery/    channel decision, delivery service, hourly schedule
src/lib/auth/        one-time codes, session cookie
src/lib/db/          document types, Mongo client, typed collections, indexes
src/lib/portal/      server-only reads and writes for the pages
src/app/             pages, server actions, route handlers
scripts/             setup-db.mts (indexes, promote an admin)
```

## Code Change Rules

- Modify only what the task needs. Do not rewrite working code.
- **Keep comments short, one line where possible, and explain the non-obvious why.** No essays.
  Rationale for a decision belongs in `docs/DESIGN.md` or the commit message, not inline.
- **Never use the em dash. Anywhere.** Not in code, comments, docs, commit messages, PR bodies
  or chat. Rewrite with a comma, colon, period, parenthesis or a plain hyphen.
- Domain logic lives in `src/lib`, never in a page or a server action. An action may check the
  session, read the form, call one or two lib functions and revalidate. Nothing else.
- **Every server action checks the session itself.** They are reachable by direct POST, so an
  action that trusts the page that rendered it is a hole.
- New external dependencies need a stated cost and a reason nothing existing covers it.
- Anything that talks to WhatsApp, email or the database goes behind a port with a fake, the way
  `BotStore`, `WhatsAppClient` and `EmailSender` already do. That is what keeps the bot testable
  without credentials.
- Keep `docs/PROGRESS.md` current when a chunk lands, including what was deliberately deferred.

## CI

Workflows, all free on this public repo:

- **CI** (`ci.yml`) on every pull request and push to main. "Lint, format, typecheck & repo rules" and
  "Production build" run in parallel; "Tests & coverage" runs only once both pass and posts a
  coverage comment on the PR (`pnpm test:coverage`).
- **PR checks** (`pr-checks.yml`): branch name, target is `main` or a parent `hammad-wfd/`
  branch, and no commit or title carries a co-author trailer or an em dash.
- **Git Town** (`git-town.yml`) draws the branch stack into the PR description.
- **Labeler** (`labeler.yml`, rules in `.github/labeler.yml`) labels a PR by the areas it touches.
- **Database indexes** (`indexes.yml`) on a push to main that touches `src/lib/db/**` or the
  setup script, and on demand. Runs `pnpm setup-db` against production with the `MONGODB_URI`
  repository secret. Index creation is idempotent, so re-running is safe.
- **Deliver plans** (`deliver.yml`) hourly, the cron that sends plans.

`pnpm check:rules` enforces the conventions a linter cannot see: no em dashes, every
`process.env` variable documented in `.env.example`, every server action checking its own
session, and test files named for the suite they belong to. Add a rule there whenever one of
these conventions gets broken.

## Environments

- `.env.prod` holds the live values: `pnpm doctor`, `preflight` and `setup-db:prod` read it.
- `.env.local` is local only: `pnpm dev:local` starts a MongoDB on this machine (data in
  `.data/`), creates the indexes and runs `next dev`. Without Gmail set, login codes print in
  the terminal. Next also loads `.env.local` for plain `pnpm dev`, so it must never hold live values.
- Neither is committed (`.env*` is ignored). Only `.env.example` is.

## Tests

- `pnpm test` runs everything. `pnpm test:watch` while working.
- **Unit tests are `*.test.ts` next to the code** and use the in-memory fakes. Keep them fast and
  free of I/O.
- **Integration tests are `*.integration.test.ts`** and run against a real MongoDB through
  `mongodb-memory-server`. First run downloads a binary, then it is cached. Use these for index
  behaviour, upserts, TTL fields and anything where the in-memory fake could lie.
- Test behaviour through the seam a user hits: drive the bot through `handleInbound`, not through
  private helpers.
- A fixed clock beats mocking timers. Pass `now` and the message timestamp explicitly.
- Do not assert on locale-formatted dates from `Intl` without pinning the format. Short month
  names differ between ICU versions, which is why `shortDate` builds the string by hand.

## WhatsApp Gotchas

- Template parameters cannot contain newlines, tabs or four or more consecutive spaces. Meta
  rejects the whole send with 132018, so meal names are cleaned in `cleanTemplateVariable`.
- A template body may not start or end with a variable, and Meta rejects bodies with too many
  variables for their length.
- Three buttons maximum, ten list rows, twenty characters per button title.
- A tapped button arrives with both a reply id and the button's own title as text. Parse the id
  first, or the title gets read as a typed command.
- Error codes worth knowing: 131030 recipient not on the test allow list, 131047 window closed,
  132001 template missing or unapproved, 190 bad token. `src/lib/whatsapp/errors.ts` maps them.
- Meta retries webhook deliveries, so every inbound message is checked against `seenMessage`.
- The test number only reaches 5 numbers added by hand in the Meta dashboard.
- **A banned or unregistered number still accepts sends** and returns a message id, then
  delivers nothing, and inbound messages to it stay on one tick. Check `status` on the phone
  number before debugging anything else: `pnpm doctor` does this.
- **Configuring the callback URL does not subscribe the app.** The app has to appear in the
  WhatsApp account's `subscribed_apps`, which only `POST /{WABA_ID}/subscribed_apps` sets.
  Without it Meta accepts the webhook config and never delivers a message.

## Next.js 16

`AGENTS.md` is written by `next dev` and says to read `node_modules/next/dist/docs/` before
writing framework code. Do that, the APIs have moved.

- `cookies()` and `params` are async.
- Route and page param types come from generated types. After adding a route, run
  `npx next typegen` or the build, otherwise `RouteContext<"/login/[code]">` does not typecheck.
- Route handlers are not cached, but mark anything session-dependent `dynamic = "force-dynamic"`.
- `runtime = "nodejs"` on any route that touches MongoDB or `node:crypto`.

## Data Model

`users` (one account, email and phone both unique and sparse, `onboarding.step` resumes a
half-finished sign-up), `meals` (per-user additions and hidden overrides on top of the seeded
catalog), `mealPlans` (unique on user + weekOf, `status` pending or delivered), `mealHistory`
(drives repeat avoidance), `deliveries` (free vs paid audit trail), `sessions`, `otpCodes`,
`linkCodes`, `processedMessages` and `adminSettings`. The last four expire through TTL indexes,
which is what keeps the free 512 MB from filling with one-time codes.

Accounts are never deleted automatically. An incomplete sign-up is `inactive` with a reason.

## Git Conventions

Author: `Hammad un Noor <hammadunnoorr@gmail.com>`. No co-author trailers.
Branch names: `hammad-wfd/<short-description>`.
Commit messages: short and action-oriented, for example `Add swap flow to the bot`. Body
explains why when it is not obvious. No em dashes.

Stacked branches with git-town, as in the harlyy repos:

```
git checkout main
git town append hammad-wfd/<short-description>
```

Commit as you go rather than batching a whole feature into one commit. Never push to `main`
directly, the user reviews first.

### Merging a stack

Merge bottom up, and **let GitHub delete each head branch on merge**. That is what makes GitHub
retarget the children onto `main` automatically. The repository setting is on
(`delete_branch_on_merge`); if it is ever turned off, a stacked PR merges into its parent branch
instead of `main` and the work silently does not reach production.

After merging a PR in a stack, check the next one actually points at `main`:

```
gh pr list --json number,headRefName,baseRefName \
  --jq '.[] | "#\(.number) \(.headRefName) -> \(.baseRefName)"'
```

If it still points at the merged branch, retarget it:

```
gh pr edit <n> --base main
```

Rewriting a branch that already has an open PR (a rebase, a message fix, a force push) can make
GitHub close the PR, and a closed PR cannot be reopened once its commits no longer exist. Create
a replacement PR rather than trying to revive it.

## Debugging

- Reason from evidence: test output, the delivery log, Meta's error code, the actual document.
- State the hypothesis and what supports it before changing code.
- If something is missing, ask one focused question instead of guessing.

## Response Format

- Short. Two to four sentences of explanation unless more is asked for.
- No preamble before the answer.
- Report failures plainly, including the output.

## Self-Improvement

Add to this file when a project-specific fact is learned: a Meta constraint, a free-tier limit,
a convention the user corrected, a gotcha in the stack. Not generic advice. Prefer extending an
existing section over adding a new one, and never delete existing content without asking.
