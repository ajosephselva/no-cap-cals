export const DEFAULT_TZ = "America/Los_Angeles";

export function safeTimeZone(tz: string | undefined) {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

function offsetAt(timeZone: string, at: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return localAsUtc - Math.floor(at / 1000) * 1000;
}

export function startOfToday(timeZone: string, now = new Date()) {
  return startOfDay(timeZone, dayKey(timeZone, now));
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string | undefined): value is string {
  return !!value && DAY_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export function dayKey(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftDay(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function startOfDay(timeZone: string, key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  let t = midnightUtc - offsetAt(timeZone, midnightUtc + 12 * 3600 * 1000);
  t = midnightUtc - offsetAt(timeZone, t);
  return new Date(t);
}

export function dayLabel(key: string, todayKey: string) {
  if (key === todayKey) return "Today";
  if (key === shiftDay(todayKey, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
