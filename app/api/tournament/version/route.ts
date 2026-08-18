import { NextResponse } from "next/server";

import { getPublicVersion } from "@/lib/data/postgres/public-snapshot";

/**
 * LEKKIE odpytanie o wersję publicznego stanu.
 *
 * Zwraca wyłącznie identyfikator wyświetlanego turnieju i licznik wersji.
 * Nie dotyka drużyn, meczów, klasyfikacji ani assetów — to jest zapytanie,
 * które publiczny frontend wykonuje co kilkanaście sekund.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const version = await getPublicVersion();

    return NextResponse.json(version, {
      // Wersja nie może być serwowana ze starego cache — inaczej kibic
      // nigdy nie zobaczyłby zmiany.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[public] version check failed:", error);

    return NextResponse.json(
      { error: "version_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
