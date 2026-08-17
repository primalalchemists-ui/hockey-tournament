import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { requireDatabaseUrl } from "./env";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

/**
 * Driver: @neondatabase/serverless przez HTTP (drizzle-orm/neon-http).
 *
 * Dlaczego HTTP, a nie pula TCP/WebSocket:
 *  - brak stanu połączenia => brak wyczerpywania puli przy zimnych startach
 *    funkcji serverless na Vercelu,
 *  - brak zależności od globalnego WebSocket (Node 20 go nie ma),
 *  - `db.batch([...])` uruchamia zestaw zapytań w JEDNEJ transakcji
 *    i w JEDNYM round-tripie HTTP — dokładnie to, czego potrzebuje zapis
 *    całego turnieju.
 *
 * Ograniczenie do świadomego zapamiętania: driver HTTP nie obsługuje
 * transakcji interaktywnych (`db.transaction(async tx => ...)`).
 * Zapis jest więc budowany jako jeden batch, bez zależności między
 * wynikami kolejnych zapytań.
 */

let cachedUrl: string | null = null;
let cachedDb: Database | null = null;

export function getDb(): Database {
  const url = requireDatabaseUrl();

  if (cachedDb && cachedUrl === url) {
    return cachedDb;
  }

  cachedUrl = url;
  cachedDb = drizzle(neon(url), { schema });

  return cachedDb;
}

/** Wyłącznie na potrzeby testów — czyści zapamiętane połączenie. */
export function resetDbCache() {
  cachedUrl = null;
  cachedDb = null;
}

export { schema };
