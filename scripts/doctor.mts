/**
 * Checks the live WhatsApp setup, in the order things actually break.
 *
 *   pnpm doctor
 *
 * Written after a day lost to a silent bot: the webhook, the signature and the database were
 * all fine, and the test number had been banned the whole time.
 */
const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";
const graph = `https://graph.facebook.com/${version}`;
const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };

const ok = (message: string) => console.log(`  ok    ${message}`);
const bad = (message: string) => console.log(`  FAIL  ${message}`);

console.log("\nPhone number");
const number = (await fetch(
  `${graph}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,status,name_status,quality_rating`,
  { headers: auth },
).then((r) => r.json())) as {
  display_phone_number?: string;
  status?: string;
  name_status?: string;
  error?: { message: string };
};

if (number.error) {
  bad(`token rejected: ${number.error.message}`);
} else {
  ok(`${number.display_phone_number}`);
  // A banned number accepts sends and returns message ids, then delivers nothing at all.
  if (number.status === "CONNECTED") ok(`status ${number.status}`);
  else bad(`status ${number.status}: nothing will be delivered`);
  if (number.name_status !== "APPROVED")
    console.log(`        display name is ${number.name_status}`);
}

console.log("\nWebhook subscription");
const subs = (await fetch(`${graph}/${process.env.WHATSAPP_WABA_ID}/subscribed_apps`, {
  headers: auth,
}).then((r) => r.json())) as {
  data?: { whatsapp_business_api_data?: { id: string; name: string } }[];
  error?: { message: string };
};

if (subs.error) {
  bad(`could not read subscriptions: ${subs.error.message}`);
} else {
  // Configuring the callback URL is not enough; the app must be subscribed to the WABA.
  const apps = (subs.data ?? []).map((entry) => entry.whatsapp_business_api_data);
  const mine = apps.find((app) => app?.name && !app.name.includes("1P App"));
  if (mine) ok(`${mine.name} (${mine.id}) is subscribed to the WhatsApp account`);
  else bad("your app is not subscribed: Meta will never deliver a message to the webhook");
}

console.log("\nDeployment");
const base = process.env.APP_URL;
const tick = await fetch(`${base}/api/cron/tick`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
const body = (await tick.text()).slice(0, 200);
if (tick.ok) ok(`database reachable from production: ${body}`);
else bad(`cron tick ${tick.status}: ${body}`);

console.log();
