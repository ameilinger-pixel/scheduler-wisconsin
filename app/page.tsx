"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MonthPlanner } from "@/components/MonthPlanner";
import type { ReservationWithSpots, SleepingSpot } from "@/lib/types";

const QUICK_START_STORAGE_KEY = "family-cottage-dismissedQuickStart";

type BootstrapResponse = {
  authenticated: boolean;
  reservations: ReservationWithSpots[];
  sleepingSpots: SleepingSpot[];
  settings: {
    max_total_guests: number;
    season_start: string | null;
    season_end: string | null;
  } | null;
};

type DraftReservation = {
  groupName: string;
  startDate: string;
  endDate: string;
  guestCount: number;
  notes: string;
  sleepingSpotIds: string[];
};

const initialDraft: DraftReservation = {
  groupName: "",
  startDate: "",
  endDate: "",
  guestCount: 2,
  notes: "",
  sleepingSpotIds: [],
};

function formatTripDates(start: string, end: string): string {
  try {
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const y = s.getFullYear();
    if (s.getFullYear() === e.getFullYear()) {
      if (s.getMonth() === e.getMonth()) {
        return `${s.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${e.getDate()}, ${y}`;
      }
      return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
    }
    return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  } catch {
    return `${start} → ${end}`;
  }
}

function todayIsoLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function friendlyError(message: string): string {
  if (message.includes("spots are already booked")) {
    return "Someone else already has one of those rooms for part of those nights. Pick different rooms or dates.";
  }
  if (message.includes("Guest capacity exceeded")) {
    return "That many people would go over the house limit on at least one night. Try fewer guests or different dates.";
  }
  if (message.includes("Checkout date must be after")) {
    return "The last day should be after the first day — that’s the day you head home (no sleep that night).";
  }
  return message;
}

