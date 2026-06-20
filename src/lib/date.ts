/**
 * Date helpers. Mietwerk stores all timestamps in UTC and renders them in the
 * `Europe/Berlin` timezone. Use these helpers at the rendering boundary.
 */

export const APP_TIMEZONE = "Europe/Berlin";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Render a UTC date as a German date string in Europe/Berlin, e.g. "19.06.2026". */
export function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

/** Render a UTC date+time as a German string in Europe/Berlin. */
export function formatDateTime(date: Date): string {
  return DATETIME_FORMATTER.format(date);
}
