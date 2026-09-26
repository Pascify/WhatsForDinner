import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, Input, PageHeader, QuietButton } from "./ui";

describe("ui building blocks", () => {
  it("renders a button that can be disabled", () => {
    render(<Button disabled>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
  });

  it("keeps the caller's props and adds its own classes", () => {
    render(<QuietButton type="submit">Swap</QuietButton>);

    const button = screen.getByRole("button", { name: "Swap" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.className).toContain("border");
  });

  it("labels an input so it can be found by its label", () => {
    render(
      <>
        <label htmlFor="email">Email</label>
        <Input id="email" name="email" defaultValue="cook@example.com" />
      </>,
    );

    expect(screen.getByLabelText("Email")).toHaveValue("cook@example.com");
  });

  it("colours a badge by tone", () => {
    const { rerender } = render(<Badge tone="green">open</Badge>);
    expect(screen.getByText("open").className).toContain("emerald");

    rerender(<Badge tone="amber">off</Badge>);
    expect(screen.getByText("off").className).toContain("amber");
  });

  it("puts a heading and an action side by side", () => {
    render(<PageHeader title="Week of 21 Sep" action={<button>Regenerate</button>} />);

    expect(screen.getByRole("heading", { name: "Week of 21 Sep" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("renders whatever it is given inside a card", () => {
    render(
      <Card>
        <p>Connected</p>
      </Card>,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
});
