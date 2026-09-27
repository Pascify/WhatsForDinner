import { describeError } from "./errors";
import { buildPayload } from "./payload";
import type { OutboundMessage, SendResult, WhatsAppClient } from "./types";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

export type CloudApiConfig = { token: string; phoneNumberId: string; graphVersion?: string };

/** Talks to Meta's Cloud API. Everything above this file works against the interface instead. */
export class CloudApiClient implements WhatsAppClient {
  constructor(private readonly config: CloudApiConfig) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const version = this.config.graphVersion ?? GRAPH_VERSION;
    const url = `https://graph.facebook.com/${version}/${this.config.phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(message)),
      });
    } catch (cause) {
      return { ok: false, error: `Could not reach Meta: ${String(cause)}`, retryable: true };
    }

    const body = (await response.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };

    if (!response.ok || body.error) {
      const { error, retryable, code } = describeError(
        body.error?.code ?? (response.status >= 500 ? 500 : undefined),
        body.error?.message ?? `Meta returned ${response.status}`,
      );
      return { ok: false, error, retryable, code };
    }

    const messageId = body.messages?.[0]?.id;
    if (!messageId)
      return { ok: false, error: "Meta accepted the send but returned no id", retryable: true };
    return { ok: true, messageId };
  }
}

export function cloudApiFromEnv(): CloudApiClient {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set");
  }
  return new CloudApiClient({ token, phoneNumberId });
}
