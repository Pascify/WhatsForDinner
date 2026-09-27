import nodemailer from "nodemailer";
import type { Email, EmailSender } from "./types";

/**
 * Gmail SMTP with an app password: free, about 500 messages a day, and it works without a
 * custom domain, which the free tiers of the hosted email services do not.
 */
export class SmtpEmailSender implements EmailSender {
  private transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: this.user, pass: this.appPassword },
  });

  constructor(
    private readonly user: string,
    private readonly appPassword: string,
    private readonly from = `WhatsForDinner <${user}>`,
  ) {}

  async send(email: Email) {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
      });
      return { ok: true } as const;
    } catch (cause) {
      return { ok: false as const, error: String(cause) };
    }
  }
}

export function emailSenderFromEnv(): EmailSender {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set");
  return new SmtpEmailSender(user, pass);
}
