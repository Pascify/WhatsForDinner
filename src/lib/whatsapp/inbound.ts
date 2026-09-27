/** Normalised view of the parts of Meta's webhook payload this app acts on. */
export type InboundEvent =
  | {
      type: "message";
      messageId: string;
      from: string;
      at: Date;
      /** Typed text, or the title of the button/row they tapped. */
      text: string;
      /** Set when the user tapped a reply button or list row. */
      replyId?: string;
    }
  | {
      type: "status";
      messageId: string;
      status: "sent" | "delivered" | "read" | "failed";
      at: Date;
      /** Meta bills per message; "billable: false" is how we confirm a send was free. */
      billable?: boolean;
      error?: string;
    };

type RawValue = {
  messages?: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body?: string };
    interactive?: {
      type?: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string };
    };
    button?: { text?: string; payload?: string };
  }[];
  statuses?: {
    id: string;
    status: string;
    timestamp: string;
    pricing?: { billable?: boolean };
    errors?: { title?: string; message?: string }[];
  }[];
};

const toDate = (timestamp: string) => new Date(Number(timestamp) * 1000);

/** Pulls every message and status out of a webhook body, ignoring anything else Meta sends. */
export function parseWebhook(body: unknown): InboundEvent[] {
  const entries = (body as { entry?: { changes?: { value?: RawValue }[] }[] })?.entry ?? [];
  const events: InboundEvent[] = [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const message of value.messages ?? []) {
        const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
        const quickReplyPayload = message.button?.payload;

        events.push({
          type: "message",
          messageId: message.id,
          from: message.from,
          at: toDate(message.timestamp),
          text: reply?.title ?? message.text?.body ?? message.button?.text ?? "",
          replyId: reply?.id ?? quickReplyPayload,
        });
      }

      for (const status of value.statuses ?? []) {
        events.push({
          type: "status",
          messageId: status.id,
          status: status.status as "sent" | "delivered" | "read" | "failed",
          at: toDate(status.timestamp),
          billable: status.pricing?.billable,
          error: status.errors?.[0]?.message ?? status.errors?.[0]?.title,
        });
      }
    }
  }

  return events;
}
