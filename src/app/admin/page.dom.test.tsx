import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userDoc } from "@/test/page-fixtures";

const mocks = vi.hoisted(() => {
  const counts = { free: 12, paid: 3, accounts: 5, connected: 4 };
  const budget = { cap: 50, sentThisMonth: 3, killSwitch: false };

  return {
    counts,
    budget,
    currentUser: vi.fn(),
    redirect: vi.fn((path: string) => {
      void path;
      throw new Error(`REDIRECT:${path}`);
    }),
    deliveries: vi.fn(async () => ({
      countDocuments: vi.fn(async (filter: { paid?: boolean }) =>
        filter.paid ? counts.paid : counts.free,
      ),
    })),
    users: vi.fn(async () => ({
      countDocuments: vi.fn(async (filter: Record<string, unknown>) =>
        "phone" in filter ? counts.connected : counts.accounts,
      ),
    })),
    store: { paidBudget: vi.fn(async () => budget) },
  };
});

vi.mock("@/lib/auth/session", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db/collections", () => ({ deliveries: mocks.deliveries, users: mocks.users }));
vi.mock("@/lib/portal/data", () => ({ store: mocks.store }));
vi.mock("@/app/actions/auth", () => ({ logout: vi.fn() }));
vi.mock("@/app/actions/admin", () => ({ saveBudget: vi.fn() }));

const AdminPage = (await import("./page")).default;
const { currentUser, redirect } = mocks;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.budget.killSwitch = false;
  currentUser.mockResolvedValue(userDoc({ role: "admin" }));
});

const renderPage = async () => render(await AdminPage());

describe("admin", () => {
  it("sends a signed-out visitor to the login page", async () => {
    currentUser.mockResolvedValue(undefined);

    await expect(renderPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("turns an ordinary user away from the page", async () => {
    currentUser.mockResolvedValue(userDoc({ role: "user" }));

    await expect(renderPage()).rejects.toThrow("REDIRECT:/");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("shows free and paid counts for the month", async () => {
    await renderPage();

    const summary = screen.getByText("12").closest("p")!;
    expect(summary).toHaveTextContent("12 free · 3 paid");
  });

  it("shows how many accounts exist and how many connected WhatsApp", async () => {
    await renderPage();
    expect(screen.getByText("5 total · 4 with WhatsApp connected")).toBeInTheDocument();
  });

  it("shows the budget as on, with how much is used", async () => {
    await renderPage();
    expect(screen.getByText("on, 3/50 used")).toBeInTheDocument();
  });

  it("shows the budget as off when the kill switch is on", async () => {
    mocks.budget.killSwitch = true;
    await renderPage();

    expect(screen.getByText("off")).toBeInTheDocument();
    expect(screen.queryByText(/used/)).not.toBeInTheDocument();
  });

  it("lets the owner change the cap and explains the fallback", async () => {
    await renderPage();

    expect(screen.getByDisplayValue("50")).toHaveAttribute("name", "cap");
    expect(screen.getByRole("checkbox", { name: /Stop all/ })).not.toBeChecked();
    expect(screen.getByText(/go by email instead/)).toBeInTheDocument();
  });
});
