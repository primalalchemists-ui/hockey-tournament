import { NextResponse } from "next/server";

import { isPubliclyReadable } from "@/lib/data/postgres/collections";
import { getPublicVersion } from "@/lib/data/postgres/public-snapshot";

/**
 * LEKKIE odpytanie o wersję publicznego stanu.
 *
 * Bez parametru dotyczy turnieju wyświetlanego globalnie. Parametr
 * `tournamentId` obsługuje przełącznik kategorii — i jest WERYFIKOWANY:
 * znajomość UUID nie daje dostępu, turniej musi należeć do tej samej,
 * publicznej kolekcji i nie może być zarchiwizowany.
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

    const version = await getPublicVersion(requested);

    return NextResponse.json(version, {
      // Wersja nie może być serwowana ze starego cache — inaczej kibic
      // nigdy nie zobaczyłby zmiany.
      headers: NO_STORE,
    });
  } catch (error) {
    console.error("[public] version check failed:", error);

    return NextResponse.json(
      { error: "version_unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
