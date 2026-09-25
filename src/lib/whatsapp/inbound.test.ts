import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhook } from "./inbound";
import { verifySignature, verifySubscription } from "./signature";

const SECRET = "app-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

/** Shaped like a real Cloud API delivery. */
const envelope = (value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba", changes: [{ field: "messages", value }] }],
});

describe("verifySignature", () => {
  const body = JSON.stringify(envelope({ messages: [] }));

  it("accepts a correctly signed body", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and junk headers", () => {
    expect(verifySignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifySignature(body, sign(body), "other-secret")).toBe(false);
    expect(verifySignature(body, "sha256=zzzz", SECRET)).toBe(false);
    expect(verifySignature(body, "nonsense", SECRET)).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
  });
});

describe("verifySubscription", () => {
  it("echoes the challenge when the token matches", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "secret-token",
      "hub.challenge": "1158201444",
    });
    expect(verifySubscription(params, "secret-token")).toEqual({ ok: true, challenge: "1158201444" });
  });

  it("refuses a wrong token or a missing challenge", () => {
    const wrong = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "guess",
      "hub.challenge": "123",
    });
    expect(verifySubscription(wrong, "secret-token")).toEqual({ ok: false });
    expect(verifySubscription(new URLSearchParams(), "secret-token")).toEqual({ ok: false });
  });
});

describe("parseWebhook", () => {
  it("reads a typed text message", () => {
    const events = parseWebhook(
      envelope({
        messaging_product: "whatsapp",
        messages: [
          {
            id: "wamid.1",
            from: "923001234567",
            timestamp: "1790000000",
            type: "text",
            text: { body: "plan" },
          },
        ],
      }),
    );

    expect(events).toEqual([
      {
        type: "message",
        messageId: "wamid.1",
        from: "923001234567",
        at: new Date(1790000000 * 1000),
        text: "plan",
        replyId: undefined,
      },
    ]);
  });

  it("reads a tapped button and keeps its id", () => {
    const [event] = parseWebhook(
      envelope({
        messages: [
          {
            id: "wamid.2",
            from: "923001234567",
            timestamp: "1790000100",
            type: "interactive",
            interactive: {
              type: "button_reply",
              button_reply: { id: "diet_veg", title: "Vegetarian" },
            },
          },
        ],
      }),
    );

    expect(event).toMatchObject({ type: "message", replyId: "diet_veg", text: "Vegetarian" });
  });

  it("reads a tapped list row", () => {
    const [event] = parseWebhook(
      envelope({
        messages: [
          {
            id: "wamid.3",
            from: "923001234567",
            timestamp: "1790000200",
            type: "interactive",
            interactive: { type: "list_reply", list_reply: { id: "weekday_5", title: "Friday" } },
          },
        ],
      }),
    );

    expect(event).toMatchObject({ replyId: "weekday_5", text: "Friday" });
  });

  it("reads a template quick-reply button", () => {
    const [event] = parseWebhook(
      envelope({
        messages: [
          {
            id: "wamid.4",
            from: "923001234567",
            timestamp: "1790000300",
            type: "button",
            button: { text: "Show my plan", payload: "show_plan" },
          },
        ],
      }),
    );

    expect(event).toMatchObject({ replyId: "show_plan", text: "Show my plan" });
  });

  it("reads delivery statuses, including whether Meta billed us", () => {
    const events = parseWebhook(
      envelope({
        statuses: [
          {
            id: "wamid.out1",
            status: "delivered",
            timestamp: "1790000400",
            pricing: { billable: false },
          },
          {
            id: "wamid.out2",
            status: "failed",
            timestamp: "1790000500",
            errors: [{ title: "Re-engagement message", message: "Window closed" }],
          },
        ],
      }),
    );

    expect(events[0]).toMatchObject({ type: "status", status: "delivered", billable: false });
    expect(events[1]).toMatchObject({ type: "status", status: "failed", error: "Window closed" });
  });

  it("handles several events in one delivery and ignores unknown payloads", () => {
    const many = parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "a", from: "1", timestamp: "1790000000", type: "text", text: { body: "hi" } }],
                statuses: [{ id: "b", status: "sent", timestamp: "1790000000" }],
              },
            },
          ],
        },
      ],
    });
    expect(many).toHaveLength(2);

    expect(parseWebhook({})).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: [{ changes: [{ field: "other" }] }] })).toEqual([]);
  });
});
