/** Template names live in config because they must match what Meta approved. */
export const TEMPLATES = {
  weekly: process.env.WHATSAPP_TEMPLATE_WEEKLY ?? "whatsfordinner_weekly",
  daily: process.env.WHATSAPP_TEMPLATE_DAILY ?? "whatsfordinner_daily",
  ready: process.env.WHATSAPP_TEMPLATE_READY ?? "whatsfordinner_ready",
  language: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en",
} as const;
