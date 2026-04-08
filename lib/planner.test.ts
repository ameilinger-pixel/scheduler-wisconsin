import { describe, expect, it } from "vitest";
import {
  addOneDayIso,
  buildMonthGrid,
  isCheckoutDayOnCalendar,
  isNightInTripRange,
  reservationStaysOnNight,
  reservationsOnDate,
} from "./planner";
import type { ReservationWithSpots } from "./types";

const spot = (id: string, name: string) => ({
  id,
  name,
  capacity: 2,
  sort_order: 1,
  active: true,
});

const res = (partial: Partial<ReservationWithSpots> & Pick<ReservationWithSpots, "id" | "group_name" | "start_date" | "end_date">): ReservationWithSpots => ({
  guest_count: 2,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  spots: [spot("s1", "Room A")],
  ...partial,
});

describe("planner", () => {
  it("addOneDayIso crosses month boundary", () => {
    expect(addOneDayIso("2026-01-31")).toBe("2026-02-01");
  });

  it("reservationStaysOnNight respects checkout-exclusive end", () => {
    const r = res({
      id: "1",
      group_name: "A",
      start_date: "2026-06-10",
      end_date: "2026-06-14",
    });
    expect(reservationStaysOnNight(r, "2026-06-09")).toBe(false);
    expect(reservationStaysOnNight(r, "2026-06-10")).toBe(true);
    expect(reservationStaysOnNight(r, "2026-06-12")).toBe(true);
    expect(reservationStaysOnNight(r, "2026-06-13")).toBe(true);
    expect(reservationStaysOnNight(r, "2026-06-14")).toBe(false);
  });

  it("reservationsOnDate returns multiple overlaps", () => {
    const list: ReservationWithSpots[] = [
      res({ id: "a", group_name: "Smith", start_date: "2026-07-01", end_date: "2026-07-05" }),
      res({ id: "b", group_name: "Jones", start_date: "2026-07-03", end_date: "2026-07-08" }),
    ];
    const july3 = reservationsOnDate("2026-07-03", list);
    expect(july3.map((x) => x.id).sort()).toEqual(["a", "b"]);
    const july4 = reservationsOnDate("2026-07-04", list);
    expect(july4.map((x) => x.id).sort()).toEqual(["a", "b"]);
    const july5 = reservationsOnDate("2026-07-05", list);
    expect(july5.map((x) => x.id)).toEqual(["b"]);
  });

  it("isNightInTripRange uses checkout-exclusive end", () => {
    expect(isNightInTripRange("2026-06-09", "2026-06-10", "2026-06-14")).toBe(false);
    expect(isNightInTripRange("2026-06-10", "2026-06-10", "2026-06-14")).toBe(true);
    expect(isNightInTripRange("2026-06-13", "2026-06-10", "2026-06-14")).toBe(true);
    expect(isNightInTripRange("2026-06-14", "2026-06-10", "2026-06-14")).toBe(false);
  });

  it("isCheckoutDayOnCalendar marks leave day when range has length", () => {
    expect(isCheckoutDayOnCalendar("2026-06-14", "2026-06-10", "2026-06-14")).toBe(true);
    expect(isCheckoutDayOnCalendar("2026-06-13", "2026-06-10", "2026-06-14")).toBe(false);
    expect(isCheckoutDayOnCalendar("2026-06-14", "2026-06-10", "2026-06-10")).toBe(false);
  });

  it("buildMonthGrid has 6 weeks and correct padding for June 2026 (starts Monday)", () => {
    // June 2026: June 1 is Monday (dow 1)
    const grid = buildMonthGrid(2026, 5);
    expect(grid.length).toBe(6);
    expect(grid[0][0]).toBe(null);
    expect(grid[0][1]).toBe("2026-06-01");
    expect(grid[4][2]).toBe("2026-06-30");
    const flat = grid.flat().filter(Boolean);
    expect(flat.length).toBe(30);
  });
});
