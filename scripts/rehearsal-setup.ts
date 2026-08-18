/**
 * PLAYOFF REHEARSAL — MANUAL.
 *
 * Jeden turniej do ręcznej próby generalnej całego produktu: 2 grupy
 * po 7 drużyn o wyraźnie testowych nazwach (A1..A7, B1..B7), format
 * z play-offem dokładnie jak SUN CUP U8, ale BEZ jego danych.
 *
 * Skrypt zostawia turniej w jednym konkretnym momencie:
 *
 *   faza grupowa rozegrana w całości → phase nadal "group_stage".
 *
 * Dalsze kroki (Zakończ fazę grupową, półfinały, minigrupa, finał,
 * celebracja) należą do człowieka — skrypt ich NIE wykonuje.
 *
 * Bezpieczeństwo:
 *   - idempotentny: drugi przebieg nie tworzy drugiego turnieju,
 *   - jeżeli faza grupowa jest już zamknięta (albo trwa play-off),
 *     skrypt NIE RUSZA niczego i kończy się komunikatem,
 *   - nigdy nie ustawia turnieju jako publicznego,
 *   - nie dotyka SUN CUP ani Rabbit Cupa.
 *
 *   npm run rehearsal:setup -- --dry-run
 *   npm run rehearsal:setup
 */

import { eq } from "drizzle-orm";

import { loadEnvFile } from "@/lib/db/load-env";

loadEnvFile();

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { calculatePlannedMatchCount } from "@/lib/playoff/planned-matches";
import { calculateStandings } from "@/lib/standings";
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { TournamentSettings } from "@/types/tournament-config";

const DRY_RUN = process.argv.includes("--dry-run");

export const REHEARSAL_TITLE = "PLAYOFF REHEARSAL — MANUAL";
export const REHEARSAL_SLUG = "playoff-rehearsal-manual";

/** Konfiguracja lustrzana wobec SUN CUP U8. */
export const REHEARSAL_SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "group_playoff",
  scorersEnabled: false,
  playoffConfig: {
    qualifiedTeamCount: 4,
    thirdPlaceMatch: true,
    placementMode: "placement_group",
    tieBreaker: "penalties",
  },
};

const GROUP_KEYS = ["A", "B"] as const;
const TEAMS_PER_GROUP = 7;

function buildTeams(groupKey: string): Team[] {
  return Array.from({ length: TEAMS_PER_GROUP }, (_, index) => ({
    id: `${groupKey.toLowerCase()}${index + 1}`,
    name: `${groupKey}${index + 1}`,
    shortName: `${groupKey}${index + 1}`,
    logoText: `${groupKey}${index + 1}`,
    sourceOrder: index + 1,
  }));
}

/**
 * TERMINARZ Z WYNIKAMI — w pełni deterministyczny.
 *
 * Drużyna o niższym numerze zawsze wygrywa, a rozmiar zwycięstwa rośnie
 * wraz z różnicą klasy. Dzięki temu:
 *
 *   - kolejność 1..7 jest jednoznaczna (7-i zwycięstw),
 *   - przy odcięciu 4/5 nie ma żadnego remisu do rozstrzygania,
 *   - bilans bramek też układa się malejąco, więc tabela jest czytelna.
 *
 * Gospodarza wybieramy naprzemiennie, żeby terminarz wyglądał jak
 * normalna rozpiska, a nie jak lista meczów jednej drużyny u siebie.
 */
export function buildScoredRoundRobin(groupKey: string, teams: Team[]): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const gap = j - i;
      const strongerGoals = Math.min(2 + gap, 6);
      const weakerGoals = gap === 1 ? 1 : 0;

      // Silniejszy gra u siebie tylko w co drugim meczu.
      const strongerAtHome = (i + j) % 2 === 0;

      const homeTeam = strongerAtHome ? teams[i] : teams[j];
      const awayTeam = strongerAtHome ? teams[j] : teams[i];

      result.push({
        id: `${groupKey}-${homeTeam.id}-${awayTeam.id}`,
        group: groupKey,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: strongerAtHome ? strongerGoals : weakerGoals,
        awayScore: strongerAtHome ? weakerGoals : strongerGoals,
      });
    }
  }

  return result;
}

