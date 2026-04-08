import { hasDateOverlap } from "./conflicts";
import type { ReservationWithSpots } from "./types";

/** Next calendar day as YYYY-MM-DD (local date math for display grid). */
export function addOneDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** True if `nightDate` is an overnight night inside this reservation's range. */
export function reservationStaysOnNight(
  reservation: ReservationWithSpots,
  nightDate: string,
): boolean {
  const nightEnd = addOneDayIso(nightDate);
  return hasDateOverlap(nightDate, nightEnd, reservation.start_date, reservation.end_date);
}

export function reservationsOnDate(
  nightDate: string,
  reservations: ReservationWithSpots[],
): ReservationWithSpots[] {
  return reservations.filter((r) => reservationStaysOnNight(r, nightDate));
}

/** Six rows × seven columns; `null` = padding outside the month. Uses local calendar. */
export function buildMonthGrid(year: number, monthIndex0: number): (string | null)[][] {
  const firstDow = new Date(year, monthIndex0, 1).getDay();
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const cells: (string | null)[] = [];

  for (let i = 0; i < firstDow; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(monthIndex0 + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  while (cells.length < 42) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < 42; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function colorForGroup(name: string): { backgroundColor: string; color: string } {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return {
    backgroundColor: `hsl(${hue} 42% 90%)`,
    color: `hsl(${hue} 40% 22%)`,
  };
}

export function monthLabel(year: number, monthIndex0: number): string {
  return new Date(year, monthIndex0, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Sleep nights for a trip: `[start_date, end_date)` as YYYY-MM-DD strings. */
export function isNightInTripRange(
  nightIso: string,
  startIso: string,
  endIso: string,
): boolean {
  if (!startIso || !endIso) return false;
  return nightIso >= startIso && nightIso < endIso;
}

export function isCheckoutDayOnCalendar(
  dayIso: string,
  startIso: string,
  endIso: string,
): boolean {
  if (!startIso || !endIso) return false;
  return dayIso === endIso && endIso > startIso;
}
