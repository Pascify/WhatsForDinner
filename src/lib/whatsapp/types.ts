import type { BotButton, BotListRow } from "@/lib/bot/messages";

/** Free: only deliverable while the 24h customer service window is open. */
export type OutboundText = {
  kind: "text";
  to: string;
  text: string;
  buttons?: BotButton[];
  list?: { button: string; rows: BotListRow[] };
};

/** Paid when the window is shut, free when it is open. Requires an approved template. */
export type OutboundTemplate = {
  kind: "template";
  to: string;
  template: { name: string; language: string; variables: string[] };
};

export type OutboundMessage = OutboundText | OutboundTemplate;

export type SendResult =
  { ok: true; messageId: string } | { ok: false; error: string; code?: number; retryable: boolean };

export interface WhatsAppClient {
  send(message: OutboundMessage): Promise<SendResult>;
}
