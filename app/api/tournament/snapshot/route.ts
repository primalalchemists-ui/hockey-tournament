import { NextResponse } from "next/server";

import { isPubliclyReadable } from "@/lib/data/postgres/collections";
import { getPublicSnapshot } from "@/lib/data/postgres/public-snapshot";

/**
 * PEŁNY publiczny snapshot — jeden spójny stan turnieju.
 *
 * Pobierany dopiero po wykryciu zmiany wersji, więc nie jest to zapytanie
 * cykliczne. Zwraca też `revision`, żeby klient mógł potwierdzić, że dostał
 * wersję, której oczekiwał (albo nowszą).
 *
 * `tournamentId` obsługuje przełącznik kategorii i podlega tej samej
 * granicy publikacji co endpoint wersji.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("tournamentId");

  try {
    if (requested && !(await isPubliclyReadable(requested))) {
      return NextResponse.json(
        { error: "not_public" },
        { status: 404, headers: NO_STORE }
      );
    }

    const snapshot = await getPublicSnapshot(requested);

    if (!snapshot) {
      return NextResponse.json(
        { error: "no_current_tournament" },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(snapshot, { headers: NO_STORE });
  } catch (error) {
    console.error("[public] snapshot failed:", error);

    return NextResponse.json(
      { error: "snapshot_unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
