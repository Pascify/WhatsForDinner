export type Email = { to: string; subject: string; text: string };

export interface EmailSender {
  send(email: Email): Promise<{ ok: true } | { ok: false; error: string }>;
}
