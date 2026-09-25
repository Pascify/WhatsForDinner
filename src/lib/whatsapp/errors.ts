/** Meta error codes worth handling by name rather than by number. */
export const WHATSAPP_ERRORS: Record<number, { message: string; retryable: boolean }> = {
  131030: {
    message: "This number is not on the test number's allowed list in the Meta dashboard.",
    retryable: false,
  },
  131047: {
    message: "The free 24-hour window has closed, so only a template can be delivered.",
    retryable: false,
  },
  131026: { message: "This number cannot receive WhatsApp messages.", retryable: false },
  132001: { message: "That template does not exist or is not approved yet.", retryable: false },
  132000: { message: "The template was sent the wrong number of variables.", retryable: false },
  132018: {
    message: "A template variable contained a line break or too many spaces.",
    retryable: false,
  },
  190: { message: "The access token is invalid or expired.", retryable: false },
  4: { message: "Meta rate limit reached.", retryable: true },
  80007: { message: "Meta rate limit reached.", retryable: true },
  131056: { message: "Too many messages to this number just now.", retryable: true },
  500: { message: "Meta had a temporary server error.", retryable: true },
};

export function describeError(code: number | undefined, fallback: string) {
  const known = code === undefined ? undefined : WHATSAPP_ERRORS[code];
  return {
    error: known?.message ?? fallback,
    retryable: known?.retryable ?? false,
    code,
  };
}
