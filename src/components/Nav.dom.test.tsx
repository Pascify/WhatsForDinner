import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Nav } from "./Nav";

vi.mock("@/app/actions/auth", () => ({ logout: vi.fn() }));

describe("Nav", () => {
  it("links to the pages every user has", () => {
    render(<Nav />);

    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute(
      "href",
      "/preferences",
    );
    expect(screen.getByRole("link", { name: "Meals" })).toHaveAttribute("href", "/meals");
  });

  it("hides admin from everyone but the owner", () => {
    const { rerender } = render(<Nav />);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();

    rerender(<Nav isAdmin />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("offers a way out", () => {
    render(<Nav />);
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});