export function buildRehearsalPayload(): Tournament {
  const groups: Group[] = GROUP_KEYS.map((key) => {
    const teams = buildTeams(key);

    return {
      key,
      name: `Grupa ${key}`,
      teams,
      matches: buildScoredRoundRobin(key, teams),
    };
  });

  return {
    id: "ignored",
    title: REHEARSAL_TITLE,
    scorers: [],
    assets: {},
    groups,
  };
}

/**
 * DECYZJA SETUPU — czysta funkcja, żeby dało się ją przetestować bez bazy.
 *
 * Kluczowa reguła: turniej, w którym faza grupowa została już zamknięta,
 * jest w rękach użytkownika. Ponowny setup go NIE RESETUJE.
 */
export function planRehearsalSetup(
  current: { phase: string } | null
): "create" | "refresh" | "skip" {
  if (!current) return "create";
  if (current.phase !== "group_stage") return "skip";

  return "refresh";
}

async function main() {
  const db = getDb();

  const existing = await db
    .select({
      id: tournaments.id,
      slug: tournaments.slug,
      phase: tournaments.phase,
      isCurrent: tournaments.isCurrent,
    })
    .from(tournaments)
    .where(eq(tournaments.slug, REHEARSAL_SLUG))
    .limit(1);

  const current = existing[0] ?? null;
  const plan = planRehearsalSetup(current);

  console.log("=".repeat(64));
  console.log("PLAYOFF REHEARSAL — MANUAL");
  console.log("=".repeat(64));

  if (plan === "skip" && current) {
    /*
      Turniej jest już w rękach użytkownika. Ponowny setup NIE MOŻE
      cofnąć ręcznie wpisanych wyników play-off ani przestawić fazy.
    */
    console.log(`turniej istnieje i jest w fazie: ${current.phase}`);
    console.log("ręczna próba już trwa — skrypt niczego nie zmienia.");
    return;
  }

  const payload = buildRehearsalPayload();

  const planned = calculatePlannedMatchCount({
    format: REHEARSAL_SETTINGS.format,
    playoffConfig: REHEARSAL_SETTINGS.playoffConfig,
    scopes: payload.groups.map((group) => ({ teamCount: group.teams.length })),
  });

  if (DRY_RUN) {
    console.log(current ? "istnieje (faza grupowa)" : "zostanie utworzony");
    console.log(`grupy: ${payload.groups.length} x ${TEAMS_PER_GROUP} drużyn`);
    console.log(
      `mecze grupowe: ${payload.groups.reduce((sum, g) => sum + g.matches.length, 0)}`
    );
    console.log(`planowanych meczów całego turnieju: ${planned}`);
    printExpectedStandings(payload);
    return;
  }

  const tournamentId =
    current?.id ??
    (
      await postgresRepository.createTournament({
        title: REHEARSAL_TITLE,
        settings: REHEARSAL_SETTINGS,
      })
    ).id;

  await postgresRepository.saveTournament(tournamentId, payload);

  const after = await db
    .select({
      slug: tournaments.slug,
      phase: tournaments.phase,
      isCurrent: tournaments.isCurrent,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  console.log(current ? "zaktualizowany" : "utworzony");
  console.log(`id: ${tournamentId}`);
  console.log(`slug: ${after[0].slug}`);
  console.log(`faza: ${after[0].phase}`);
  console.log(`wyświetlany publicznie: ${after[0].isCurrent ? "TAK" : "nie"}`);
  console.log(`planowanych meczów: ${planned}`);

  printExpectedStandings(payload);

  console.log("");
  console.log("Faza grupowa NIE została zamknięta — to należy do Ciebie.");
}

/** Podgląd tabel, żeby raport i panel pokazywały to samo. */
function printExpectedStandings(payload: Tournament) {
  for (const group of payload.groups) {
    console.log("");
    console.log(`${group.name}:`);

    const rows = calculateStandings(group);

    for (const row of rows) {
      console.log(
        `  ${row.position}. ${row.teamName}` +
          `  ${row.points} pkt  ${row.goalsFor}:${row.goalsAgainst}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
