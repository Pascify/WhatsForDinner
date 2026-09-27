import type { Weekday } from "./types";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The calendar date in someone's own timezone, which is what "today" has to mean. */
export function localDateISO(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Hour 0-23 in someone's own timezone, used to decide when their weekly send is due. */
export function localHour(at: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(at),
  );
}

export function weekdayOf(dateISO: string): Weekday {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay() as Weekday;
}

export function addDays(dateISO: string, days: number): string {
  return new Date(Date.parse(`${dateISO}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday (or Sunday) on or before a date, depending on where the user's week starts. */
export function startOfWeek(dateISO: string, weekStartsOn: Weekday = 1): string {
  const shift = (weekdayOf(dateISO) - weekStartsOn + 7) % 7;
  return addDays(dateISO, -shift);
}

export const dayShort = (dateISO: string) => DAY_SHORT[weekdayOf(dateISO)];
export const dayLong = (dateISO: string) => DAY_LONG[weekdayOf(dateISO)];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "21 Sep". Written out by hand rather than through Intl, whose short month names differ
 * between locales and ICU versions ("Sept" in en-GB), and these strings go into approved
 * WhatsApp templates.
 */
export function shortDate(dateISO: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  void year;
  return `${day} ${MONTHS[month - 1]}`;
}
