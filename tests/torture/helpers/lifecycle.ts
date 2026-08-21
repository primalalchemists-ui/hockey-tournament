import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  getPlayoffState,
  savePlayoffMatchResult,
} from "@/lib/data/postgres/playoff-engine";
import type { Group, Match, Team, Tournament } from "@/types/tournament";
import type { PlayoffConfig } from "@/types/tournament-config";

import { deterministicRoundRobin } from "./scenario";

/**
 * JEDNORAZOWE TURNIEJE DO TESTÓW CYKLU ŻYCIA.
 *
 * Każdy fixture powstaje pod własnym tytułem z przedrostkiem `Vitest`,
 * przez co jego slug zaczyna się od `vitest-` i wpada pod istniejące
 * sprzątanie (`deleteOwnFixtures("vitest-", ...)`). ŻADEN test z tej
 * suite nie dotyka realnych turniejów.
 */

export const U8_CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

export function buildTeams(groupKey: string, count: number): Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${groupKey.toLowerCase()}${index + 1}`,
    name: `${groupKey}${index + 1}`,
    shortName: `${groupKey}${index + 1}`,
    logoText: `${groupKey}${index + 1}`,
    sourceOrder: index + 1,
  }));
}

export function buildPayload(input: {
  title: string;
  groupKeys: string[];
  teamCount: number;
  /** Nadpisania wyników: klucz `${groupKey}-${home}-${away}`. */
  overrides?: Map<string, { homeScore: number; awayScore: number }>;
  /** Ile pierwszych meczów każdej grupy zostawić bez wyniku. */
  omitFirst?: number;
}): Tournament {
  const groups: Group[] = input.groupKeys.map((key) => {
    const teams = buildTeams(key, input.teamCount);
    const ids = teams.map((entry) => entry.id);

    let scheduled: Match[] = deterministicRoundRobin(ids, key);

    if (input.overrides) {
      scheduled = scheduled.map((entry) => {
        const patch = input.overrides!.get(entry.id);
        return patch ? { ...entry, ...patch } : entry;
      });
    }

    if (input.omitFirst) {
      scheduled = scheduled.slice(input.omitFirst);
    }

    return { key, name: `Grupa ${key}`, teams, matches: scheduled };
  });

  return {
    id: "ignored",
    title: input.title,
    scorers: [],
    assets: {
      scheduleImage: "",
      scheduleImageType: "",
      scheduleImageName: "",
      regulationImage: "",
      regulationImageType: "",
      regulationImageName: "",
    },
    groups,
  };
}

export async function createFixture(input: {
  title: string;
  groupKeys: string[];
  teamCount: number;
  format: "league" | "group_playoff";
  config?: PlayoffConfig;
  overrides?: Map<string, { homeScore: number; awayScore: number }>;
  omitFirst?: number;
}): Promise<string> {
  const created = await postgresRepository.createTournament({
    title: input.title,
    settings: {
      structure: "groups",
      format: input.format,
      playoffConfig:
        input.format === "group_playoff" ? (input.config ?? U8_CONFIG) : null,
      scorersEnabled: false,
    },
  });

  await postgresRepository.saveTournament(
    created.id,
    buildPayload({
      title: input.title,
      groupKeys: input.groupKeys,
      teamCount: input.teamCount,
      overrides: input.overrides,
      omitFirst: input.omitFirst,
    })
  );

  return created.id;
}

/** Skrót: turniej U8 (2 × 7, top 4, mecz o 3. miejsce, minigrupa). */
export const createU8Fixture = (title: string, options?: {
  overrides?: Map<string, { homeScore: number; awayScore: number }>;
  omitFirst?: number;
  groupKeys?: string[];
}) =>
  createFixture({
    title,
    groupKeys: options?.groupKeys ?? ["A", "B"],
    teamCount: 7,
    format: "group_playoff",
    overrides: options?.overrides,
    omitFirst: options?.omitFirst,
  });

/** Skrót: turniej U10 (2 × 10, liga bez play-off). */
export const createU10Fixture = (title: string, options?: {
  overrides?: Map<string, { homeScore: number; awayScore: number }>;
  omitFirst?: number;
}) =>
  createFixture({
    title,
    groupKeys: ["A", "B"],
    teamCount: 10,
    format: "league",
    overrides: options?.overrides,
    omitFirst: options?.omitFirst,
  });

/* ==========================================================================
 * STEROWANIE PRZEBIEGIEM
 * ======================================================================== */

/** Wpisuje zwycięstwo gospodarza we wszystkich meczach danego etapu. */
export async function decideStage(
  tournamentId: string,
  predicate: (match: {
    externalId: string;
    kind: string | null;
    groupKey: string;
  }) => boolean,
  score: { home: number; away: number } = { home: 2, away: 1 }
): Promise<string[]> {
  const state = await getPlayoffState(tournamentId);
  const decided: string[] = [];

  for (const scope of state.scopes) {
    for (const round of scope.rounds) {
      for (const entry of round.matches) {
        if (!predicate({ externalId: entry.externalId, kind: round.kind, groupKey: scope.groupKey })) {
          continue;
        }
        if (!entry.home || !entry.away) continue;

        await savePlayoffMatchResult({
          tournamentId,
          matchExternalId: entry.externalId,
          homeScore: score.home,
          awayScore: score.away,
        });
        decided.push(entry.externalId);
      }
    }

    for (const entry of scope.placement?.matches ?? []) {
      if (!predicate({ externalId: entry.externalId, kind: "placement_group", groupKey: scope.groupKey })) {
        continue;
      }

      await savePlayoffMatchResult({
        tournamentId,
        matchExternalId: entry.externalId,
        homeScore: score.home,
        awayScore: score.away,
      });
      decided.push(entry.externalId);
    }
  }

  return decided;
}

/** Pełna ścieżka: zamrożenie → półfinały → finały → zakończenie. */
export async function playThroughToCompletion(tournamentId: string) {
  await completeGroupStage(tournamentId);
  await decideStage(tournamentId, (m) => m.kind === "semifinal");
  await completeCurrentRound(tournamentId);
  await decideStage(
    tournamentId,
    (m) => m.kind === "final" || m.kind === "third_place"
  );
  await decideStage(tournamentId, (m) => m.kind === "placement_group");
  await completeTournament(tournamentId);
}

/* ==========================================================================
 * ODCZYTY POMOCNICZE
 * ======================================================================== */

export async function readPhase(tournamentId: string): Promise<string> {
  const rows = await getDb()
    .select({ phase: tournaments.phase, completedAt: tournaments.completedAt })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));

  return rows[0]?.phase ?? "";
}

export async function readCompletedAt(
  tournamentId: string
): Promise<Date | null> {
  const rows = await getDb()
    .select({ completedAt: tournaments.completedAt })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));

  return rows[0]?.completedAt ?? null;
}

export async function countMatchesByStage(
  tournamentId: string,
  stage: string
): Promise<number> {
  const rows = await getDb()
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId));

  const filtered = await getDb()
    .select({ id: matches.id, stage: matches.stage })
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId));

  void rows;
  return filtered.filter((row) => row.stage === stage).length;
}

export const scopeOf = (
  state: Awaited<ReturnType<typeof getPlayoffState>>,
  groupKey: string
) => state.scopes.find((scope) => scope.groupKey === groupKey)!;
