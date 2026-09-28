import type { OutboundMessage } from "./types";

/** Cloud API caps: 3 buttons, 10 list rows, 20 characters per button title. */
export const MAX_BUTTONS = 3;
export const MAX_LIST_ROWS = 10;
const MAX_TITLE = 20;

const clip = (value: string, limit = MAX_TITLE) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

/**
 * Template parameters may not contain newlines, tabs or four consecutive spaces, and Meta
 * rejects the whole message if one does. Meal names are user-editable, so clean them here.
 */
export function cleanTemplateVariable(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim();
}

export function buildPayload(message: OutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: message.to };

  if (message.kind === "template") {
    return {
      ...base,
      type: "template",
      template: {
        name: message.template.name,
        language: { code: message.template.language },
        components: [
          {
            type: "body",
            parameters: message.template.variables.map((value) => ({
              type: "text",
              text: cleanTemplateVariable(value),
            })),
          },
        ],
      },
    };
  }

  if (message.buttons?.length) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: message.text },
        action: {
          buttons: message.buttons.slice(0, MAX_BUTTONS).map((button) => ({
            type: "reply",
            reply: { id: button.id, title: clip(button.title) },
          })),
        },
      },
    };
  }

  if (message.list?.rows.length) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: message.text },
        action: {
          button: clip(message.list.button),
          sections: [
            {
              title: "Options",
              rows: message.list.rows.slice(0, MAX_LIST_ROWS).map((row) => ({
                id: row.id,
                title: clip(row.title, 24),
                ...(row.description ? { description: clip(row.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    };
  }

  return { ...base, type: "text", text: { preview_url: false, body: message.text } };
}
