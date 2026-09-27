import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userDoc } from "@/test/page-fixtures";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    void path;
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/auth/session", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/actions/auth", () => ({ logout: vi.fn() }));
vi.mock("@/app/actions/preferences", () => ({
  saveDelivery: vi.fn(),
  addRule: vi.fn(),
  removeRule: vi.fn(),
}));

const PreferencesPage = (await import("./page")).default;
const { currentUser, redirect } = mocks;

beforeEach(() => {
  vi.clearAllMocks();
});

const renderPage = async () => render(await PreferencesPage());
const checked = (name: string) =>
  screen.getAllByRole("radio", { name: new RegExp(name) }).find((input) => (input as HTMLInputElement).checked);

describe("preferences", () => {
  it("sends a signed-out visitor to the login page", async () => {
    currentUser.mockResolvedValue(undefined);

    await expect(renderPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("shows the saved delivery settings", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    expect(checked("Automatically")).toBeDefined();
    expect(checked("The week's plan")).toBeDefined();
    expect(checked("Email me")).toBeDefined();
    expect(screen.getByDisplayValue("18")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Asia/Karachi" })).toBeInTheDocument();
  });

  it("selects both when weekly and daily are on", async () => {
    const doc = userDoc();
    doc.delivery.daily.enabled = true;
    currentUser.mockResolvedValue(doc);

    await renderPage();
    expect(checked("Both")).toBeDefined();
  });

  it("says which fallback costs money and which do not", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    const paid = screen.getByRole("radio", { name: /Send on WhatsApp anyway/ }).closest("label");
    expect(within(paid!).getByText("(Costs money each time)")).toBeInTheDocument();

    const email = screen.getByRole("radio", { name: /Email me/ }).closest("label");
    expect(within(email!).getByText("(Free)")).toBeInTheDocument();
  });

  it("says there are no rules yet", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    expect(screen.getByText("No rules yet.")).toBeInTheDocument();
  });

  it("describes every kind of rule in plain words", async () => {
    currentUser.mockResolvedValue(
      userDoc({
        rules: [
          { kind: "always", tags: ["halal"] },
          { kind: "never", tags: ["beef", "fish"] },
          { kind: "day", day: 5, tags: ["rice", "chicken"] },
          { kind: "quota", tags: ["pasta"], max: 1 },
          { kind: "quota", tags: ["healthy"], min: 3 },
        ],
      }),
    );

    await renderPage();

    expect(screen.getByText("Always halal")).toBeInTheDocument();
    expect(screen.getByText("Never beef + fish")).toBeInTheDocument();
    expect(screen.getByText("Friday: rice + chicken")).toBeInTheDocument();
    expect(screen.getByText("At most 1 pasta a week")).toBeInTheDocument();
    expect(screen.getByText("At least 3 healthy a week")).toBeInTheDocument();
  });

  it("gives every rule its own remove button, with its position", async () => {
    currentUser.mockResolvedValue(
      userDoc({
        rules: [
          { kind: "always", tags: ["halal"] },
          { kind: "never", tags: ["beef"] },
        ],
      }),
    );

    await renderPage();

    const removes = screen.getAllByRole("button", { name: "Remove" });
    expect(removes).toHaveLength(2);

    const positions = removes.map(
      (button) => button.closest("form")!.querySelector<HTMLInputElement>("input[name=index]")!.value,
    );
    expect(positions).toEqual(["0", "1"]);
  });

  it("offers tags to build a rule from", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    expect(screen.getByRole("checkbox", { name: "chicken" })).toHaveAttribute("value", "chicken");
    expect(screen.getByRole("checkbox", { name: "halal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add rule" })).toBeInTheDocument();
  });

  it("explains which rules bend", async () => {
    currentUser.mockResolvedValue(userDoc());
    await renderPage();

    expect(screen.getByText(/never broken/)).toBeInTheDocument();
  });
});
