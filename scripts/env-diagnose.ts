/**
 * DIAGNOSTYKA ŚRODOWISKA — wyłącznie ODCZYT.
 *
 * Powstała po obserwacji: „na Vercelu widać zapisane wyniki, lokalnie
 * w pewnym momencie nie". Skrypt nie zgaduje — pokazuje odciski palca
 * konfiguracji i realny stan turnieju w bazie, do której faktycznie
 * połączony jest ten proces.
 *
 * NIGDY nie wypisuje haseł ani tokenów: z DATABASE_URL bierze wyłącznie
 * host, nazwę bazy i skrót SHA-256, po którym można porównać dwa
 * środowiska bez ujawniania czegokolwiek.
 *
 *   npm run env:diagnose
 *   npm run env:diagnose -- playoff-rehearsal-manual
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { matches, tournaments } from "@/lib/db/schema";
import { getPlayoffState } from "@/lib/data/postgres/playoff-engine";

const SLUG = process.argv[2] ?? "playoff-rehearsal-manual";

/** Krótki, stabilny odcisk sekretu — do porównań, nie do odtworzenia. */
function fingerprint(value: string | undefined): string {
  if (!value) return "(brak)";

  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/** Host + nazwa bazy. Login i hasło NIE są nigdzie drukowane. */
function describeDatabaseUrl(raw: string | undefined) {
  if (!raw) return { host: "(brak)", database: "(brak)", branch: "(brak)" };

  try {
    const url = new URL(raw);

    /*
      Neon koduje branch w subdomenie, np.
      ep-<nazwa>-<id>.<region>.aws.neon.tech — pierwszy segment wystarczy,
      żeby stwierdzić, czy dwa środowiska patrzą na ten sam branch.
    */
    const [endpoint] = url.hostname.split(".");

    return {
      host: url.hostname,
      database: url.pathname.replace("/", "") || "(brak)",
      branch: endpoint || "(brak)",
    };
  } catch {
    return { host: "(niepoprawny URL)", database: "?", branch: "?" };
  }
}

async function main() {
  const db = getDb();
  const dbInfo = describeDatabaseUrl(process.env.DATABASE_URL);

  console.log("=".repeat(64));
  console.log("ŚRODOWISKO");
  console.log("=".repeat(64));
  console.log(`NODE_ENV:            ${process.env.NODE_ENV ?? "(brak)"}`);
  console.log(`VERCEL:              ${process.env.VERCEL ? "tak" : "nie"}`);
  console.log(`VERCEL_ENV:          ${process.env.VERCEL_ENV ?? "(brak)"}`);
  console.log(`DATA_SOURCE:         ${process.env.DATA_SOURCE ?? "(brak → airtable)"}`);
  console.log(`DB host:             ${dbInfo.host}`);
  console.log(`DB branch/endpoint:  ${dbInfo.branch}`);
  console.log(`DB name:             ${dbInfo.database}`);
  console.log(`DATABASE_URL sha256: ${fingerprint(process.env.DATABASE_URL)}`);

  const serverTime = await db.execute<{ now: string }>(
    "select now()::text as now" as never
  );
  console.log(`czas bazy:           ${(serverTime as never as { rows: Array<{ now: string }> }).rows?.[0]?.now ?? "?"}`);

  console.log("");
  console.log("=".repeat(64));
  console.log(`TURNIEJ: ${SLUG}`);
  console.log("=".repeat(64));

  const rows = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, SLUG))
    .limit(1);

  const tournament = rows[0];

  if (!tournament) {
    console.log("Nie znaleziono turnieju o tym slugu w TEJ bazie.");
    return;
  }

  console.log(`UUID:            ${tournament.id}`);
  console.log(`faza:            ${tournament.phase}`);
  console.log(`publiczny:       ${tournament.isCurrent ? "TAK" : "nie"}`);
  console.log(`public_revision: ${tournament.publicRevision}`);
  console.log(`updated_at:      ${tournament.updatedAt?.toISOString() ?? "?"}`);

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournament.id));

  const byStage = new Map<string, { total: number; scored: number }>();

  for (const match of matchRows) {
    const entry = byStage.get(match.stage) ?? { total: 0, scored: 0 };
    entry.total += 1;
    if (match.homeScore !== null) entry.scored += 1;
    byStage.set(match.stage, entry);
  }

  console.log("");
  console.log("mecze wg etapu (rekordy w bazie):");

  for (const [stage, entry] of [...byStage.entries()].sort()) {
    console.log(`  ${stage.padEnd(16)} ${entry.scored}/${entry.total} z wynikiem`);
  }

  if (tournament.format !== "group_playoff") return;

  const state = await getPlayoffState(tournament.id);

  console.log("");
  console.log(`faza wg silnika: ${state.phaseLabel}`);

  for (const scope of state.scopes) {
    console.log("");
    console.log(`${scope.groupName}:`);

    for (const round of scope.rounds) {
      for (const match of round.matches) {
        const score =
          match.homeScore === null
            ? "—"
            : `${match.homeScore}:${match.awayScore}`;

        console.log(
          `  ${round.label.padEnd(18)} ${(match.home?.name ?? "?").padEnd(6)}` +
            ` ${score.padEnd(6)} ${match.away?.name ?? "?"}   [${match.editability}]`
        );
      }
    }

    for (const match of scope.placement?.matches ?? []) {
      const score =
        match.homeScore === null ? "—" : `${match.homeScore}:${match.awayScore}`;

      console.log(
        `  ${"Minigrupa".padEnd(18)} ${match.home.name.padEnd(6)} ${score.padEnd(6)} ${match.away.name}   [${match.editability}]`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
