import { afterAll, beforeAll } from "vitest";

import { loadEnvFile } from "@/lib/db/load-env";

// Vitest nie ładuje .env samodzielnie (robi to Next.js).
// Testy integracyjne potrzebują DATABASE_URL i kluczy Airtable.
loadEnvFile();

/**
 * GLOBALNY STRAŻNIK TURNIEJU PUBLICZNEGO.
 *
 * Ten plik jest wykonywany dla KAŻDEGO pliku testowego, więc poniższe
 * haki obowiązują wszędzie — także w zestawach, które o izolacji nie
 * wiedzą. Niezmiennik jest prosty i nie zależy od kolejności plików:
 *
 *   każdy plik testowy kończy się z tym samym turniejem publicznym,
 *   z którym się zaczął.
 *
 * To jest zabezpieczenie SYSTEMOWE, a nie zamiast dbałości w testach:
 * pojedyncze zestawy nadal przywracają stan same, bo dzięki temu awaria
 * jest widoczna od razu. Ten hak łapie przypadki, których nie przewidziano.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

let currentAtStart: string | null = null;

beforeAll(async () => {
  if (!hasDatabase) return;

  try {
    currentAtStart = await readCurrent();
  } catch {
    // Zestawy z podmienionym fetch (adapter Airtable) nie mają dostępu
    // do bazy — i nie dotykają turniejów, więc strażnik jest zbędny.
    currentAtStart = null;
  }
});

async function readCurrent(): Promise<string | null> {
  const { getDb } = await import("@/lib/db/client");
  const { tournaments } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await getDb()
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.isCurrent, true))
    .limit(1);

  return rows[0]?.id ?? null;
}

afterAll(async () => {
  if (!hasDatabase || !currentAtStart) return;

  try {
    await restore(currentAtStart);
  } catch {
    // jw. — brak dostępu do bazy nie może wywracać zestawu testów
  }
});

async function restore(originalId: string) {
  const { getDb } = await import("@/lib/db/client");
  const { tournaments } = await import("@/lib/db/schema");
  const { and, eq, ne } = await import("drizzle-orm");

  const db = getDb();

  const exists = await db
    .select({ id: tournaments.id, isCurrent: tournaments.isCurrent })
    .from(tournaments)
    .where(eq(tournaments.id, originalId))
    .limit(1);

  // Turniej mógł zostać skasowany przez test — wtedy nie ma czego wracać.
  if (exists.length === 0) return;
  if (exists[0].isCurrent) return;

  await db
    .update(tournaments)
    .set({ isCurrent: false })
    .where(and(eq(tournaments.isCurrent, true), ne(tournaments.id, originalId)));

  await db
    .update(tournaments)
    .set({ isCurrent: true })
    .where(eq(tournaments.id, originalId));
}
