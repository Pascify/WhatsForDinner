# Getting to an end-to-end test

Order matters: the Meta webhook needs a live URL, so the app is deployed before WhatsApp is
wired up. Everything here is free tier.

## 1. Merge the stack

Bottom up, so each PR shows only its own diff.

```bash
gh pr merge 1 --squash && gh pr merge 2 --squash && gh pr merge 3 --squash && gh pr merge 4 --squash
```

## 2. MongoDB Atlas (5 minutes)

1. Create a free **M0** cluster at cloud.mongodb.com.
2. **Database Access**: add a user, copy the password.
3. **Network Access**: allow `0.0.0.0/0`. Vercel's outbound IPs are not fixed on the free plan,
   so this is required. It is a real tradeoff and it is disclosed in the write-up.
4. Copy the connection string for `MONGODB_URI` and put the password into it.

## 3. Gmail for one-time codes (5 minutes)

1. Create a Gmail account for the app, for example `whatsfordinner.app@gmail.com`.
2. Turn on 2-step verification, then create an **app password** (16 characters).
3. `GMAIL_USER` is the address, `GMAIL_APP_PASSWORD` is that password.

## 4. Meta WhatsApp (15 minutes)

In the Meta app dashboard, under **Connect on WhatsApp > Quickstart**:

1. Copy the **Phone number ID** and the **WhatsApp Business Account ID**.
2. Under **To**, add your number and anyone else who will test, up to 5. Each confirms a code.
3. Copy the test number itself into `WHATSAPP_DISPLAY_NUMBER`, digits only, for example
   `15550123456`. The portal builds its `wa.me` link from it.
4. **App secret**: App settings > Basic > App secret. That is `WHATSAPP_APP_SECRET`, and it is
   what proves a webhook call really came from Meta.
5. **Permanent token**: business settings > System users > add one > assign the app and the
   WhatsApp account with full control > generate a token that never expires with
   `whatsapp_business_messaging`, `whatsapp_business_management` and `business_management`.
6. Make up any random string for `WHATSAPP_VERIFY_TOKEN`. You paste the same one into Meta in
   step 6 below.

Templates are not needed yet. They only matter once someone turns on the paid fallback.

## 5. Deploy to Vercel

1. Import the repo at vercel.com. It is a standard Next.js project, no settings to change.
2. Add every variable from `.env.example` under **Settings > Environment Variables**, for
   Production. Generate the two secrets with `openssl rand -base64 32`:
   - `CODE_PEPPER`, which hashes one-time codes
   - `CRON_SECRET`, shared with the GitHub Actions workflow
3. Set `APP_URL` to the deployment URL, for example
   `https://what-s-for-dinner.vercel.app/projects/whatsfordinner`. The path matters: the app
   runs under `basePath: /projects/whatsfordinner`.
4. Deploy, then create the indexes once, locally, against the same database:

```bash
cp .env.example .env.prod         # fill it in with the same values
pnpm setup-db:prod your@email.com # creates indexes, and makes that account an admin once it exists
```

## 6. Point Meta at the webhook

In the Meta dashboard, **WhatsApp > Configuration > Webhook > Edit**:

- **Callback URL**: `https://<your-deployment>/projects/whatsfordinner/api/whatsapp/webhook`
- **Verify token**: whatever you put in `WHATSAPP_VERIFY_TOKEN`

Click **Verify and save**. Meta calls the URL immediately and the app echoes the challenge back,
so a failure here means the variable is missing or the deployment is not live yet.

Then **Manage** the webhook fields and subscribe to **messages**. Without that, nothing you send
the bot ever reaches the app.

## 7. Check before testing

```bash
pnpm preflight 923001234567
```

It checks every variable, pings MongoDB, confirms the token reaches the phone number, and sends
Meta's `hello_world` template to the number you pass, which proves the allow list works.

## 8. The end-to-end run

**Sign up over WhatsApp.** Message the test number from an allowed phone.

- The bot asks your name, then your email, then emails a 6-digit code.
- Type the code back into the chat, then answer the diet, halal, restriction, day rule,
  delivery and fallback questions.
- The first plan should arrive at the end, free, because your window is open.

**Use the bot.** `plan`, `today`, `tomorrow`, `swap` (pick a day, then accept or ask for another),
`settings`, `login`, `stop`, `resume`.

**Sign up on the portal.** Open `APP_URL` in a browser, enter an email, and check the code
arrives. A new address creates an account, so use a second one to test that path.

**Connect a number from the portal.** On the dashboard, tap the connect button and send the
prefilled `Connect WFD-XXXX` message. The page should flip to connected, and the account should
be the same one, not a second.

**Force a scheduled send.** Set your delivery day and hour in Preferences to the next hour in
your own region, then either wait for the hourly workflow or trigger it by hand:

```bash
curl -X POST "$APP_URL/api/cron/tick" -H "Authorization: Bearer $CRON_SECRET"
```

It returns a summary, for example `{"considered":1,"sent":1,"paid":0,"waiting":0,"failed":0}`.
If your window is shut the plan goes by email instead, which is the correct free behaviour.

## 9. Turn the cron on

Add two repository secrets under **Settings > Secrets and variables > Actions**:

- `APP_URL`, the same value as in Vercel
- `CRON_SECRET`, the same value as in Vercel

The workflow in `.github/workflows/deliver.yml` runs hourly. Trigger it once by hand from the
Actions tab to confirm it can reach the endpoint.

Note GitHub disables scheduled workflows after 60 days with no repository activity, so a
long-quiet repo stops sending silently.

## What is still untested by all of this

- **Templates and the paid fallback.** Nothing sends one until a template is approved and a user
  opts in. Submit `whatsfordinner_weekly` when you want to exercise that path.
- **Recipients** who share a plan without an account. Not built yet.
- **Form submission in a real browser** end to end. The page tests mock server actions.
