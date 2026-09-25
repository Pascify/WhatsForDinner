import type { Email, EmailSender } from "./types";

/** Used by tests and by local development, where no Gmail app password exists yet. */
export class FakeEmailSender implements EmailSender {
  readonly sent: Email[] = [];

  async send(email: Email) {
    this.sent.push(email);
    return { ok: true } as const;
  }

  /** The 6-digit code from the most recent email, for assertions. */
  lastCode(): string | undefined {
    return this.sent.at(-1)?.text.match(/\b\d{6}\b/)?.[0];
  }

  reset() {
    this.sent.length = 0;
  }
}
