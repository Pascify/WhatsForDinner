import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, startMongo } from "@/test/mongo";
import { MongoBotStore } from "@/lib/bot/mongo-store";
import { ensureIndexes, users } from "@/lib/db/collections";
import { FakeEmailSender } from "@/lib/email/fake";
import { consumeLoginLink, issueConnectCode, requestLoginCode, verifyLoginCode } from "./data";

let mongo: Awaited<ReturnType<typeof startMongo>>;
let email: FakeEmailSender;
const store = new MongoBotStore();

beforeAll(async () => {
  mongo = await startMongo();
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

beforeEach(async () => {
  await clearCollections();
  email = new FakeEmailSender();
});

const codeFor = async (address: string, now = new Date()) => {
  await requestLoginCode(address, email, now);
  return email.lastCode()!;
};

describe("portal login", () => {
  it("refuses an address that is not an email, without sending anything", async () => {
    const result = await requestLoginCode("not-an-email", email);

    expect(result).toMatchObject({ ok: false });
    expect(email.sent).toHaveLength(0);
  });

  it("emails a six-digit code", async () => {
    const result = await requestLoginCode("Cook@Example.com ", email);

    expect(result).toEqual({ ok: true });
    expect(email.sent[0].to).toBe("cook@example.com");
    expect(email.lastCode()).toMatch(/^\d{6}$/);
  });

  it("holds a second request back for a minute", async () => {
    await requestLoginCode("cook@example.com", email);
    const again = await requestLoginCode("cook@example.com", email);

    expect(again).toMatchObject({ ok: false });
    expect(email.sent).toHaveLength(1);
  });

  it("creates the account on the first verified code", async () => {
    const code = await codeFor("cook@example.com");

    const result = await verifyLoginCode("cook@example.com", code, "America/Toronto");
    expect(result).toMatchObject({ ok: true });

    const created = await (await users()).findOne({ email: "cook@example.com" });
    expect(created).toMatchObject({ status: "active", role: "user", timezone: "America/Toronto" });
    expect(created!.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("logs an existing account in rather than making a second one", async () => {
    const first = await verifyLoginCode("cook@example.com", await codeFor("cook@example.com"));

    email.reset();
    const later = new Date(Date.now() + 120_000); // past the resend cooldown
    const second = await verifyLoginCode("cook@example.com", await codeFor("cook@example.com", later));

    expect(second).toEqual(first);
    expect(await (await users()).countDocuments({ email: "cook@example.com" })).toBe(1);
  });

  it("rejects the wrong code and does not create an account", async () => {
    await codeFor("cook@example.com");

    expect(await verifyLoginCode("cook@example.com", "000000")).toMatchObject({ ok: false });
    expect(await (await users()).countDocuments({})).toBe(0);
  });

  it("will not accept the same code twice", async () => {
    const code = await codeFor("cook@example.com");

    expect(await verifyLoginCode("cook@example.com", code)).toMatchObject({ ok: true });
    expect(await verifyLoginCode("cook@example.com", code)).toMatchObject({ ok: false });
  });

  it("tells someone with no code at all to ask for one", async () => {
    expect(await verifyLoginCode("stranger@example.com", "123456")).toMatchObject({
      ok: false,
      error: expect.stringContaining("new code"),
    });
  });
});

describe("links sent over WhatsApp", () => {
  it("logs a user in once, then the link is dead", async () => {
    const user = await store.createUser({ channel: "portal" });
    const code = (await store.issueLoginLink(user.id)).split("/").at(-1)!;

    expect(await consumeLoginLink(code)).toBe(user.id);
    expect(await consumeLoginLink(code)).toBeUndefined();
  });

  it("issues a connect code the bot can claim", async () => {
    const user = await store.createUser({ channel: "portal" });
    const code = await issueConnectCode(user.id);

    expect(code).toMatch(/^WFD-[A-HJ-NP-Z2-9]{4}$/);
    expect(await store.consumeLinkCode(code)).toEqual({
      userId: user.id,
      purpose: "connect_whatsapp",
    });
  });

  it("does not let a connect code be used as a login link", async () => {
    const user = await store.createUser({ channel: "portal" });
    const code = await issueConnectCode(user.id);

    expect(await consumeLoginLink(code)).toBeUndefined();
  });
});
