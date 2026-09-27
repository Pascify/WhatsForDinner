import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "@/lib/portal/meals";
import { userDoc } from "@/test/page-fixtures";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  catalogFor: vi.fn<() => Promise<CatalogEntry[]>>(),
  redirect: vi.fn((path: string) => {
    void path;
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@/lib/auth/session", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/portal/meals", () => ({ catalogFor: mocks.catalogFor }));
vi.mock("@/app/actions/auth", () => ({ logout: vi.fn() }));
vi.mock("@/app/actions/meals", () => ({ toggleMeal: vi.fn(), createMeal: vi.fn() }));

const MealsPage = (await import("./page")).default;
const { catalogFor, currentUser, redirect } = mocks;

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: "chicken-karahi",
  name: "Chicken Karahi",
  tags: ["chicken", "gravy"],
  own: false,
  hidden: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.mockResolvedValue(userDoc());
  catalogFor.mockResolvedValue([entry()]);
});

const renderPage = async () => render(await MealsPage());
const cardFor = (name: string) => screen.getByText(name).closest("li")!;

describe("meals", () => {
  it("sends a signed-out visitor to the login page", async () => {
    currentUser.mockResolvedValue(undefined);

    await expect(renderPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("counts only the meals still in rotation", async () => {
    catalogFor.mockResolvedValue([
      entry(),
      entry({ id: "beef-nihari", name: "Beef Nihari" }),
      entry({ id: "chow-mein", name: "Chow Mein", hidden: true }),
    ]);

    await renderPage();
    expect(screen.getByRole("heading", { name: "Meals (2 in rotation)" })).toBeInTheDocument();
  });

  it("lists a meal with its tags", async () => {
    await renderPage();

    const card = cardFor("Chicken Karahi");
    expect(within(card).getByText("chicken · gravy")).toBeInTheDocument();
  });

  it("says when a meal has no tags, since rules cannot match it", async () => {
    catalogFor.mockResolvedValue([entry({ tags: [] })]);
    await renderPage();

    expect(screen.getByText("no tags")).toBeInTheDocument();
  });

  it("offers Hide for a visible meal and Bring back for a hidden one", async () => {
    catalogFor.mockResolvedValue([
      entry(),
      entry({ id: "chow-mein", name: "Chow Mein", hidden: true }),
    ]);

    await renderPage();

    expect(within(cardFor("Chicken Karahi")).getByRole("button", { name: "Hide" })).toBeInTheDocument();
    expect(within(cardFor("Chow Mein")).getByRole("button", { name: "Bring back" })).toBeInTheDocument();
  });

  it("submits the opposite of the meal's current state", async () => {
    catalogFor.mockResolvedValue([
      entry(),
      entry({ id: "chow-mein", name: "Chow Mein", hidden: true }),
    ]);

    await renderPage();

    const hiddenValue = (name: string) =>
      cardFor(name).querySelector<HTMLInputElement>("input[name=hidden]")!.value;

    expect(hiddenValue("Chicken Karahi")).toBe("true");
    expect(hiddenValue("Chow Mein")).toBe("false");
  });

  it("marks the meals a user added themselves", async () => {
    catalogFor.mockResolvedValue([entry({ id: "mine", name: "Nihari Night", own: true })]);
    await renderPage();

    expect(within(cardFor("Nihari Night")).getByText("yours")).toBeInTheDocument();
  });

  it("has a form to add a meal with tags", async () => {
    await renderPage();

    expect(screen.getByPlaceholderText("Chicken Karahi")).toBeRequired();
    expect(screen.getByRole("checkbox", { name: "rice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add meal" })).toBeInTheDocument();
    expect(screen.getByText(/picked at random/)).toBeInTheDocument();
  });
});
