/**
 * Checks everything an end-to-end test needs before you start clicking.
 *
 *   pnpm preflight [92300xxxxxxx]
 *
 * Pass a WhatsApp number to also send Meta's hello_world template to it, which proves the
 * token, the phone number id and the recipient allow list all work.
 */
import { getClient } from "@/lib/db/mongo";
import { emailSenderFromEnv } from "@/lib/email/smtp";

const REQUIRED = [
  "MONGODB_URI",
  "CODE_PEPPER",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_DISPLAY_NUMBER",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "CRON_SECRET",
  "APP_URL",
];

let failed = false;
const ok = (message: string) => console.log(`  ok    ${message}`);
const bad = (message: string) => {
  failed = true;
  console.log(`  FAIL  ${message}`);
};

console.log("\nEnvironment");
for (const name of REQUIRED) {
  if (process.env[name]) ok(name);
  else bad(`${name} is not set`);
}

if (!failed) {
  console.log("\nMongoDB");
  try {
    const client = await getClient();
    await client.db(process.env.MONGODB_DB ?? "whatsfordinner").command({ ping: 1 });
    ok("connected and responding");
    await client.close();
  } catch (error) {
    bad(`could not connect: ${(error as Error).message}`);
  }

  console.log("\nEmail");
  const to = process.env.GMAIL_USER!;
  const sent = await emailSenderFromEnv().send({
    to,
    subject: "WhatsForDinner preflight",
    text: "If you are reading this, one-time codes will reach your users.",
  });

  if (sent.ok) ok(`test mail sent to ${to}, check the inbox`);
  else bad(`Gmail rejected the send: ${sent.error}`);

  console.log("\nWhatsApp");
  const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";
  const base = `https://graph.facebook.com/${version}`;
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };

  const details = await fetch(`${base}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`, { headers: auth });
  const body = (await details.json()) as {
    display_phone_number?: string;
    error?: { message: string };
  };

  if (details.ok) ok(`token reaches number ${body.display_phone_number ?? "(unnamed)"}`);
  else bad(`token or phone number id rejected: ${body.error?.message}`);

  const recipient = process.argv[2];
  if (details.ok && recipient) {
    const send = await fetch(`${base}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      }),
    });
    const result = (await send.json()) as { error?: { message: string; code: number } };

    if (send.ok) ok(`hello_world sent to ${recipient}, check the phone`);
    else bad(`send failed (${result.error?.code}): ${result.error?.message}`);
  }
}

console.log(failed ? "\nNot ready yet. Fix the failures above.\n" : "\nReady for an end-to-end run.\n");
process.exit(failed ? 1 : 0);
