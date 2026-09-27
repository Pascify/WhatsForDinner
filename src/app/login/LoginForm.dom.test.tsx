import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginState } from "@/app/actions/auth";

const sendLoginCode = vi.fn<(prev: LoginState, form: FormData) => Promise<LoginState>>();
const submitLoginCode = vi.fn<(prev: LoginState, form: FormData) => Promise<LoginState>>();

vi.mock("@/app/actions/auth", () => ({ sendLoginCode, submitLoginCode }));

const { LoginForm } = await import("./LoginForm");

beforeEach(() => {
  sendLoginCode.mockReset();
  submitLoginCode.mockReset();
});

const typeEmail = async (address: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), address);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  return user;
};

describe("LoginForm", () => {
  it("asks for an email first and says no password is needed", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByText(/No password/)).toBeInTheDocument();
  });

  it("sends the typed address to the action", async () => {
    sendLoginCode.mockResolvedValue({ step: "code", email: "cook@example.com" });
    render(<LoginForm />);

    await typeEmail("cook@example.com");

    const form = sendLoginCode.mock.calls[0][1];
    expect(form.get("email")).toBe("cook@example.com");
  });

  it("moves on to the code step once a code has been sent", async () => {
    sendLoginCode.mockResolvedValue({ step: "code", email: "cook@example.com" });
    render(<LoginForm />);

    await typeEmail("cook@example.com");

    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
    expect(screen.getByText("cook@example.com")).toBeInTheDocument();
    expect(screen.getByText(/creates your account/)).toBeInTheDocument();
  });

  it("stays put and shows why when the address is rejected", async () => {
    sendLoginCode.mockResolvedValue({
      step: "email",
      email: "nope",
      error: "That doesn't look like an email address.",
    });
    render(<LoginForm />);

    await typeEmail("nope@example");

    expect(await screen.findByText("That doesn't look like an email address.")).toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });

  it("sends the code, the email and the browser's timezone", async () => {
    sendLoginCode.mockResolvedValue({ step: "code", email: "cook@example.com" });
    submitLoginCode.mockResolvedValue({ step: "code", email: "cook@example.com" });
    render(<LoginForm />);

    const user = await typeEmail("cook@example.com");
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const form = submitLoginCode.mock.calls[0][1];
    expect(form.get("code")).toBe("123456");
    expect(form.get("email")).toBe("cook@example.com");
    expect(form.get("timezone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("shows a wrong code without losing the step", async () => {
    sendLoginCode.mockResolvedValue({ step: "code", email: "cook@example.com" });
    submitLoginCode.mockResolvedValue({
      step: "code",
      email: "cook@example.com",
      error: "That code isn't right.",
    });
    render(<LoginForm />);

    const user = await typeEmail("cook@example.com");
    await user.type(await screen.findByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("That code isn't right.")).toBeInTheDocument();
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
  });

  it("asks the browser to fill a one-time code", async () => {
    sendLoginCode.mockResolvedValue({ step: "code", email: "cook@example.com" });
    render(<LoginForm />);

    await typeEmail("cook@example.com");

    const input = await screen.findByLabelText("6-digit code");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "6");
  });
});
