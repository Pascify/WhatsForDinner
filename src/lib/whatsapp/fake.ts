import type { OutboundMessage, SendResult, WhatsAppClient } from "./types";

/**
 * Stands in for the Cloud API so the bot, delivery and cron can be built and tested before
 * any Meta credentials exist. Records everything it was asked to send.
 */
export class FakeWhatsAppClient implements WhatsAppClient {
  readonly sent: OutboundMessage[] = [];
  private failures: SendResult[] = [];
  private counter = 0;

  /** Queue a failure to be returned by the next send, for testing error paths. */
  failNext(result: SendResult) {
    this.failures.push(result);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const failure = this.failures.shift();
    if (failure) return failure;

    this.sent.push(message);
    this.counter += 1;
    return { ok: true, messageId: `wamid.fake${this.counter}` };
  }

  get lastMessage(): OutboundMessage | undefined {
    return this.sent.at(-1);
  }

  /** Every plain-text body sent so far, for readable assertions. */
  texts(): string[] {
    return this.sent.map((message) =>
      message.kind === "text" ? message.text : message.template.name,
    );
  }

  reset() {
    this.sent.length = 0;
    this.failures.length = 0;
    this.counter = 0;
  }
}
