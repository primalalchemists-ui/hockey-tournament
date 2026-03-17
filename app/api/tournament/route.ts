// app/api/tournament/route.ts
import { NextResponse } from "next/server";

import { getAirtableTournament } from "@/lib/airtable";
import { mergeTournamentData } from "@/lib/merge-data";

export async function GET() {
  const airtableData = await getAirtableTournament();
  const tournament = mergeTournamentData(airtableData);

    return NextResponse.json(tournament, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}