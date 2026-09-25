import { emailSenderFromEnv } from "@/lib/email/smtp";
import { cloudApiFromEnv } from "@/lib/whatsapp/client";
import type { BotDeps } from "./handler";
import { MongoBotStore } from "./mongo-store";

/** Wires the real store, WhatsApp client and email sender together for route handlers. */
export function botDepsFromEnv(): BotDeps {
  return {
    store: new MongoBotStore(),
    whatsapp: cloudApiFromEnv(),
    email: emailSenderFromEnv(),
  };
}
