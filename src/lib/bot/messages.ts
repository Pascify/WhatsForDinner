/** What the bot can send back. Rendered by the WhatsApp client or a fake one in tests. */
export type BotButton = { id: string; title: string };
export type BotListRow = { id: string; title: string; description?: string };

export type BotMessage = {
  text: string;
  /** Up to 3, per the Cloud API. */
  buttons?: BotButton[];
  list?: { button: string; rows: BotListRow[] };
};

export const message = (text: string, extra: Omit<BotMessage, "text"> = {}): BotMessage => ({
  text,
  ...extra,
});
