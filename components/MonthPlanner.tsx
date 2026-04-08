"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addOneDayIso,
  buildMonthGrid,
  colorForGroup,
  isCheckoutDayOnCalendar,
  isNightInTripRange,
  monthLabel,
  reservationsOnDate,
} from "@/lib/planner";
import type { ReservationWithSpots } from "@/lib/types";

function roomsLine(r: ReservationWithSpots): string {
  return r.spots.map((s) => s.name).join(", ");
}

/** Shorter line for dense cells; full string stays in title/tooltip. */
function roomsLineShort(r: ReservationWithSpots, maxLen = 32): string {
  const s = roomsLine(r);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function todayIsoLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type MonthPlannerProps = {
  reservations: ReservationWithSpots[];
  /** No booking interactions; chips are text only. */
  readOnly?: boolean;
  /** Pick first night then checkout day; mutually exclusive with onSelectDay. */
  rangeSelection?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  /** Click and drag across days; first/last day define first night and checkout. */
  onRangeSelect?: (range: { startDate: string; endDate: string }) => void;
  /** @deprecated Prefer onRangeSelect (drag). */
  onRangeDayClick?: (isoDate: string) => void;
  /** Quick add: one tap sets start + next day and scrolls (main planner). */
  onSelectDay?: (isoDate: string) => void;
  onSelectReservation?: (id: string) => void;
  /** Section title override (e.g. "Pick your dates"). */
  heading?: string;
  compact?: boolean;
};

export function MonthPlanner({
  reservations,
  readOnly = false,
  rangeSelection = false,
  rangeStart = "",
  rangeEnd = "",
  onRangeSelect,
  onRangeDayClick,
  onSelectDay,
  onSelectReservation,
  heading,
  compact = false,
}: MonthPlannerProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(now.getMonth());
  const [dragSession, setDragSession] = useState<{ anchor: string; hover: string } | null>(null);
  const dragAnchorRef = useRef("");
  const dragHoverRef = useRef("");

  const grid = useMemo(() => buildMonthGrid(year, monthIndex0), [year, monthIndex0]);
  const today = todayIsoLocal();

  /** Last cell in the drag = last night you sleep; checkout is the next calendar day (exclusive end). */
  const normalizeDragRange = useCallback((anchor: string, hover: string) => {
    if (anchor === hover) {
      return { startDate: anchor, endDate: addOneDayIso(anchor) };
    }
    const lo = anchor < hover ? anchor : hover;
    const hi = anchor < hover ? hover : anchor;
    return { startDate: lo, endDate: addOneDayIso(hi) };
  }, []);

  const { previewStart, previewEnd } = useMemo(() => {
    if (dragSession) {
      const r = normalizeDragRange(dragSession.anchor, dragSession.hover);
      return { previewStart: r.startDate, previewEnd: r.endDate };
    }
    return { previewStart: rangeStart, previewEnd: rangeEnd };
  }, [dragSession, rangeStart, rangeEnd, normalizeDragRange]);

  const handleRangePointerDown = useCallback(
    (e: React.PointerEvent, iso: string) => {
      if (!onRangeSelect || readOnly) return;
      if (e.button !== 0) return;
      e.preventDefault();
      document.body.style.userSelect = "none";
      dragAnchorRef.current = iso;
      dragHoverRef.current = iso;
      setDragSession({ anchor: iso, hover: iso });

      const onMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = el?.closest("[data-planner-day]");
        const next = cell?.getAttribute("data-planner-day");
        if (next && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
          dragHoverRef.current = next;
          setDragSession({ anchor: dragAnchorRef.current, hover: next });
        }
      };

      const endDrag = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", endDrag);
        document.removeEventListener("pointercancel", endDrag);
        document.body.style.userSelect = "";
        const range = normalizeDragRange(dragAnchorRef.current, dragHoverRef.current);
        onRangeSelect(range);
        setDragSession(null);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", endDrag);
      document.addEventListener("pointercancel", endDrag);
    },
    [onRangeSelect, readOnly, normalizeDragRange],
  );

  const defaultHeading = monthLabel(year, monthIndex0);
  const titleText = heading ?? defaultHeading;

  function goPrev() {
    if (monthIndex0 === 0) {
      setYear((y) => y - 1);
      setMonthIndex0(11);
    } else {
      setMonthIndex0((m) => m - 1);
    }
  }

  function goNext() {
    if (monthIndex0 === 11) {
      setYear((y) => y + 1);
      setMonthIndex0(0);
    } else {
      setMonthIndex0((m) => m + 1);
    }
  }

  function goToday() {
    const n = new Date();
    setYear(n.getFullYear());
    setMonthIndex0(n.getMonth());
  }

  const helperText = readOnly
    ? "Enter the family code below to add or change trips."
    : rangeSelection
      ? onRangeSelect
        ? "Drag your nights; rooms show under each name. Amber = your draft."
        : "Tap your first night, then tap the day you leave (checkout). Your nights highlight in amber."
      : "Tap a day for a quick one-night start, or use the form below for exact dates. Tap a name to edit.";

  function handleDayClick(iso: string) {
    if (readOnly) return;
    if (rangeSelection && onRangeDayClick && !onRangeSelect) {
      onRangeDayClick(iso);
      return;
    }
    if (onSelectDay) {
      onSelectDay(iso);
    }
  }

  return (
    <section
      id={compact ? undefined : "month-planner"}
      aria-labelledby="month-planner-heading"
      className={`scroll-mt-28 rounded-2xl border border-stone-200/90 bg-white shadow-md ring-1 ring-stone-200/80 ${compact ? "mb-4 p-3 sm:p-4" : "mb-10 p-4 sm:p-5"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2
          id="month-planner-heading"
          className="text-lg font-bold text-stone-900 lg:text-xl"
        >
          {titleText}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="min-h-[44px] rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 sm:min-h-0"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={goToday}
            className="min-h-[44px] rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-100 sm:min-h-0"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="min-h-[44px] rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 sm:min-h-0"
          >
            Next
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-600">{helperText}</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-teal-800 outline-none hover:text-teal-950 focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-teal-600/50 focus-visible:ring-offset-2">
          What do the colors mean?
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-stone-600">
          <li>
            <span className="font-medium text-stone-700">Teal tint:</span> at least one family is booked that night
            (name + rooms on two lines).
          </li>
          <li>
            <span className="font-medium text-stone-700">Amber:</span> nights you&apos;re selecting before you save
            (only when adding or changing a trip).
          </li>
          <li>
            <span className="font-medium text-stone-700">Thick amber edge:</span> checkout morning — you don&apos;t
            sleep there that night.
          </li>
          <li>
            <span className="font-medium text-stone-700">Teal ring on the date number:</span> today.
          </li>
        </ul>
      </details>

      <div className="mt-4 overflow-x-auto planner-scroll">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 gap-px rounded-lg bg-stone-200 text-center text-xs font-medium text-stone-600">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-stone-100 py-2">
                {d}
              </div>
            ))}
          </div>
          <div
            className={`grid grid-cols-7 gap-px rounded-b-lg border border-t-0 border-stone-200 bg-stone-200 ${
              rangeSelection && onRangeSelect ? "touch-none select-none" : ""
            }`}
          >
            {grid.flat().map((iso, idx) => {
              if (!iso) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className={`bg-stone-50/80 ${compact ? "min-h-[5rem]" : "min-h-[6.5rem]"}`}
                    aria-hidden
                  />
                );
              }
              const dayRes = reservationsOnDate(iso, reservations);
              const isTodayCell = iso === today;
              const title = dayRes.length
                ? dayRes
                    .map((r) => {
                      const rooms = roomsLine(r);
                      return rooms
                        ? `${r.group_name} — ${rooms} (${r.guest_count}p)`
                        : `${r.group_name} (${r.guest_count}p)`;
                    })
                    .join(" · ")
                : "Open";

              const inDraftRange =
                rangeSelection &&
                previewStart &&
                previewEnd &&
                isNightInTripRange(iso, previewStart, previewEnd);
              const draftStartOnly =
                rangeSelection &&
                previewStart &&
                !previewEnd &&
                iso === previewStart;
              const checkoutDay =
                rangeSelection &&
                previewStart &&
                previewEnd &&
                isCheckoutDayOnCalendar(iso, previewStart, previewEnd);

              const dayInteractive = !readOnly && (rangeSelection ? !!onRangeSelect || !!onRangeDayClick : !!onSelectDay);
              const useDragRange = rangeSelection && !!onRangeSelect;

              const cellBg =
                inDraftRange || draftStartOnly
                  ? "bg-amber-100/90"
                  : dayRes.length
                    ? "bg-teal-50/40"
                    : "bg-white";

              const dayNum = Number(iso.slice(8, 10));
              const todayRing =
                "inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full ring-2 ring-teal-600 text-teal-950";
              const plainDay =
                "inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full text-stone-900";

              return (
                <div
                  key={iso}
                  data-planner-day={iso}
                  onPointerDown={useDragRange ? (e) => handleRangePointerDown(e, iso) : undefined}
                  aria-label={useDragRange ? `Day ${dayNum}, drag to select your stay` : undefined}
                  className={`flex flex-col border-stone-100 p-1 sm:p-1.5 ${cellBg} ${
                    checkoutDay ? "border-l-4 border-l-amber-600" : ""
                  } ${compact ? "min-h-[5rem]" : "min-h-[6.5rem]"} ${
                    useDragRange ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  {readOnly || !dayInteractive ? (
                    <span
                      className="w-full px-0.5 text-left text-sm font-semibold"
                      title={title}
                    >
                      <span className={`text-sm font-semibold ${isTodayCell ? todayRing : plainDay}`}>
                        {dayNum}
                      </span>
                    </span>
                  ) : useDragRange ? (
                    <div
                      className="w-full px-0.5 text-left text-sm font-semibold"
                      title={title}
                    >
                      <span className={`text-sm font-semibold ${isTodayCell ? todayRing : plainDay}`}>
                        {dayNum}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title={title}
                      aria-current={isTodayCell ? "date" : undefined}
                      aria-label={
                        rangeSelection
                          ? `${iso}, tap to set first night or checkout`
                          : dayRes.length
                            ? `${iso}, ${dayRes.length} trip${dayRes.length === 1 ? "" : "s"}, tap to start a trip`
                            : `${iso}, tap to add a trip`
                      }
                      onClick={() => handleDayClick(iso)}
                      className="group w-full rounded-md px-0.5 text-left text-sm font-semibold"
                    >
                      <span
                        className={`${isTodayCell ? todayRing : `${plainDay} group-hover:bg-stone-200/70`}`}
                      >
                        {dayNum}
                      </span>
                    </button>
                  )}
                  <div className="mt-1 flex flex-1 flex-col gap-0.5">
                    {dayRes.slice(0, 2).map((r) => {
                      const style = colorForGroup(r.group_name);
                      const rooms = roomsLine(r);
                      const roomsShort = roomsLineShort(r);
                      const chipTitle = rooms
                        ? `${r.group_name} — ${rooms} (${r.guest_count} people)`
                        : `${r.group_name} (${r.guest_count} people)`;
                      const chipInner = (
                        <span className="flex min-w-0 flex-col gap-0 leading-tight">
                          <span className="truncate font-medium">{r.group_name}</span>
                          {rooms ? (
                            <span className="truncate text-[9px] font-normal leading-snug opacity-90" title={rooms}>
                              {roomsShort}
                            </span>
                          ) : null}
                        </span>
                      );
                      if (readOnly || !onSelectReservation) {
                        return (
                          <span
                            key={r.id}
                            title={chipTitle}
                            className="min-w-0 rounded px-1 py-0.5 text-left text-[10px] leading-tight sm:text-xs"
                            style={style}
                          >
                            {chipInner}
                          </span>
                        );
                      }
                      return (
                        <button
                          key={r.id}
                          type="button"
                          title={chipTitle}
                          aria-label={`Edit trip: ${chipTitle}`}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectReservation(r.id);
                          }}
                          className="min-w-0 rounded px-1 py-0.5 text-left text-[10px] leading-tight sm:text-xs"
                          style={style}
                        >
                          {chipInner}
                        </button>
                      );
                    })}
                    {dayRes.length > 2 ? (
                      <span className="px-1 text-[10px] text-stone-500 sm:text-xs">
                        +{dayRes.length - 2} more
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
