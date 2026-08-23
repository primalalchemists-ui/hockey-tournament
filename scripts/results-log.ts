/**
 * REJESTRATOR WYNIKÓW — WYŁĄCZNIE ODCZYT.
 *
 * Baza nie zapisuje, kiedy wynik został wpisany: tabela `matches` nie ma
 * ani `created_at`, ani `updated_at`, a jedyny znacznik czasu w turnieju to
 * moment ostatniego zapisu, nadpisywany za każdym razem. Dlatego pytanie
 * „jak rosła liczba wyników od rana do wieczora" jest z samej bazy
 * nieodtwarzalne — po fakcie nie ma już czego liczyć.
 *
 * Ten skrypt robi jedno: co kilka minut odczytuje stan i dopisuje go do
 * dwóch plików. Nie modyfikuje niczego, nie tworzy tabel, nie wymaga
 * wdrożenia i nie dotyka działającej aplikacji.
 *
 *   plik .csv   — jedna linia na próbkę: godzina i liczniki. Do wykresu.
 *   plik .jsonl — jedna linia na próbkę: KOMPLET wyników w tej chwili.
 *                 To jest zarazem kopia zapasowa: gdyby coś przepadło,
 *                 jest z czego odtworzyć zamiast przepisywać z kartek.
 *
 * Pisze tylko wtedy, gdy coś się zmieniło, więc plik nie puchnie od
 * identycznych wierszy w przerwach między meczami.
 *
 *   npm run results:log                    # bieżący turniej publiczny, co 5 min
 *   npm run results:log -- U10             # turniej po fragmencie nazwy
 *   npm run results:log -- U10 60          # co 60 sekund
 *
 * Zatrzymanie: Ctrl+C. Pliki lądują w katalogu `logs/`.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { eq, ilike } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

const DEFAULT_INTERVAL_SECONDS = 300;
const LOG_DIR = "logs";

type Sample = {
  takenAt: string;
  tournament: string;
  totalMatches: number;
  scored: number;
  perGroup: Array<{ key: string; scored: number; total: number }>;
  results: Array<{
    group: string;
    home: string;
    away: string;
    score: string;
  }>;
};

async function readSample(needle: string | null): Promise<Sample | null> {
  const { getDb } = await import("@/lib/db/client");
  const { groups, matches, teams, tournaments } = await import(
    "@/lib/db/schema"
  );

  const db = getDb();

  /*
    Bez argumentu bierzemy turniej pokazywany publicznie — to ten, który
    jest właśnie rozgrywany. Z argumentem szukamy po fragmencie nazwy,
    żeby nie trzeba było przepisywać UUID-a.
  */
  const rows = await db
    .select({ id: tournaments.id, title: tournaments.title })
    .from(tournaments)
    .where(
      needle
        ? ilike(tournaments.title, `%${needle}%`)
        : eq(tournaments.isCurrent, true)
    )
    .limit(1);

  const tournament = rows[0];
  if (!tournament) return null;

  const [groupRows, teamRows, matchRows] = await Promise.all([
    db
      .select({ id: groups.id, key: groups.key })
      .from(groups)
      .where(eq(groups.tournamentId, tournament.id)),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tournamentId, tournament.id)),
    db
      .select({
        groupId: matches.groupId,
        stage: matches.stage,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
      })
      .from(matches)
      .where(eq(matches.tournamentId, tournament.id)),
  ]);

  const groupKeyById = new Map(groupRows.map((row) => [row.id, row.key]));
  const teamNameById = new Map(teamRows.map((row) => [row.id, row.name]));

  const scoredRows = matchRows.filter((row) => row.homeScore !== null);

  return {
    takenAt: new Date().toISOString(),
    tournament: tournament.title,
    totalMatches: matchRows.length,
    scored: scoredRows.length,
    perGroup: groupRows
      .map((group) => ({
        key: group.key,
        scored: scoredRows.filter((row) => row.groupId === group.id).length,
        total: matchRows.filter((row) => row.groupId === group.id).length,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    results: scoredRows
      .map((row) => ({
        group: groupKeyById.get(row.groupId ?? "") ?? row.stage,
        home: teamNameById.get(row.homeTeamId ?? "") ?? "?",
        away: teamNameById.get(row.awayTeamId ?? "") ?? "?",
        score: `${row.homeScore}:${row.awayScore}`,
      }))
      .sort(
        (left, right) =>
          left.group.localeCompare(right.group) ||
          left.home.localeCompare(right.home)
      ),
  };
}

/** Nazwa pliku bez znaków, które Windows odrzuca. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function localStamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", { hour12: false });
}

async function main() {
  const [needleArg, intervalArg] = process.argv.slice(2);
  const needle = needleArg?.trim() ? needleArg.trim() : null;

  const intervalSeconds = Number(intervalArg) || DEFAULT_INTERVAL_SECONDS;

  const first = await readSample(needle);

  if (!first) {
    console.error(
      needle
        ? `Nie znalazłem turnieju pasującego do "${needle}".`
        : "Żaden turniej nie jest oznaczony jako publiczny."
    );
    process.exitCode = 1;
    return;
  }

  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

  const day = new Date().toISOString().slice(0, 10);
  const base = join(LOG_DIR, `${slugify(first.tournament)}-${day}`);
  const csvPath = `${base}.csv`;
  const jsonlPath = `${base}.jsonl`;

  if (!existsSync(csvPath)) {
    appendFileSync(csvPath, "godzina;razem;z_wynikiem;grupy\n", "utf8");
  }

  console.log(`Turniej:   ${first.tournament}`);
  console.log(`Zapisuję:  ${csvPath}`);
  console.log(`Kopia:     ${jsonlPath}`);
  console.log(`Co ${intervalSeconds} s. Zatrzymanie: Ctrl+C.\n`);

  /*
    Pamiętamy ostatnią zapisaną liczbę wyników. Identyczna próbka nie trafia
    do pliku — w przerwie między meczami nie ma sensu dopisywać co pięć minut
    tego samego wiersza. Pierwsza próbka zapisuje się zawsze, jako punkt zero.
  */
  let lastScored = -1;

  const write = (sample: Sample) => {
    const perGroup = sample.perGroup
      .map((group) => `${group.key}:${group.scored}/${group.total}`)
      .join(" ");

    if (sample.scored !== lastScored) {
      appendFileSync(
        csvPath,
        `${localStamp(sample.takenAt)};${sample.totalMatches};${sample.scored};${perGroup}\n`,
        "utf8"
      );
      appendFileSync(jsonlPath, `${JSON.stringify(sample)}\n`, "utf8");
      lastScored = sample.scored;
    }

    console.log(
      `${localStamp(sample.takenAt)}  ${String(sample.scored).padStart(3)} / ${sample.totalMatches}   ${perGroup}`
    );
  };

  write(first);

  const timer = setInterval(() => {
    void readSample(needle)
      .then((sample) => {
        if (sample) write(sample);
      })
      .catch((error) => {
        /*
          Chwilowa utrata sieci nie może przerwać rejestracji — kolejna
          próbka za kilka minut zwykle wchodzi normalnie.
        */
        console.warn(
          `${localStamp(new Date().toISOString())}  odczyt nieudany:`,
          error instanceof Error ? error.message : error
        );
      });
  }, intervalSeconds * 1000);

  const stop = () => {
    clearInterval(timer);
    console.log(`\nZatrzymano. Dane w ${csvPath}`);
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main();
