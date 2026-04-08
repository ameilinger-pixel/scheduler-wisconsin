import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listReservations, getSleepingSpots } from "@/lib/reservations";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ReservationWithSpots } from "@/lib/types";

/** Public schedule: no private notes on the open URL. */
function reservationsForPublicView(list: ReservationWithSpots[]): ReservationWithSpots[] {
  return list.map((r) => ({ ...r, notes: null }));
}

export async function GET() {
  try {
    const [reservations, sleepingSpots] = await Promise.all([
      listReservations(),
      getSleepingSpots(),
    ]);

    const authed = await isAuthenticated();

    if (!authed) {
      return NextResponse.json({
        authenticated: false,
        reservations: reservationsForPublicView(reservations),
        sleepingSpots,
        settings: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const { data: settings, error } = await supabase
      .from("app_settings")
      .select("max_total_guests, season_start, season_end")
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      authenticated: true,
      reservations,
      sleepingSpots,
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load app data" },
      { status: 500 },
    );
  }
}
