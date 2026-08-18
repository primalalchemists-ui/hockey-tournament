import { NextResponse } from "next/server";

import { getPublicSnapshot } from "@/lib/data/postgres/public-snapshot";

/**
 * PEŁNY publiczny snapshot — jeden spójny stan turnieju.
 *
 * Pobierany dopiero po wykryciu zmiany wersji, więc nie jest to zapytanie
 * cykliczne. Zwraca też `revision`, żeby klient mógł potwierdzić, że dostał
 * wersję, której oczekiwał (albo nowszą).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getPublicSnapshot();

    if (!snapshot) {
      return NextResponse.json(
        { error: "no_current_tournament" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[public] snapshot failed:", error);

    return NextResponse.json(
      { error: "snapshot_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
