import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionForm, SubmitButton } from "./ActionForm";

describe("ActionForm", () => {
  it("shows what the action reported", async () => {
    const action = vi.fn(async () => ({ ok: false, message: "Nothing else fits your rules." }));
    render(
      <ActionForm action={action}>
        <input type="hidden" name="date" value="2026-09-23" />
        <SubmitButton label="Swap" pendingLabel="Swapping…" />
      </ActionForm>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Swap" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Nothing else fits your rules.");
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0] as unknown[])[1]).toBeInstanceOf(FormData);
  });

  it("says nothing before the form has run", () => {
    render(
      <ActionForm action={vi.fn()}>
        <SubmitButton label="Add meal" pendingLabel="Adding…" />
      </ActionForm>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