export default function Home() {
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftReservation>(initialDraft);
  const [formError, setFormError] = useState("");
  const [editingReservationId, setEditingReservationId] = useState<string | null>(null);
  const [showOptionalNote, setShowOptionalNote] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showQuickStart, setShowQuickStart] = useState(false);

  const reservationCount = data?.reservations.length || 0;

  useEffect(() => {
    if (!toast) return;
    const id = globalThis.setTimeout(() => setToast(null), 5000);
    return () => globalThis.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!authed) return;
    try {
      setShowQuickStart(!localStorage.getItem(QUICK_START_STORAGE_KEY));
    } catch {
      setShowQuickStart(true);
    }
  }, [authed]);

  async function loadData() {
    setLoadError(null);
    try {
      const response = await fetch("/api/bootstrap");
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load");
      }
      setData({
        authenticated: Boolean(body.authenticated),
        reservations: body.reservations ?? [],
        sleepingSpots: body.sleepingSpots ?? [],
        settings: body.settings ?? null,
      });
      setAuthed(Boolean(body.authenticated));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load";
      setLoadError(message);
      setData(null);
      setAuthed(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const sortedReservations = useMemo(() => {
    return [...(data?.reservations || [])].sort((a, b) =>
      a.start_date.localeCompare(b.start_date),
    );
  }, [data?.reservations]);

  const nextTrip = useMemo(() => {
    const today = todayIsoLocal();
    return sortedReservations.find((r) => r.end_date >= today) ?? null;
  }, [sortedReservations]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const body = await response.json();
      if (!response.ok) {
        setAuthError(
          body.error === "Incorrect passcode"
            ? "That code doesn’t match. Ask a family member."
            : body.error || "Something went wrong.",
        );
        return;
      }
      setPasscode("");
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthed(false);
    await loadData();
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!draft.startDate || !draft.endDate) {
      setFormError("Drag on the calendar to pick your trip, or set dates under “Type dates instead”.");
      return;
    }
    if (draft.startDate >= draft.endDate) {
      setFormError("The day you leave must be after your first night.");
      return;
    }
    if (draft.sleepingSpotIds.length === 0) {
      setFormError("Pick at least one room or sleeping spot so we know where your group stays.");
      return;
    }
    setLoading(true);
    try {
      const endpoint = editingReservationId
        ? `/api/reservations/${editingReservationId}`
        : "/api/reservations";
      const method = editingReservationId ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json();
      if (!response.ok) {
        setFormError(friendlyError(body.error || "Couldn’t save. Try again."));
        return;
      }

      const savedStart = draft.startDate;
      const savedEnd = draft.endDate;
      const wasEditing = Boolean(editingReservationId);
      setToast(
        wasEditing
          ? `Updated — ${formatTripDates(savedStart, savedEnd)}`
          : `Trip saved — you’re on the calendar ${formatTripDates(savedStart, savedEnd)}`,
      );

      setDraft(initialDraft);
      setEditingReservationId(null);
      setShowOptionalNote(false);
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  function startEdit(reservation: ReservationWithSpots) {
    setEditingReservationId(reservation.id);
    setDraft({
      groupName: reservation.group_name,
      startDate: reservation.start_date,
      endDate: reservation.end_date,
      guestCount: reservation.guest_count,
      notes: reservation.notes || "",
      sleepingSpotIds: reservation.spots.map((spot) => spot.id),
    });
    setShowOptionalNote(!!reservation.notes);
    window.scrollTo({ top: document.getElementById("add-trip")?.offsetTop ?? 0, behavior: "smooth" });
  }

  async function deleteReservation(id: string) {
    if (!window.confirm("Remove this trip from the calendar?")) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        setFormError(friendlyError(body.error || "Couldn’t remove."));
        return;
      }
      setToast("Trip removed from the calendar.");
      if (editingReservationId === id) {
        setEditingReservationId(null);
        setDraft(initialDraft);
      }
      await loadData();
    } finally {
      setLoading(false);
    }
  }

  function toggleSpot(spotId: string) {
    setDraft((current) => ({
      ...current,
      sleepingSpotIds: current.sleepingSpotIds.includes(spotId)
        ? current.sleepingSpotIds.filter((id) => id !== spotId)
        : [...current.sleepingSpotIds, spotId],
    }));
  }

  function handlePlannerSelectReservation(reservationId: string) {
    const reservation = data?.reservations.find((r) => r.id === reservationId);
    if (reservation) {
      startEdit(reservation);
    }
  }

  /** Form calendar: click and drag sets first night through checkout. */
  function handleFormRangeSelect(range: { startDate: string; endDate: string }) {
    setFormError("");
    setDraft((current) => ({
      ...current,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
  }

  if (data === null && loadError === null) {
    return (
      <main className="app-main-pad mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 pb-24 pt-10 lg:max-w-3xl lg:px-8">
        <div className="space-y-5">
          <div className="h-9 w-56 animate-pulse rounded-xl bg-stone-200/90" />
          <div className="h-4 w-3/4 max-w-md animate-pulse rounded-lg bg-stone-200/70" />
          <div className="h-72 animate-pulse rounded-2xl bg-stone-200/60" />
          <div className="h-24 animate-pulse rounded-2xl bg-stone-200/50" />
        </div>
        <p className="sr-only">Loading calendar…</p>
      </main>
    );
  }

  if (data === null && loadError) {
    return (
      <main className="app-main-pad mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-16 lg:px-8">
        <p className="text-center text-red-800">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-4 rounded-xl bg-teal-700 px-4 py-3 text-center font-semibold text-white transition hover:bg-teal-800 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          Try again
        </button>
      </main>
    );
  }

  if (!authed && data) {
    return (
      <>
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-gradient-to-r from-teal-600 via-teal-500 to-teal-700"
          aria-hidden
        />
        <main className="app-main-pad mx-auto min-h-screen w-full max-w-2xl pb-[max(6rem,env(safe-area-inset-bottom))] pt-6 lg:max-w-3xl lg:px-8">
          <header className="mb-6 text-center sm:text-left">
            <p className="text-sm font-medium text-teal-800">Ephraim cottage</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              Who’s there when?
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-stone-600 sm:mx-0">
              See who’s at the cottage below. Enter the family code to add or change trips.
            </p>
            {nextTrip ? (
              <p className="mx-auto mt-4 max-w-lg rounded-xl border border-teal-200 bg-teal-50/90 px-4 py-3 text-left text-sm text-teal-950 sm:mx-0">
                <span className="font-semibold">Next at the cottage:</span> {nextTrip.group_name} ·{" "}
                {formatTripDates(nextTrip.start_date, nextTrip.end_date)}
              </p>
            ) : null}
          </header>

          <nav
            className="sticky top-0 z-30 -mx-4 mb-6 flex gap-2 border-b border-stone-200/80 bg-[#f7f5f2]/92 px-4 py-2.5 backdrop-blur-sm supports-[backdrop-filter]:bg-[#f7f5f2]/80 lg:hidden"
            aria-label="Jump to section"
          >
            <a
              href="#month-planner"
              className="rounded-full border border-stone-300/90 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              Calendar
            </a>
            <a
              href="#public-trips-heading"
              className="rounded-full border border-stone-300/90 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              Upcoming trips
            </a>
          </nav>

          <MonthPlanner reservations={sortedReservations} readOnly />

        <section aria-labelledby="public-trips-heading" className="mb-10 scroll-mt-28">
          <h2 id="public-trips-heading" className="mb-1 text-lg font-bold text-stone-900">
            Upcoming trips
          </h2>
          <p className="mb-8 text-sm text-stone-500">Same information as on the calendar — read-only until you sign in.</p>
          <ul className="space-y-3">
            {sortedReservations.map((reservation) => (
              <li
                key={reservation.id}
                className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-md ring-1 ring-stone-200/80 transition-shadow hover:shadow-lg"
              >
                <p className="text-lg font-semibold text-stone-900">{reservation.group_name}</p>
                <p className="mt-1 text-base text-stone-700">
                  {formatTripDates(reservation.start_date, reservation.end_date)}
                </p>
                <p className="mt-2 text-sm text-stone-600">
                  {reservation.guest_count} {reservation.guest_count === 1 ? "person" : "people"} ·{" "}
                  {reservation.spots.map((s) => s.name).join(", ")}
                </p>
                {reservation.notes ? (
                  <p className="mt-2 text-sm italic text-stone-500">{reservation.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {sortedReservations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 p-8 text-center text-stone-600">
              No trips yet — sign in with the family code above to add the first one.
            </div>
          ) : null}
        </section>

        <form
          onSubmit={handleLogin}
          className="space-y-4 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-md ring-1 ring-stone-200/80"
        >
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Family code</span>
            <input
              type="password"
              required
              autoComplete="off"
              placeholder="••••••"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3.5 text-lg outline-none ring-teal-600/20 focus:border-teal-600 focus:ring-4"
            />
          </label>
          {authError ? <p className="text-sm text-red-700">{authError}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-700 py-3.5 text-lg font-semibold text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Open calendar"}
          </button>
        </form>
        </main>
      </>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-gradient-to-r from-teal-600 via-teal-500 to-teal-700"
        aria-hidden
      />
      <main className="app-main-pad mx-auto min-h-screen w-full max-w-2xl pb-[max(6rem,env(safe-area-inset-bottom))] pt-6 lg:max-w-3xl lg:px-8">
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {draft.startDate && draft.endDate
            ? `Dates selected: ${formatTripDates(draft.startDate, draft.endDate)}`
            : draft.startDate
              ? "First night selected, drag to your last night"
              : ""}
        </div>

        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-800">Ephraim cottage</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              Who’s there when?
            </h1>
            <p className="mt-2 max-w-md text-base text-stone-600">
              {reservationCount === 0
                ? "Add your trip below — the calendar shows everyone’s bookings."
                : `${reservationCount} trip${reservationCount === 1 ? "" : "s"} on the list; the calendar shows who’s on which nights.`}
            </p>
            {nextTrip ? (
              <p className="mt-4 max-w-lg rounded-xl border border-teal-200 bg-teal-50/90 px-4 py-3 text-sm text-teal-950">
                <span className="font-semibold">Next at the cottage:</span> {nextTrip.group_name} ·{" "}
                {formatTripDates(nextTrip.start_date, nextTrip.end_date)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="self-start rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            Sign out
          </button>
        </header>

        <nav
          className="sticky top-0 z-30 -mx-4 mb-6 flex gap-2 border-b border-stone-200/80 bg-[#f7f5f2]/92 px-4 py-2.5 backdrop-blur-sm supports-[backdrop-filter]:bg-[#f7f5f2]/80 lg:hidden"
          aria-label="Jump to section"
        >
          <a
            href="#add-trip"
            className="rounded-full border border-stone-300/90 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            Add trip
          </a>
          <a
            href="#all-trips-heading"
            className="rounded-full border border-stone-300/90 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm transition hover:bg-stone-50 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            Everyone’s trips
          </a>
        </nav>

        {showQuickStart ? (
        <div className="mb-10 rounded-2xl border border-teal-200 bg-teal-50/80 p-4 shadow-md ring-1 ring-teal-200/60 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-950">Quick start</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-teal-900/90">
                <li>Drag on “Pick your dates” to choose your nights (family name and rooms come next).</li>
                <li>Teal days already have bookings; your draft stays amber until you save.</li>
                <li>Tap a name on the calendar or use Change in the list to edit a trip.</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(QUICK_START_STORAGE_KEY, "1");
                } catch {
                  /* ignore */
                }
                setShowQuickStart(false);
              }}
              className="shrink-0 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-900 transition hover:bg-teal-100 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      <section
        id="add-trip"
        className="mb-14 scroll-mt-28 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-md ring-1 ring-stone-200/80 sm:p-6"
      >
        <h2 className="text-xl font-bold text-stone-900">
          {editingReservationId ? "Update this trip" : "Add or change a trip"}
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Drag on the calendar to choose your nights — you don’t have to type dates unless you want to.
        </p>

        <form className="mt-6 space-y-5" onSubmit={submitReservation}>
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Your name or family</span>
            <input
              required
              placeholder="e.g. Mom & Dad, Sarah’s crew"
              value={draft.groupName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, groupName: event.target.value }))
              }
              className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15"
            />
          </label>

          <div>
            <p className="text-sm font-medium text-stone-800">When are you there?</p>
            <p className="mt-0.5 text-xs text-stone-500">
              Drag across the nights you’ll sleep there — the last day you drag over is your last night; checkout is the next morning (amber doesn’t include that morning).
            </p>
            <div className="mt-3">
              <MonthPlanner
                heading="Pick your dates"
                reservations={sortedReservations}
                rangeSelection
                rangeStart={draft.startDate}
                rangeEnd={draft.endDate}
                onRangeSelect={handleFormRangeSelect}
                onSelectReservation={handlePlannerSelectReservation}
              />
            </div>
            {draft.startDate && draft.endDate ? (
              <p className="mt-3 rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-950">
                <span className="font-medium">Selected:</span>{" "}
                {formatTripDates(draft.startDate, draft.endDate)}
              </p>
            ) : draft.startDate && !draft.endDate ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                Drag through the <span className="font-medium">day you leave</span> (checkout) to finish.
              </p>
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                Click a day and drag across the nights you’ll be there.
              </p>
            )}
            <details className="mt-3 rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-stone-700 outline-none hover:text-stone-900 focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-teal-600/50 focus-visible:ring-offset-2">
                Type dates instead
              </summary>
              <div className="mt-3 grid gap-4 border-t border-stone-200 pt-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-stone-600">First night</span>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, startDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-stone-600">Day you leave</span>
                  <input
                    type="date"
                    value={draft.endDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, endDate: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
                  />
                </label>
              </div>
            </details>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-stone-700">How many people?</span>
            <input
              type="number"
              min={1}
              max={30}
              required
              value={draft.guestCount}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  guestCount: Number(event.target.value || 1),
                }))
              }
              className="mt-2 w-full max-w-[8rem] rounded-xl border border-stone-300 bg-stone-50 px-4 py-3.5 text-lg outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15"
            />
          </label>

          {draft.startDate && draft.endDate ? (
            <div>
              <p className="text-sm font-medium text-stone-700">Which beds / rooms?</p>
              <p className="mt-0.5 text-xs text-stone-500">Tap all that apply for your group.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(data?.sleepingSpots || []).map((spot) => {
                  const on = draft.sleepingSpotIds.includes(spot.id);
                  return (
                    <button
                      key={spot.id}
                      type="button"
                      onClick={() => toggleSpot(spot.id)}
                      className={`min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm font-medium transition sm:min-h-0 ${
                        on
                          ? "border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-600/30"
                          : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
                      }`}
                    >
                      {spot.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-600">
              Pick your dates on the calendar above (or under “Type dates instead”), then choose rooms here.
            </p>
          )}

          {!showOptionalNote && !draft.notes ? (
            <button
              type="button"
              onClick={() => setShowOptionalNote(true)}
              className="text-sm font-medium text-teal-800 underline hover:text-teal-900"
            >
              Add a short note (optional)
            </button>
          ) : null}
          {showOptionalNote || draft.notes ? (
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Note (optional)</span>
              <textarea
                rows={2}
                placeholder="e.g. bringing the dog, kids only weekend…"
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15"
              />
            </label>
          ) : null}

          {formError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-700 py-3.5 text-lg font-semibold text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
            >
              {loading ? "Saving…" : editingReservationId ? "Save changes" : "Add to calendar"}
            </button>
            {editingReservationId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingReservationId(null);
                  setDraft(initialDraft);
                  setShowOptionalNote(false);
                }}
                className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="all-trips-heading" className="mb-10 scroll-mt-28">
        <h2 id="all-trips-heading" className="mb-1 text-lg font-bold text-stone-900">
          Everyone’s trips
        </h2>
        <p className="mb-8 text-sm text-stone-500">Same trips as on the calendar — edit or remove from here.</p>
        <ul className="space-y-3">
          {sortedReservations.map((reservation) => (
            <li
              key={reservation.id}
              className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-md ring-1 ring-stone-200/80 transition-shadow hover:shadow-lg"
            >
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <p className="text-lg font-semibold text-stone-900">{reservation.group_name}</p>
                  <p className="mt-1 text-base text-stone-700">
                    {formatTripDates(reservation.start_date, reservation.end_date)}
                  </p>
                  <p className="mt-2 text-sm text-stone-600">
                    {reservation.guest_count} {reservation.guest_count === 1 ? "person" : "people"}{" "}
                    · {reservation.spots.map((s) => s.name).join(", ")}
                  </p>
                  {reservation.notes ? (
                    <p className="mt-2 text-sm italic text-stone-500">{reservation.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2 md:flex-col md:items-end md:justify-start">
                  <button
                    type="button"
                    onClick={() => startEdit(reservation)}
                    className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-800 transition hover:bg-stone-100 active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReservation(reservation.id)}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 transition hover:bg-red-100 active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {sortedReservations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 p-8 text-center text-stone-600">
            Be the first to add your dates — use the form above.
          </div>
        ) : null}
      </section>

      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm font-medium text-stone-800 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-600/50 focus-visible:ring-offset-2"
        >
          <span>How this works</span>
          <span className="text-stone-500">{showHowItWorks ? "−" : "+"}</span>
        </button>
        {showHowItWorks ? (
          <div className="mt-2 rounded-xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-600">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                “Pick your dates” shows who’s already booked (teal) and your selection (amber). Drag to set your
                nights, or tap someone’s name on the calendar to edit their trip.
              </li>
              <li>
                The list and room picks help everyone avoid double-booking the same room.
              </li>
              <li>
                “Day you leave” is the morning you drive home — you don’t sleep there that night.
              </li>
              <li>
                If the house is full for a night, we’ll ask you to adjust dates or guest count.
              </li>
            </ul>
            {data?.settings ? (
              <p className="mt-3 text-xs text-stone-500">
                House limit: {data.settings.max_total_guests} people · Typical season{" "}
                {data.settings.season_start ?? "?"}–{data.settings.season_end ?? "?"}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
          >
            <div className="pointer-events-auto max-w-lg rounded-xl border border-teal-200 bg-teal-950 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
              {toast}
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
