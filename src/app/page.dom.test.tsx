import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryBotStore } from "@/lib/bot/memory-store";
import { userDoc } from "@/test/page-fixtures";

/** Hoisted so the module mocks below can close over them. */
const mocks = vi.hoisted(() => ({
  holder: { current: undefined as unknown as Record<string, unknown> },
  currentUser: vi.fn(),
  issueConnectCode: vi.fn(async () => "WFD-7Q4K"),
  redirect: vi.fn((path: string) => {
    void path;
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/auth/session", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/actions/plan", () => ({ swapDay: vi.fn(), regenerateWeek: vi.fn() }));
vi.mock("@/app/actions/auth", () => ({ logout: vi.fn() }));
vi.mock("@/lib/portal/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal/data")>();
  // Forwards to whichever store the current test set up.
  const store = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        const current = mocks.holder.current;
        const value = current[property];
        return typeof value === "function" ? value.bind(current) : value;
      },
    },
  );
  return { ...actual, store, issueConnectCode: mocks.issueConnectCode };
});

const DashboardPage = (await import("./page")).default;
const { currentUser, issueConnectCode, redirect } = mocks;

beforeAll(() => {
  process.env.CODE_PEPPER = "test-pepper";
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.holder.current = new MemoryBotStore() as unknown as Record<string, unknown>;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Renders the page the way Next does: await the server component, then render what it returns. */
const renderPage = async () => render(await DashboardPage());

describe("dashboard", () => {
  it("sends a signed-out visitor to the login page", async () => {
    currentUser.mockResolvedValue(undefined);

    await expect(renderPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("shows the week with a meal on every day", async () => {
    currentUser.mockResolvedValue(userDoc());

    await renderPage();

    expect(screen.getByRole("heading", { name: /Week of \d+ Sep/ })).toBeInTheDocument();
    const days = screen.getAllByRole("listitem");
    expect(days).toHaveLength(7);

    for (const day of days) {
      expect(within(day).getByRole("button", { name: "Swap" })).toBeInTheDocument();
    }
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
  });

  it("marks today", async () => {
    currentUser.mockResolvedValue(userDoc());

    await renderPage();
    expect(screen.getByText("today")).toBeInTheDocument();
  });

  it("offers a way to rebuild the week", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("asks an unconnected account to send a code, and never shows one to a connected account", async () => {
    currentUser.mockResolvedValue(userDoc({ phone: undefined }));
    await renderPage();

    expect(screen.getByRole("heading", { name: "Connect WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect WFD-7Q4K/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Connect WFD-7Q4K/ })).toHaveAttribute(
      "href",
      expect.stringContaining("Connect%20WFD-7Q4K"),
    );
  });

  it("shows the free window as open when the user messaged recently", async () => {
    currentUser.mockResolvedValue(userDoc({ lastInboundAt: new Date("2026-09-23T05:00:00Z") }));

    await renderPage();

    expect(screen.getByText("14h left")).toBeInTheDocument();
    expect(screen.getByText(/costs nothing/)).toBeInTheDocument();
    expect(issueConnectCode).not.toHaveBeenCalled();
  });

  it("shows the window as closed when they have not", async () => {
    currentUser.mockResolvedValue(userDoc({ lastInboundAt: new Date("2026-09-20T05:00:00Z") }));

    await renderPage();

    expect(screen.getByText("closed")).toBeInTheDocument();
    expect(screen.getByText(/fall back to your chosen option/)).toBeInTheDocument();
  });

  it("summarises how plans are delivered", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    expect(screen.getByText("Weekly plan")).toBeInTheDocument();
    expect(screen.getByText("Email it to you")).toBeInTheDocument();
    expect(screen.getByText("Asia/Karachi")).toBeInTheDocument();
  });

  it("says plainly when someone is on the paid option", async () => {
    const doc = userDoc();
    doc.delivery.whenClosed = "whatsapp";
    currentUser.mockResolvedValue(doc);

    await renderPage();
    expect(screen.getByText("Send on WhatsApp anyway (paid)")).toBeInTheDocument();
  });

  it("keeps the admin link away from ordinary users", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();

    currentUser.mockResolvedValue(userDoc({ role: "admin" }));
    await renderPage();
    expect(screen.getAllByRole("link", { name: "Admin" })).toHaveLength(1);
  });
});
