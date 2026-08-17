/**
 * Import turnieju z Airtable do PostgreSQL.
 *
 * Uruchomienie:
 *   npm run db:import              — źródłem jest ŻYWY Airtable (domyślnie)
 *   npm run db:import -- --source=fixture
 *                                 — źródłem jest fixtures/airtable-raw.json
 *                                   (deterministyczny, ale z zredagowanymi
 *                                   URL-ami assetów)
 *
 * Właściwości:
 *  - IDEMPOTENTNY: ponowne uruchomienie nie tworzy duplikatów, bo zapis idzie
 *    przez postgresRepository.saveTournament(), który robi UPSERT po
 *    (tournament_id, external_id) i zachowuje tożsamość turnieju.
 *  - NIE modyfikuje i NIE kasuje niczego w Airtable — czyta wyłącznie.
 *  - Przechodzi tą samą ścieżką zapisu co aplikacja, więc równoważność
 *    adapterów jest gwarantowana konstrukcyjnie, a nie przez osobny kod.
 */

import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";
import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { airtableRepository } from "@/lib/data/airtable/repository";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { buildTournament } from "@/lib/data/airtable/mappers";
import { mergeTournamentData } from "@/lib/merge-data";
import type { Tournament } from "@/types/tournament";

loadEnvFile();

type Source = "airtable" | "fixture";

function parseSource(): Source {
  const arg = process.argv.find((value) => value.startsWith("--source="));
  const value = arg?.split("=")[1] ?? "airtable";

  if (value !== "airtable" && value !== "fixture") {
    throw new Error(`Nieznane --source=${value}. Dozwolone: airtable, fixture.`);
  }

  return value;
}

const FIXTURE_PATH = path.join(process.cwd(), "fixtures", "airtable-raw.json");

type FixtureShape = {
  slug: string;
  tournamentRecord: { id: string; fields: Record<string, unknown> };
  teamRecords: unknown[];
  matchRecords: unknown[];
  scorerRecords: unknown[];
};

async function loadFromFixture(): Promise<{
  tournament: Tournament;
  legacyId: string;
}> {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Brak ${FIXTURE_PATH}. Uruchom najpierw: npm run fixtures:export`
    );
  }

  const fixture = JSON.parse(
    fs.readFileSync(FIXTURE_PATH, "utf8")
  ) as FixtureShape;

  const tournament = mergeTournamentData(
    // Typy rekordów są sprawdzane przez mapper — fixture pochodzi z naszego
    // własnego eksportu, więc rzutowanie jest tu bezpieczne.
    buildTournament(fixture as unknown as Parameters<typeof buildTournament>[0])
  );

  return { tournament, legacyId: fixture.tournamentRecord.id };
}

async function loadFromAirtable(): Promise<{
  tournament: Tournament;
  legacyId: string | null;
}> {
  const result = await airtableRepository.getActiveTournament();

  if (result.status === "error") {
    throw new Error(`Odczyt z Airtable nie powiódł się: ${result.message}`);
  }

  if (result.status === "empty") {
    throw new Error("Airtable nie zwrócił aktywnego turnieju — nie ma czego importować.");
  }

  return { tournament: mergeTournamentData(result.tournament), legacyId: null };
}

function summarize(tournament: Tournament) {
  return {
    groups: tournament.groups.length,
    teams: tournament.groups.reduce((sum, group) => sum + group.teams.length, 0),
    matches: tournament.groups.reduce(
      (sum, group) => sum + group.matches.length,
      0
    ),
    scorers: tournament.scorers.length,
    assets: Object.entries(tournament.assets).filter(
      ([key, value]) =>
        !key.endsWith("Type") && !key.endsWith("Name") && !key.endsWith("PublicId") && value
    ).length,
  };
}

async function main() {
  const source = parseSource();

  console.log(`Źródło importu: ${source}`);

  const loaded =
    source === "fixture" ? await loadFromFixture() : await loadFromAirtable();

  const { tournament } = loaded;
  const before = summarize(tournament);

  console.log(`Turniej: "${tournament.title}"`);
  console.log(
    `  do zaimportowania: ${before.groups} grup, ${before.teams} drużyn, ` +
      `${before.matches} meczów, ${before.scorers} strzelców, ${before.assets} assetów`
  );

  const { slug } = await postgresRepository.saveTournament(tournament);

  const db = getDb();

  if (loaded.legacyId) {
    await db
      .update(tournaments)
      .set({ legacyAirtableId: loaded.legacyId })
      .where(eq(tournaments.slug, slug));
  }

  // Weryfikacja przez odczyt z Postgresa — nie ufamy zapisowi na słowo.
  const verification = await postgresRepository.getActiveTournament();

  if (verification.status !== "ok") {
    throw new Error(
      `Import zapisany, ale odczyt z Postgresa zwrócił status "${verification.status}".`
    );
  }

  const after = summarize(mergeTournamentData(verification.tournament));

  console.log(`\nZapisano do PostgreSQL (slug: ${slug}):`);
  console.log(`  grupy:    ${after.groups}`);
  console.log(`  drużyny:  ${after.teams}`);
  console.log(`  mecze:    ${after.matches}`);
  console.log(`  strzelcy: ${after.scorers}`);
  console.log(`  assety:   ${after.assets}`);

  const mismatches = (Object.keys(before) as Array<keyof typeof before>).filter(
    (key) => before[key] !== after[key]
  );

  if (mismatches.length) {
    throw new Error(
      `Niezgodność po imporcie w polach: ${mismatches.join(", ")}`
    );
  }

  console.log("\nZgodność liczby rekordów: OK");
}

main().catch((error) => {
  console.error("\nImport nie powiódł się:", error.message);
  process.exit(1);
});
