// app/api/tournament/route.ts
import { NextResponse } from "next/server";

import { loadCurrentTournament } from "@/lib/data";
import { mergeTournamentData } from "@/lib/merge-data";

export async function GET() {
  const result = await loadCurrentTournament();

  if (result.status === "error") {
    return NextResponse.json(
      { error: "tournament_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const tournament = mergeTournamentData(
    result.status === "ok" ? result.tournament : null
  );

  return NextResponse.json(tournament, {
    headers: {
      // cache na CDN (Vercel edge)
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
