import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudApiClient } from "./client";
import { FakeWhatsAppClient } from "./fake";
import { buildPayload, cleanTemplateVariable } from "./payload";
import type { OutboundMessage } from "./types";

const to = "923001234567";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("buildPayload", () => {
  it("builds a plain text message", () => {
    expect(buildPayload({ kind: "text", to, text: "Tonight: Chicken Karahi" })).toMatchObject({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: "Tonight: Chicken Karahi", preview_url: false },
    });
  });

  it("builds reply buttons and trims long titles", () => {
    const payload = buildPayload({
      kind: "text",
      to,
      text: "This week's plan",
      buttons: [
        { id: "ok", title: "Looks good 👍" },
        { id: "swap", title: "Swap a meal" },
        { id: "x", title: "A very very long button title" },
      ],
    }) as { interactive: { action: { buttons: { reply: { title: string } }[] } } };

    const titles = payload.interactive.action.buttons.map((button) => button.reply.title);
    expect(titles[0]).toBe("Looks good 👍");
    expect(titles[2].length).toBeLessThanOrEqual(20);
  });

  it("keeps at most three buttons and ten list rows", () => {
    const buttons = buildPayload({
      kind: "text",
      to,
      text: "x",
      buttons: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, title: `b${i}` })),
    }) as { interactive: { action: { buttons: unknown[] } } };
    expect(buttons.interactive.action.buttons).toHaveLength(3);

    const list = buildPayload({
      kind: "text",
      to,
      text: "Pick a day",
      list: {
        button: "Choose",
        rows: Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` })),
      },
    }) as { interactive: { action: { sections: { rows: unknown[] }[] } } };
    expect(list.interactive.action.sections[0].rows).toHaveLength(10);
  });

  it("strips line breaks from template variables, which Meta rejects", () => {
    expect(cleanTemplateVariable("Chicken\nKarahi")).toBe("Chicken Karahi");
    expect(cleanTemplateVariable("Daal     Chawal")).toBe("Daal   Chawal");

    const payload = buildPayload({
      kind: "template",
      to,
      template: { name: "whatsfordinner_weekly", language: "en", variables: ["21 Sep", "A\nB"] },
    }) as { template: { components: { parameters: { text: string }[] }[] } };

    expect(payload.template.components[0].parameters[1].text).toBe("A B");
  });
});

describe("CloudApiClient", () => {
  const client = new CloudApiClient({ token: "t", phoneNumberId: "123" });
  const message: OutboundMessage = { kind: "text", to, text: "hi" };

  it("returns the message id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ messages: [{ id: "wamid.abc" }] })),
    );
    await expect(client.send(message)).resolves.toEqual({ ok: true, messageId: "wamid.abc" });
  });

  it("calls the right endpoint with the token", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ messages: [{ id: "wamid.abc" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await client.send(message);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/123/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("explains a number that is not on the test allow list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: 131030, message: "raw" } }, 400)),
    );
    await expect(client.send(message)).resolves.toMatchObject({
      ok: false,
      code: 131030,
      retryable: false,
      error: expect.stringContaining("allowed list"),
    });
  });

  it("marks rate limits and server errors as worth retrying", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: 4 } }, 400)),
    );
    await expect(client.send(message)).resolves.toMatchObject({ retryable: true });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, 503)),
    );
    await expect(client.send(message)).resolves.toMatchObject({ retryable: true });
  });

  it("treats a network failure as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(client.send(message)).resolves.toMatchObject({ ok: false, retryable: true });
  });
});

describe("FakeWhatsAppClient", () => {
  it("records sends and hands back fake ids", async () => {
    const fake = new FakeWhatsAppClient();
    await fake.send({ kind: "text", to, text: "one" });
    await fake.send({ kind: "text", to, text: "two" });

    expect(fake.texts()).toEqual(["one", "two"]);
    expect(fake.lastMessage).toMatchObject({ text: "two" });
  });

  it("can be told to fail once", async () => {
    const fake = new FakeWhatsAppClient();
    fake.failNext({ ok: false, error: "nope", retryable: false });

    await expect(fake.send({ kind: "text", to, text: "one" })).resolves.toMatchObject({
      ok: false,
    });
    await expect(fake.send({ kind: "text", to, text: "two" })).resolves.toMatchObject({ ok: true });
    expect(fake.texts()).toEqual(["two"]);
  });
});
