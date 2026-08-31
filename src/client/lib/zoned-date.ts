/**
 * Calendar arithmetic in the user's configured timezone.
 *
 * The homepage's idea of "today" used to come from the device clock while
 * Settings offered a timezone that nothing read. These helpers give the setting
 * something to do, and fall back to the device zone whenever the configured one
 * is missing or unrecognised, so a bad value can never blank the calendar.
 */

export type YMD = { y: number; m: number; d: number };

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    fmt = formatterFor(deviceTimeZone());
  }
  formatterCache.set(timeZone, fmt);
  return fmt;
}

type Parts = YMD & { hour: number; minute: number; second: number };

function partsInZone(instant: Date, timeZone: string): Parts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const pick = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return {
    y: pick("year"),
    m: pick("month"),
    d: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** The calendar date `instant` falls on, as seen in `timeZone`. */
export function zonedYMD(instant: Date, timeZone: string): YMD {
  const { y, m, d } = partsInZone(instant, timeZone);
  return { y, m, d };
}

/** The instant at which the local day containing `instant` began in `timeZone`. */
export function startOfDayInZone(instant: Date, timeZone: string): Date {
  const { hour, minute, second } = partsInZone(instant, timeZone);
  const elapsedMs =
    hour * 3_600_000 + minute * 60_000 + second * 1000 + instant.getMilliseconds();
  return new Date(instant.getTime() - elapsedMs);
}
