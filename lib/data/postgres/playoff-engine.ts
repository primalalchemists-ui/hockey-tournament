import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb, type Database } from "@/lib/db/client";
import {
  bracketRounds,
  brackets,
  groups,
  matches,
  tournamentAssets,
  standingsSnapshotRows,
  standingsSnapshots,
  teams,
  tournaments,
} from "@/lib/db/schema";
import { calculateStandings } from "@/lib/standings";
import {
  resolvePlacementStandings,
  type PlacementResolution,
} from "@/lib/playoff/placement";
import type { RankingEntry } from "@/lib/playoff/aggregate-stats";
import type { Group, StandingRow, Team } from "@/types/tournament";
import {
  MAIN_POOL_KEY,
  parseTournamentSettings,
  type PlayoffConfig,
  type TournamentSettings,
} from "@/types/tournament-config";
import {
  planBracket,
  planPlacementGroup,
  type MatchSlotSource,
} from "@/lib/playoff/bracket-plan";
import {
  buildRoundKinds,
  getPreviousPhase,
  getRoundKindsForPhase,
  isBracketPhase,
  PHASE_LABELS,
  ROUND_LABELS,
  type BracketRoundKind,
  type BracketRoundStatus,
  type TournamentPhase,
} from "@/lib/playoff/phases";
import {
  buildClassificationSkeleton,
  buildFinalClassification,
  type ClassificationSlot,
} from "@/lib/playoff/classification";
import {
  buildPlayoffPreview,
  getLoser,
  getWinner,
  validateDecisiveScore,
  validateGroupStageCompletion,
  type PlayoffPreview,
} from "@/lib/playoff/rules";
import {
  buildBracketTopology,
  type TopologyRound,
} from "@/lib/playoff/topology";
import {
  describeStage,
  type StagePresentation,
  type StageTone,
} from "@/lib/playoff/stage";
import {
  aggregateTeamStats,
  buildRankingRows,
} from "@/lib/playoff/aggregate-stats";
import {
  describeMatchEditability,
  type MatchEditability,
} from "@/lib/playoff/editability";
import type {
  IssueMatch,
  IssueTeam,
  OperationIssueReport,
} from "@/lib/playoff/validation";
import { describeIssueReport } from "@/lib/playoff/validation";
import { TournamentOperationError } from "../types";
import {
  bumpPublicRevision,
  bumpPublicRevisionStatement,
} from "./public-revision";
import { buildTeam } from "./mappers";

type Statement = BatchItem<"pg">;

/* ==========================================================================
 * ODCZYT STANU
 * ======================================================================== */

/** Dane drużyny gotowe do renderu — frontend nie robi własnych lookupów. */
export type BracketTeamView = {
  teamId: string;
  name: string;
  logoUrl: string | null;
  logoText: string | null;
  /** Rozstawienie z zamrożonego rankingu; null gdy nieznane. */
  seed: number | null;
};

export type PlayoffMatchView = {
  externalId: string;
  /** true = skład wynika z niezamrożonej tabeli i może się jeszcze zmienić. */
  provisional: boolean;
  kind: BracketRoundKind;
  roundOrder: number;
  slotIndex: number;
  home: BracketTeamView | null;
  away: BracketTeamView | null;
  /** Etykieta slotu, gdy uczestnik nie jest jeszcze znany. */
  homeLabel: string;
  awayLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  isFinished: boolean;
  /**
   * Czy ten mecz wolno DZIŚ edytować w panelu.
   *
   * Liczone w silniku, nie w komponencie: to decyzja sportowa, a nie
   * kwestia prezentacji. Serwer waliduje dokładnie tę samą regułę.
   */
  editability: MatchEditability;
};

export type PlayoffRoundView = {
  kind: BracketRoundKind;
  label: string;
  order: number;
  status: string;
  /** Token tonalny rundy — prezentacja, nie logika sportowa. */
  tone: StageTone;
  matches: PlayoffMatchView[];
};

export type PlacementView = {
  teamIds: string[];
  /** Etykieta zakresu miejsc, np. "5-7" — wyliczana, nie hardkodowana. */
  positionFrom: number;
  positionTo: number;
  matches: Array<{
    externalId: string;
    home: BracketTeamView;
    away: BracketTeamView;
    homeScore: number | null;
    awayScore: number | null;
    /** Minigrupa jest edytowalna przez cały play-off — patrz editability. */
    editability: MatchEditability;
  }>;
  standings: StandingRow[];
  complete: boolean;
};

export type PlayoffScopeView = {
  groupKey: string;
  groupName: string;
  /**
   * Czy w TEJ grupie padł już jakikolwiek wynik.
   *
   * Rozstrzygane per grupa, nie globalnie: grupa A z jednym wynikiem
   * pokazuje rozstawienie, a grupa B bez wyników nadal znaki zapytania.
   */
  hasAnyGroupResult: boolean;
  /**
   * Ranking prezentowany kibicowi: KOLEJNOŚĆ zależy od etapu turnieju,
   * a LICZBY są sumą wszystkich rozegranych meczów drużyny.
   */
  ranking: StandingRow[];
  teams: Team[];
  groupStandings: StandingRow[];
  /** Dostępny wyłącznie w fazie grupowej — nigdy nie jest zapisywany. */
  preview: PlayoffPreview | null;
  /** Zamrożony ranking; null dopóki faza grupowa nie została zamknięta. */
  snapshot: Array<{ position: number; teamId: string }> | null;
  rounds: PlayoffRoundView[];
  placement: PlacementView | null;
  classification: ClassificationView | null;
  /**
   * Sloty klasyfikacji końcowej BEZ drużyn — puste podium przed
   * zakończeniem turnieju. Struktura sportowa pochodzi z silnika,
   * frontend jej nie wymyśla.
   */
  classificationSkeleton: ClassificationSlot[];
};

/** Klasyfikacja wzbogacona o dane prezentacyjne. */
export type ClassificationView = {
  complete: boolean;
  missing: string[];
  entries: Array<{
    position: number | null;
    shared: boolean;
    source: string;
    team: BracketTeamView;
  }>;
};

export type PlayoffStateView = {
  format: "league" | "group_playoff";
  phase: TournamentPhase;
  phaseLabel: string;
  /** Etap turnieju do plakietki przy Rankingu: nazwa + ton koloru. */
  stage: StagePresentation;
  groupStageFrozen: boolean;
  isCompleted: boolean;
  config: PlayoffConfig | null;
  scopes: PlayoffScopeView[];
  /** Dekoracyjne tła sekcji — null oznacza poprawny stan (fallback CSS). */
  bracketBackgroundUrl: string | null;
  podiumBackgroundUrl: string | null;
  /**
   * Stabilny token ostatniej finalizacji (ISO) — klucz ceremonii podium.
   * null dopóki turniej nie został zakończony.
   */
  completionToken: string | null;
};

/** Ładuje wszystko, co potrzebne silnikowi, w dwóch round-tripach. */
async function loadContext(db: Database, tournamentId: string) {
  const tournamentRows = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  const tournament = tournamentRows[0];

  if (!tournament) {
    throw new TournamentOperationError("Turniej nie istnieje.");
  }

  const [groupRows, teamRows, matchRows, bracketRows, roundRows, snapRows, snapRowRows, assetRows] =
    await db.batch([
      db.select().from(groups).where(eq(groups.tournamentId, tournamentId)),
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
      db.select().from(matches).where(eq(matches.tournamentId, tournamentId)),
      db.select().from(brackets).where(eq(brackets.tournamentId, tournamentId)),
      db
        .select({
          id: bracketRounds.id,
          bracketId: bracketRounds.bracketId,
          order: bracketRounds.order,
          kind: bracketRounds.kind,
          label: bracketRounds.label,
          matchCount: bracketRounds.matchCount,
          status: bracketRounds.status,
        })
        .from(bracketRounds)
        .innerJoin(brackets, eq(bracketRounds.bracketId, brackets.id))
        .where(eq(brackets.tournamentId, tournamentId)),
      db
        .select()
        .from(standingsSnapshots)
        .where(eq(standingsSnapshots.tournamentId, tournamentId)),
      db
        .select({
          id: standingsSnapshotRows.id,
          snapshotId: standingsSnapshotRows.snapshotId,
          teamId: standingsSnapshotRows.teamId,
          position: standingsSnapshotRows.position,
          // Bilans z fazy grupowej rozstrzyga remisy w minigrupie.
          goalDifference: standingsSnapshotRows.goalDifference,
        })
        .from(standingsSnapshotRows)
        .innerJoin(
          standingsSnapshots,
          eq(standingsSnapshotRows.snapshotId, standingsSnapshots.id)
        )
        .where(eq(standingsSnapshots.tournamentId, tournamentId)),
      db
        .select()
        .from(tournamentAssets)
        .where(eq(tournamentAssets.tournamentId, tournamentId)),
    ]);

  return {
    tournament,
    groups: groupRows,
    teams: teamRows,
    matches: matchRows,
    brackets: bracketRows,
    rounds: roundRows,
    snapshots: snapRows,
    snapshotRows: snapRowRows,
    assets: assetRows,
  };
}

type Context = Awaited<ReturnType<typeof loadContext>>;

/**
 * STRICT odczyt konfiguracji.
 *
 * Przy operacjach zmieniających stan turnieju nie stosujemy tolerancyjnego
 * fallbacku — uszkodzona konfiguracja musi zatrzymać operację, a nie
 * po cichu podstawić wartości domyślne.
 */
function requirePlayoffSettings(context: Context): {
  settings: TournamentSettings;
  config: PlayoffConfig;
} {
  const settings = parseTournamentSettings({
    structure: context.tournament.structure,
    format: context.tournament.format,
    playoffConfig: context.tournament.playoffConfig ?? undefined,
  });

  if (settings.format !== "group_playoff" || !settings.playoffConfig) {
    throw new TournamentOperationError(
      "Ten turniej nie jest turniejem z fazą pucharową."
    );
  }

  return { settings, config: settings.playoffConfig };
}

function buildDomainGroup(context: Context, groupRow: { id: string; key: string; name: string }): Group {
  const groupTeams = context.teams
    .filter((team) => team.groupId === groupRow.id)
    .sort((a, b) => a.sourceOrder - b.sourceOrder)
    .map((row) => buildTeam(row));

  const externalByUuid = new Map(context.teams.map((t) => [t.id, t.externalId]));

  const groupMatches = context.matches
    .filter(
      (match) =>
        match.stage === "group" &&
        match.groupId === groupRow.id &&
        match.homeScore !== null &&
        match.awayScore !== null &&
        match.homeTeamId &&
        match.awayTeamId
    )
    .sort((a, b) => a.sourceOrder - b.sourceOrder)
    .map((match) => ({
      id: match.externalId,
      group: groupRow.key,
      homeTeamId: externalByUuid.get(match.homeTeamId!)!,
      awayTeamId: externalByUuid.get(match.awayTeamId!)!,
      homeScore: match.homeScore!,
      awayScore: match.awayScore!,
    }));

  return {
    key: groupRow.key,
    name: groupRow.name,
    teams: groupTeams,
    matches: groupMatches,
  };
}

/** Buduje gotowy do renderu widok drużyny (nazwa, logo, rozstawienie). */
function makeTeamViewFactory(context: Context, seedByExternalId: Map<string, number>) {
  const byExternalId = new Map(context.teams.map((t) => [t.externalId, t]));

  return function teamView(externalId: string | null): BracketTeamView | null {
    if (!externalId) return null;

    const row = byExternalId.get(externalId);
    if (!row) return null;

    return {
      teamId: row.externalId,
      name: row.name,
      logoUrl: row.logoUrl,
      logoText: row.shortName ?? null,
      seed: seedByExternalId.get(row.externalId) ?? null,
    };
  };
}

function describeSlot(
  source: unknown,
  teamId: string | null,
  teamNameByExternalId: Map<string, string>
): string {
  if (teamId) return teamNameByExternalId.get(teamId) ?? teamId;

  const parsed = source as MatchSlotSource | null;

  if (!parsed) return "—";

  /*
    Etykieta slotu trafia WYŁĄCZNIE do aria-label — kibic widzi „?".
    Dlatego może i powinna być precyzyjna: numer meczu wyciągamy ze
    stabilnego identyfikatora (po-<scope>-<kind>-<slot>).
  */
  if (parsed.type === "seed") return `Miejsce ${parsed.seed} w grupie`;

  const slotNumber = Number(parsed.matchExternalId.split("-").pop() ?? 0) + 1;
  const roundName = parsed.matchExternalId.includes("semifinal")
    ? "półfinału"
    : parsed.matchExternalId.includes("quarterfinal")
      ? "ćwierćfinału"
      : parsed.matchExternalId.includes("round_of_16")
        ? "meczu 1/8 finału"
        : "poprzedniej rundy";

  return parsed.type === "winner"
    ? `Zwycięzca ${roundName} ${slotNumber}`
    : `Przegrany ${roundName} ${slotNumber}`;
}

/** Brak minigrupy = nie ma czego rozstrzygać. */
const EMPTY_PLACEMENT_RESOLUTION: PlacementResolution = {
  standings: [],
  unresolvedTeamIds: [],
};

export async function getPlayoffState(
  tournamentId: string
): Promise<PlayoffStateView> {
  const db = getDb();
  const context = await loadContext(db, tournamentId);

  const settings = parseTournamentSettings({
    structure: context.tournament.structure,
    format: context.tournament.format,
    playoffConfig: context.tournament.playoffConfig ?? undefined,
  });

  const phase = context.tournament.phase as TournamentPhase;
  const externalByUuid = new Map(context.teams.map((t) => [t.id, t.externalId]));
  const nameByExternal = new Map(
    context.teams.map((t) => [t.externalId, t.name])
  );

  const scopes: PlayoffScopeView[] = [];

  const sortedGroups = [...context.groups].sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true })
  );

  for (const groupRow of sortedGroups) {
    const domainGroup = buildDomainGroup(context, groupRow);
    const groupStandings = calculateStandings(domainGroup);

    const bracket = context.brackets.find((b) => b.groupId === groupRow.id);
    const snapshot = context.snapshots.find((s) => s.groupId === groupRow.id);

    const snapshotEntries = snapshot
      ? context.snapshotRows
          .filter((row) => row.snapshotId === snapshot.id)
          .sort((a, b) => a.position - b.position)
          .map((row) => ({
            position: row.position,
            teamId: externalByUuid.get(row.teamId) ?? "",
            goalDifference: row.goalDifference,
          }))
      : null;

    // Rozstawienie pochodzi ze snapshotu; przed zamrożeniem jest nieznane.
    const seedByExternalId = new Map<string, number>(
      (snapshotEntries ?? []).map((entry) => [entry.teamId, entry.position])
    );
    const teamView = makeTeamViewFactory(context, seedByExternalId);

    /* --- drabinka: PEŁNA topologia od pierwszej sekundy turnieju --- */

    /*
      Kibic widzi cały format od razu — półfinały, finał i mecz o 3. miejsce
      istnieją jako sloty, zanim ktokolwiek zagra. Uczestnicy pojawiają się
      wyłącznie tam, gdzie są NAPRAWDĘ znani.
    */
    const bracketRoundList = bracket
      ? context.rounds
          .filter((round) => round.bracketId === bracket.id)
          .sort((a, b) => a.order - b.order)
      : [];

    const roundIdSet = new Set(bracketRoundList.map((round) => round.id));

    const officialMatches = context.matches
      .filter((match) => match.bracketRoundId && roundIdSet.has(match.bracketRoundId))
      .map((match) => ({
        externalId: match.externalId,
        homeTeamId: match.homeTeamId
          ? (externalByUuid.get(match.homeTeamId) ?? null)
          : null,
        awayTeamId: match.awayTeamId
          ? (externalByUuid.get(match.awayTeamId) ?? null)
          : null,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      }));

    const roundStatusByKind = new Map(
      bracketRoundList.map((round) => [
        round.kind as BracketRoundKind,
        round.status as BracketRoundStatus,
      ])
    );

    // Pierwszy wynik W TEJ GRUPIE — nie globalny stan turnieju.
    const hasAnyGroupResult = domainGroup.matches.length > 0;

    /*
      Przed zamrożeniem rozstawienie bierzemy z bieżącej tabeli, ale dopiero
      gdy padł pierwszy wynik. Wcześniej kolejność wierszy w bazie nie ma
      żadnego znaczenia sportowego i pokazywanie jej byłoby kłamstwem.
    */
    const liveSeeding =
      hasAnyGroupResult && phase === "group_stage"
        ? new Map(groupStandings.map((row) => [row.position, row.teamId]))
        : null;

    let topology: TopologyRound[] = [];

    if (settings.format === "group_playoff" && settings.playoffConfig) {
      topology = buildBracketTopology({
        scopeKey: groupRow.key,
        size: settings.playoffConfig.qualifiedTeamCount,
        thirdPlaceMatch: settings.playoffConfig.thirdPlaceMatch,
        officialMatches,
        roundStatusByKind,
        liveSeeding,
      });
    }

    /*
      Edytowalność liczymy raz, z konfiguracji i fazy zapisanej w bazie.
      Panel admina niczego nie dedukuje sam — a serwer sprawdza tę samą
      regułę przy zapisie, więc disabled w HTML nie jest zabezpieczeniem.
    */
    const editabilityOf = (kind: BracketRoundKind): MatchEditability =>
      settings.playoffConfig
        ? describeMatchEditability({
            phase,
            size: settings.playoffConfig.qualifiedTeamCount,
            thirdPlaceMatch: settings.playoffConfig.thirdPlaceMatch,
            stage: "bracket",
            kind,
          })
        : "locked";

    const placementEditability: MatchEditability = settings.playoffConfig
      ? describeMatchEditability({
          phase,
          size: settings.playoffConfig.qualifiedTeamCount,
          thirdPlaceMatch: settings.playoffConfig.thirdPlaceMatch,
          stage: "placement_group",
        })
      : "locked";

    const rounds: PlayoffRoundView[] = topology.map((round) => ({
      kind: round.kind,
      label: round.label,
      order: round.order,
      status: round.status,
      tone: round.tone,
      matches: round.matches.map((match) => ({
        externalId: match.externalId,
        kind: match.kind,
        roundOrder: match.roundOrder,
        slotIndex: match.slotIndex,
        provisional: match.provisional,
        home: teamView(match.homeTeamId),
        away: teamView(match.awayTeamId),
        homeLabel: describeSlot(match.homeSource, null, nameByExternal),
        awayLabel: describeSlot(match.awaySource, null, nameByExternal),
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winnerTeamId: getWinner({
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        }),
        isFinished: match.homeScore !== null && match.awayScore !== null,
        editability: editabilityOf(match.kind),
      })),
    }));

    /* --- minigrupa --- */
    const placementMatches = context.matches.filter(
      (match) =>
        match.stage === "placement_group" && match.groupId === groupRow.id
    );

    let placement: PlacementView | null = null;
    let placementResolution = EMPTY_PLACEMENT_RESOLUTION;

    if (placementMatches.length > 0) {
      const placementTeamIds = Array.from(
        new Set(
          placementMatches.flatMap((match) => [
            externalByUuid.get(match.homeTeamId ?? "") ?? "",
            externalByUuid.get(match.awayTeamId ?? "") ?? "",
          ])
        )
      ).filter(Boolean);

      const placementTeams = domainGroup.teams.filter((team) =>
        placementTeamIds.includes(team.id)
      );

      // Ta sama funkcja klasyfikacji co dla zwykłej grupy — bez wyjątków.
      const placementGroup: Group = {
        key: `${groupRow.key}-placement`,
        name: "Minigrupa",
        teams: placementTeams.map((team, index) => ({
          ...team,
          // sourceOrder odzwierciedla miejsce z fazy grupowej, żeby
          // techniczny fallback przy pełnym remisie był sprawiedliwy.
          sourceOrder: index + 1,
        })),
        matches: placementMatches
          .filter((m) => m.homeScore !== null && m.awayScore !== null)
          .sort((a, b) => a.sourceOrder - b.sourceOrder)
          .map((m) => ({
            id: m.externalId,
            group: `${groupRow.key}-placement`,
            homeTeamId: externalByUuid.get(m.homeTeamId!)!,
            awayTeamId: externalByUuid.get(m.awayTeamId!)!,
            homeScore: m.homeScore!,
            awayScore: m.awayScore!,
          })),
      };

      const qualified = settings.playoffConfig?.qualifiedTeamCount ?? 0;

      /*
        JEDEN RESOLVER NA MIEJSCA POZA PODIUM.

        Minigrupa liczy się normalnie, a dopiero układ, którego tabela nie
        umie rozdzielić, dostaje regułę organizatora: decyduje bilans
        z fazy grupowej. Wynik idzie do WSZYSTKICH trzech widoków —
        minitabeli, klasyfikacji końcowej i Rankingu — więc nie ma już
        trzech niezależnych interpretacji tych samych danych.
      */
      placementResolution = resolvePlacementStandings({
        standings: calculateStandings(placementGroup),
        frozen: (snapshotEntries ?? []).map((entry) => ({
          teamId: entry.teamId,
          position: entry.position,
          goalDifference: entry.goalDifference,
        })),
      });

      placement = {
        teamIds: placementTeamIds,
        // Zakres miejsc liczony z konfiguracji — bez hardkodu "5-7".
        positionFrom: qualified + 1,
        positionTo: qualified + placementTeamIds.length,
        matches: placementMatches
          .sort((a, b) => a.sourceOrder - b.sourceOrder)
          .map((m) => ({
            externalId: m.externalId,
            home: teamView(externalByUuid.get(m.homeTeamId ?? "") ?? null)!,
            away: teamView(externalByUuid.get(m.awayTeamId ?? "") ?? null)!,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            editability: placementEditability,
          })),
        standings: placementResolution.standings,
        complete: placementMatches.every(
          (m) => m.homeScore !== null && m.awayScore !== null
        ),
      };
    }

    /* --- podgląd i klasyfikacja --- */
    const preview =
      settings.format === "group_playoff" &&
      settings.playoffConfig &&
      phase === "group_stage"
        ? buildPlayoffPreview({
            scopeKey: groupRow.key,
            standings: groupStandings,
            qualifiedTeamCount: settings.playoffConfig.qualifiedTeamCount,
          })
        : null;

    const rawClassification =
      bracket && settings.playoffConfig
        ? buildFinalClassification({
            scopeKey: groupRow.key,
            bracketMatches: rounds.flatMap((round) =>
              round.matches.map((match) => ({
                kind: round.kind,
                homeTeamId: match.home?.teamId ?? null,
                awayTeamId: match.away?.teamId ?? null,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
              }))
            ),
            thirdPlaceMatch: settings.playoffConfig.thirdPlaceMatch,
            placementStandings: placement?.standings ?? null,
            placementComplete: placement?.complete ?? true,
            /*
              Reguła bilansu nie zadziałała (np. brak zamrożonej tabeli).
              Nie udajemy wtedy oficjalnego miejsca — turniej po prostu nie
              jest jeszcze rozstrzygnięty do końca.
            */
            placementUnresolvedTeamIds: placementResolution.unresolvedTeamIds,
            /*
              Zamrożona tabela grupowa rozstrzyga dwa przypadki, w których
              nie ma meczu: przegranych półfinałów bez meczu o 3. miejsce
              oraz drużyn spoza play-off bez minigrupy. Dzięki temu po
              zakończeniu turnieju nikt nie zostaje bez miejsca.
            */
            frozenOrder: (snapshotEntries ?? []).map((entry) => entry.teamId),
          })
        : null;

    /* --- ranking całego turnieju --- */

    /*
      STATYSTYKI: suma wszystkich rozegranych meczów drużyny — grupowych,
      pucharowych, meczu o 3. miejsce i minigrupy.
      KOLEJNOŚĆ: zależy od etapu i jest ustalana niżej.
    */
    const playedBracketMatches = rounds.flatMap((round) =>
      round.matches
        .filter(
          (match) =>
            match.home && match.away && match.isFinished
        )
        .map((match) => ({
          homeTeamId: match.home!.teamId,
          awayTeamId: match.away!.teamId,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        }))
    );

    const playedPlacementMatches = (placement?.matches ?? [])
      .filter((match) => match.homeScore !== null && match.awayScore !== null)
      .map((match) => ({
        homeTeamId: match.home.teamId,
        awayTeamId: match.away.teamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      }));

    const stats = aggregateTeamStats({
      teamIds: domainGroup.teams.map((team) => team.id),
      matches: [
        ...domainGroup.matches.map((match) => ({
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        })),
        ...playedBracketMatches,
        ...playedPlacementMatches,
      ],
    });

    const presentation = new Map(
      domainGroup.teams.map((team) => [
        team.id,
        {
          teamName: team.name,
          logoText: team.logoText,
          logoUrl: team.logoUrl,
          sourceOrder: team.sourceOrder,
        },
      ])
    );

    const classification: ClassificationView | null = rawClassification
      ? {
          complete: rawClassification.complete,
          missing: rawClassification.missing,
          entries: rawClassification.entries.map((entry) => ({
            position: entry.position,
            shared: entry.shared,
            source: entry.source,
            team: teamView(entry.teamId) ?? {
              teamId: entry.teamId,
              name: entry.teamId,
              logoUrl: null,
              logoText: null,
              seed: null,
            },
          })),
        }
      : null;

    const classificationSkeleton =
      settings.format === "group_playoff" && settings.playoffConfig
        ? buildClassificationSkeleton({
            teamCount: domainGroup.teams.length,
            qualifiedTeamCount: settings.playoffConfig.qualifiedTeamCount,
            thirdPlaceMatch: settings.playoffConfig.thirdPlaceMatch,
            placementMode: settings.playoffConfig.placementMode,
          })
        : [];

    /*
      KOLEJNOŚĆ WIERSZY RANKINGU — trzy różne etapy, trzy różne źródła:

      1. faza grupowa  → calculateStandings, dokładnie jak dotąd,
      2. po zamrożeniu → zamrożony snapshot; tabela stoi w miejscu,
         chociaż liczby żyją (inaczej skakałaby po każdym meczu play-off),
      3. po zakończeniu → oficjalna klasyfikacja końcowa, żeby Ranking
         i podium opowiadały tę samą historię.

      Punkty NIGDY nie wyłaniają mistrza — o miejscu decyduje przebieg
      turnieju, a Pkt są statystyką występu.
    */
    const teamIdsInGroup = domainGroup.teams.map((team) => team.id);

    let ordered: RankingEntry[] = groupStandings.map((row) => ({
      teamId: row.teamId,
      position: row.position,
    }));

    if (phase === "completed" && classification) {
      /*
        RANKING NIE WYMYŚLA MIEJSC.

        Wcześniej wiersze bez pozycji były odfiltrowywane, a potem doklejane
        z `teamIdsInGroup` — czyli w kolejności REJESTRACJI drużyn w grupie.
        Techniczny fallback trafiał na ekran jako werdykt sportowy i tabela
        pokazywała twarde 5/6/7 tam, gdzie minitabela i podium uczciwie
        stawiały „?".

        Teraz jedynym źródłem jest klasyfikacja końcowa. Drużyna bez miejsca
        zachowuje `position: null` aż do widoku.
      */
      const classified = [...classification.entries].sort((left, right) => {
        const a = left.position ?? Number.MAX_SAFE_INTEGER;
        const b = right.position ?? Number.MAX_SAFE_INTEGER;
        return a - b;
      });

      const seen = new Set(classified.map((entry) => entry.team.teamId));

      ordered = [
        ...classified.map((entry) => ({
          teamId: entry.team.teamId,
          position: entry.position,
        })),
        // Drużyna spoza klasyfikacji też nie dostaje zmyślonego miejsca.
        ...teamIdsInGroup
          .filter((teamId) => !seen.has(teamId))
          .map((teamId) => ({ teamId, position: null })),
      ];
    } else if (snapshotEntries && snapshotEntries.length > 0) {
      const frozen = snapshotEntries.map((entry) => entry.teamId);

      // Po zamrożeniu miejsca pochodzą z oficjalnej, zapisanej tabeli.
      ordered = [
        ...snapshotEntries.map((entry) => ({
          teamId: entry.teamId,
          position: entry.position,
        })),
        ...teamIdsInGroup
          .filter((teamId) => !frozen.includes(teamId))
          .map((teamId, index) => ({
            teamId,
            position: frozen.length + index + 1,
          })),
      ];
    }

    const ranking = buildRankingRows({
      ordered,
      stats,
      presentation,
    });

    scopes.push({
      groupKey: groupRow.key,
      groupName: groupRow.name,
      hasAnyGroupResult,
      ranking,
      teams: domainGroup.teams,
      groupStandings,
      preview,
      snapshot: snapshotEntries,
      rounds,
      placement,
      classification,
      classificationSkeleton,
    });
  }

  return {
    format: settings.format,
    phase,
    phaseLabel: PHASE_LABELS[phase] ?? phase,
    stage: describeStage(phase),
    groupStageFrozen: context.snapshots.length > 0,
    isCompleted: phase === "completed",
    config: settings.playoffConfig,
    scopes,
    bracketBackgroundUrl:
      context.assets.find((a) => a.kind === "playoff_bracket_background")?.url ??
      null,
    podiumBackgroundUrl:
      context.assets.find((a) => a.kind === "podium_background")?.url ?? null,
    completionToken: context.tournament.completedAt
      ? context.tournament.completedAt.toISOString()
      : null,
  };
}

/* ==========================================================================
 * ZAKOŃCZENIE FAZY GRUPOWEJ
 * ======================================================================== */

export async function completeGroupStage(tournamentId: string) {
  const db = getDb();
  const context = await loadContext(db, tournamentId);
  const { config } = requirePlayoffSettings(context);

  if (context.tournament.phase !== "group_stage") {
    throw new TournamentOperationError(
      `Faza grupowa została już zakończona (aktualna faza: ${
        PHASE_LABELS[context.tournament.phase as TournamentPhase] ??
        context.tournament.phase
      }).`
    );
  }

  if (context.snapshots.length > 0 || context.brackets.length > 0) {
    throw new TournamentOperationError(
      "Drabinka dla tego turnieju już istnieje."
    );
  }

  const externalByUuid = new Map(context.teams.map((t) => [t.id, t.externalId]));
  const uuidByExternal = new Map(context.teams.map((t) => [t.externalId, t.id]));

  const issues: string[] = [];
  const plans: Array<{
    groupRow: (typeof context.groups)[number];
    standings: StandingRow[];
  }> = [];

  for (const groupRow of context.groups) {
    const domainGroup = buildDomainGroup(context, groupRow);
    const standings = calculateStandings(domainGroup);

    const scopeLabel =
      groupRow.key === MAIN_POOL_KEY ? "Klasyfikacja" : `Grupa ${groupRow.key}`;

    const groupIssues = validateGroupStageCompletion({
      scopeLabel,
      teamCount: domainGroup.teams.length,
      playedMatchCount: domainGroup.matches.length,
      standings,
      qualifiedTeamCount: config.qualifiedTeamCount,
    });

    for (const issue of groupIssues) {
      issues.push(`${issue.scopeLabel}: ${issue.reason}`);
    }

    plans.push({ groupRow, standings });
  }

  if (issues.length > 0) {
    // Nic nie zostało zapisane — walidacja poprzedza jakąkolwiek mutację.
    throw new TournamentOperationError(issues.join("\n"));
  }

  const statements: Statement[] = [];

  for (const { groupRow, standings } of plans) {
    /* --- snapshot --- */
    const snapshotId = randomUUID();

    statements.push(
      db.insert(standingsSnapshots).values({
        id: snapshotId,
        tournamentId,
        groupId: groupRow.id,
      }) as Statement
    );

    statements.push(
      db.insert(standingsSnapshotRows).values(
        standings.map((row) => ({
          id: randomUUID(),
          snapshotId,
          teamId: uuidByExternal.get(row.teamId)!,
          position: row.position,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          played: row.played,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
        }))
      ) as Statement
    );

    /* --- drabinka --- */
    const bracketId = randomUUID();

    statements.push(
      db.insert(brackets).values({
        id: bracketId,
        tournamentId,
        groupId: groupRow.id,
        size: config.qualifiedTeamCount,
      }) as Statement
    );

    const plan = planBracket({
      scopeKey: groupRow.key,
      size: config.qualifiedTeamCount,
      thirdPlaceMatch: config.thirdPlaceMatch,
    });

    const teamByPosition = new Map(
      standings.map((row) => [row.position, uuidByExternal.get(row.teamId)!])
    );

    let matchOrder = 1000; // poza zakresem meczów grupowych

    for (const round of plan.rounds) {
      const roundId = randomUUID();

      // Pierwsza runda startuje jako aktywna; reszta czeka jako pending,
      // żeby dało się pokazać całe drzewko z pustymi slotami.
      const status = round.order === 0 ? "active" : "pending";

      statements.push(
        db.insert(bracketRounds).values({
          id: roundId,
          bracketId,
          order: round.order,
          kind: round.kind,
          label: round.label,
          matchCount: round.matchCount,
          status,
        }) as Statement
      );

      statements.push(
        db.insert(matches).values(
          round.matches.map((match) => {
            const home =
              match.homeSource.type === "seed"
                ? (teamByPosition.get(match.homeSource.seed) ?? null)
                : null;
            const away =
              match.awaySource.type === "seed"
                ? (teamByPosition.get(match.awaySource.seed) ?? null)
                : null;

            return {
              id: randomUUID(),
              tournamentId,
              groupId: groupRow.id,
              externalId: match.externalId,
              stage: "bracket" as const,
              status: "scheduled" as const,
              homeTeamId: home,
              awayTeamId: away,
              homeScore: null,
              awayScore: null,
              bracketRoundId: roundId,
              slotIndex: match.slotIndex,
              homeSource: match.homeSource,
              awaySource: match.awaySource,
              sourceOrder: matchOrder++,
            };
          })
        ) as Statement
      );
    }

    /* --- minigrupa --- */
    if (config.placementMode === "placement_group") {
      const leftovers = standings
        .filter((row) => row.position > config.qualifiedTeamCount)
        .sort((a, b) => a.position - b.position)
        .map((row) => row.teamId);

      if (leftovers.length >= 2) {
        const placementPlan = planPlacementGroup({
          scopeKey: groupRow.key,
          teamExternalIds: leftovers,
        });

        statements.push(
          db.insert(matches).values(
            placementPlan.map((match) => ({
              id: randomUUID(),
              tournamentId,
              groupId: groupRow.id,
              externalId: match.externalId,
              stage: "placement_group" as const,
              status: "scheduled" as const,
              homeTeamId: uuidByExternal.get(match.homeTeamId)!,
              awayTeamId: uuidByExternal.get(match.awayTeamId)!,
              homeScore: null,
              awayScore: null,
              sourceOrder: 2000 + match.sourceOrder,
            }))
          ) as Statement
        );
      }
    }

    void externalByUuid;
  }

  const firstPhase = buildRoundKinds(config.qualifiedTeamCount)[0];

  statements.push(
    db
      .update(tournaments)
      .set({ phase: firstPhase, updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId)) as Statement
  );

  statements.push(bumpPublicRevisionStatement(db, tournamentId));

  // Snapshot + drabinka + minigrupa + zmiana fazy w JEDNEJ transakcji.
  await db.batch(statements as [Statement, ...Statement[]]);
}

/* ==========================================================================
 * WYNIK MECZU PUCHAROWEGO / MINIGRUPY
 * ======================================================================== */

export async function savePlayoffMatchResult(input: {
  tournamentId: string;
  matchExternalId: string;
  homeScore: number | null;
  awayScore: number | null;
}) {
  const db = getDb();
  const context = await loadContext(db, input.tournamentId);
  requirePlayoffSettings(context);

  const match = context.matches.find(
    (row) => row.externalId === input.matchExternalId
  );

  if (!match) {
    throw new TournamentOperationError("Mecz nie istnieje.");
  }

  if (match.stage === "group") {
    throw new TournamentOperationError(
      "Wyniki fazy grupowej zapisuje się przez zwykłą tabelę."
    );
  }

  /*
    GATE FAZOWY — świadomie po stronie serwera.

    `disabled` na inpucie jest wyłącznie podpowiedzią dla oka. Zapis wyniku
    finału w trakcie półfinałów musi zostać odrzucony także wtedy, gdy ktoś
    wywoła akcję bezpośrednio. Minigrupa jest wyjątkiem: to niezależna
    gałąź, aktywna od zamknięcia fazy grupowej.
  */
  const { config: gateConfig } = requirePlayoffSettings(context);
  const roundKindById = new Map(
    context.rounds.map((round) => [round.id, round.kind as BracketRoundKind])
  );

  const editability = describeMatchEditability({
    phase: context.tournament.phase as TournamentPhase,
    size: gateConfig.qualifiedTeamCount,
    thirdPlaceMatch: gateConfig.thirdPlaceMatch,
    stage: match.stage === "placement_group" ? "placement_group" : "bracket",
    kind: match.bracketRoundId
      ? roundKindById.get(match.bracketRoundId)
      : undefined,
  });

  if (editability !== "editable") {
    const roundLabel = match.bracketRoundId
      ? (ROUND_LABELS[roundKindById.get(match.bracketRoundId)!] ?? "Ten etap")
      : "Minigrupa";

    throw new TournamentOperationError(
      editability === "pending"
        ? `${roundLabel}: ten etap jeszcze się nie rozpoczął. ` +
          "Najpierw zakończ bieżącą rundę."
        : `${roundLabel}: ten etap jest już zamknięty. ` +
          "Aby poprawić wynik, cofnij turniej do poprzedniej fazy."
    );
  }

  // Play-off i minigrupa: remis jest niedozwolony.
  const validation = validateDecisiveScore(input.homeScore, input.awayScore);

  if (!validation.ok) {
    throw new TournamentOperationError(validation.reason);
  }

  if (input.homeScore !== null && (!match.homeTeamId || !match.awayTeamId)) {
    throw new TournamentOperationError(
      "Nie można wpisać wyniku, dopóki nie są znani obaj uczestnicy meczu."
    );
  }

  const externalByUuid = new Map(context.teams.map((t) => [t.id, t.externalId]));

  const previousWinner = getWinner({
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  });

  const nextWinner = getWinner({
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
  });

  /* --- ochrona integralności downstream ------------------------------- */

  const dependents = context.matches.filter((row) => {
    const sources = [row.homeSource, row.awaySource] as Array<
      MatchSlotSource | null
    >;

    return sources.some(
      (source) =>
        source &&
        (source.type === "winner" || source.type === "loser") &&
        source.matchExternalId === match.externalId
    );
  });

  if (previousWinner && previousWinner !== nextWinner) {
    const playedDependent = dependents.find(
      (row) => row.homeScore !== null && row.awayScore !== null
    );

    if (playedDependent) {
      throw new TournamentOperationError(
        "Zmiana zwycięzcy wpływa na rozegrany już kolejny etap. " +
          "Najpierw cofnij turniej do poprzedniej fazy."
      );
    }
  }

  const statements: Statement[] = [
    db
      .update(matches)
      .set({
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        status: input.homeScore === null ? "scheduled" : "finished",
      })
      .where(eq(matches.id, match.id)) as Statement,
  ];

  /* --- propagacja zwycięzcy / przegranego ------------------------------ */

  const loser = getLoser({
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
  });

  for (const dependent of dependents) {
    const patch: Record<string, string | null> = {};

    for (const side of ["home", "away"] as const) {
      const source = (side === "home"
        ? dependent.homeSource
        : dependent.awaySource) as MatchSlotSource | null;

      if (
        !source ||
        (source.type !== "winner" && source.type !== "loser") ||
        source.matchExternalId !== match.externalId
      ) {
        continue;
      }

      const resolved = source.type === "winner" ? nextWinner : loser;
      patch[side === "home" ? "homeTeamId" : "awayTeamId"] = resolved;
    }

    if (Object.keys(patch).length === 0) continue;

    statements.push(
      db.update(matches).set(patch).where(eq(matches.id, dependent.id)) as Statement
    );
  }

  void externalByUuid;

  statements.push(bumpPublicRevisionStatement(db, input.tournamentId));

  await db.batch(statements as [Statement, ...Statement[]]);
}


/* ==========================================================================
 * CZYTELNE BŁĘDY — wspólne narzędzia
 * ======================================================================== */

/** Zamienia UUID drużyny na dane prezentacyjne dla komunikatu błędu. */
function makeIssueTeamFactory(context: Context, seedByExternalId: Map<string, number>) {
  const byUuid = new Map(context.teams.map((team) => [team.id, team]));

  return function issueTeam(uuid: string | null): IssueTeam | null {
    if (!uuid) return null;

    const row = byUuid.get(uuid);
    if (!row) return null;

    return {
      name: row.name,
      logoUrl: row.logoUrl,
      logoText: row.shortName ?? null,
      seed: seedByExternalId.get(row.externalId) ?? null,
    };
  };
}

/** Rozstawienie z zamrożonych snapshotów — po externalId drużyny. */
function readSeedMap(context: Context): Map<string, number> {
  const externalByUuid = new Map(
    context.teams.map((team) => [team.id, team.externalId])
  );

  const seeds = new Map<string, number>();

  for (const row of context.snapshotRows) {
    const externalId = externalByUuid.get(row.teamId);
    if (externalId) seeds.set(externalId, row.position);
  }

  return seeds;
}

/** Nazwy grup po UUID — komunikat grupuje mecze tak, jak widzi je admin. */
function readGroupNames(context: Context): Map<string, string> {
  return new Map(context.groups.map((group) => [group.id, group.name]));
}

/** Jeden błąd operacji: tekst zapasowy + struktura dla panelu. */
function issueError(report: OperationIssueReport): TournamentOperationError {
  return new TournamentOperationError(describeIssueReport(report), report);
}

/* ==========================================================================
 * ZAKOŃCZENIE RUNDY
 * ======================================================================== */

export async function completeCurrentRound(tournamentId: string) {
  const db = getDb();
  const context = await loadContext(db, tournamentId);
  const { config } = requirePlayoffSettings(context);

  const phase = context.tournament.phase as TournamentPhase;

  if (!isBracketPhase(phase)) {
    throw new TournamentOperationError(
      phase === "group_stage"
        ? "Najpierw zakończ fazę grupową."
        : "Turniej jest już zakończony."
    );
  }

  const kinds = getRoundKindsForPhase(phase, config.thirdPlaceMatch);
  const roundIds = context.rounds
    .filter((round) => kinds.includes(round.kind as BracketRoundKind))
    .map((round) => round.id);

  const roundMatches = context.matches.filter(
    (match) => match.bracketRoundId && roundIds.includes(match.bracketRoundId)
  );

  /*
    Braki opisujemy DRUŻYNAMI, nie identyfikatorami meczów. Administrator
    w hali musi od razu wiedzieć, którego meczu szukać — „po-B-semifinal-0"
    tego nie mówi.
  */
  const issueTeam = makeIssueTeamFactory(context, readSeedMap(context));
  const groupNames = readGroupNames(context);
  const roundKindById = new Map(
    context.rounds.map((round) => [round.id, round.kind as BracketRoundKind])
  );

  const problems: IssueMatch[] = [];

  for (const match of roundMatches) {
    const kind = match.bracketRoundId
      ? roundKindById.get(match.bracketRoundId)
      : undefined;

    const base = {
      groupName: groupNames.get(match.groupId ?? "") ?? "Turniej",
      roundLabel: kind ? ROUND_LABELS[kind] : "Faza pucharowa",
      home: issueTeam(match.homeTeamId),
      away: issueTeam(match.awayTeamId),
    };

    if (!match.homeTeamId || !match.awayTeamId) {
      problems.push({ ...base, reason: "unknown_participants" });
      continue;
    }

    if (match.homeScore === null || match.awayScore === null) {
      problems.push({ ...base, reason: "missing_result" });
      continue;
    }

    if (match.homeScore === match.awayScore) {
      problems.push({ ...base, reason: "draw" });
    }
  }

  if (problems.length > 0) {
    throw issueError({
      title: `Nie można zakończyć etapu: ${PHASE_LABELS[phase].toLowerCase()}`,
      hint: "Uzupełnij wyniki poniższych meczów:",
      matches: problems,
    });
  }

  const nextPhase = phase === "final" ? "completed" : nextBracketPhase(phase, config);

  if (nextPhase === "completed") {
    throw new TournamentOperationError(
      "Finały kończy operacja „Zakończ turniej”."
    );
  }

  const nextKinds = getRoundKindsForPhase(nextPhase, config.thirdPlaceMatch);

  const statements: Statement[] = [
    db
      .update(bracketRounds)
      .set({ status: "completed" })
      .where(inArray(bracketRounds.id, roundIds)) as Statement,
  ];

  const nextRoundIds = context.rounds
    .filter((round) => nextKinds.includes(round.kind as BracketRoundKind))
    .map((round) => round.id);

  if (nextRoundIds.length > 0) {
    statements.push(
      db
        .update(bracketRounds)
        .set({ status: "active" })
        .where(inArray(bracketRounds.id, nextRoundIds)) as Statement
    );
  }

  /**
   * Odtworzenie uczestników kolejnej rundy.
   *
   * Zwykle propagacja dzieje się już przy zapisie wyniku, ale po cofnięciu
   * fazy sloty pochodne są celowo czyszczone. Gdyby admin nie ruszył wtedy
   * wyników, kolejna runda zostałaby bez uczestników — dlatego zamknięcie
   * rundy zawsze domyka propagację.
   */
  for (const source of roundMatches) {
    const winner = getWinner({
      homeTeamId: source.homeTeamId,
      awayTeamId: source.awayTeamId,
      homeScore: source.homeScore,
      awayScore: source.awayScore,
    });
    const loser = getLoser({
      homeTeamId: source.homeTeamId,
      awayTeamId: source.awayTeamId,
      homeScore: source.homeScore,
      awayScore: source.awayScore,
    });

    for (const dependent of context.matches) {
      // Nie nadpisujemy meczów, które mają już własny wynik.
      if (dependent.homeScore !== null && dependent.awayScore !== null) continue;

      const patch: Record<string, string | null> = {};

      for (const side of ["home", "away"] as const) {
        const slot = (side === "home"
          ? dependent.homeSource
          : dependent.awaySource) as MatchSlotSource | null;

        if (
          !slot ||
          (slot.type !== "winner" && slot.type !== "loser") ||
          slot.matchExternalId !== source.externalId
        ) {
          continue;
        }

        patch[side === "home" ? "homeTeamId" : "awayTeamId"] =
          slot.type === "winner" ? winner : loser;
      }

      if (Object.keys(patch).length === 0) continue;

      statements.push(
        db
          .update(matches)
          .set(patch)
          .where(eq(matches.id, dependent.id)) as Statement
      );
    }
  }

  statements.push(
    db
      .update(tournaments)
      .set({ phase: nextPhase, updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId)) as Statement
  );

  statements.push(bumpPublicRevisionStatement(db, tournamentId));

  await db.batch(statements as [Statement, ...Statement[]]);
}

function nextBracketPhase(
  phase: TournamentPhase,
  config: PlayoffConfig
): TournamentPhase {
  const kinds = buildRoundKinds(config.qualifiedTeamCount);
  const index = kinds.indexOf(phase as BracketRoundKind);

  if (index === -1 || index === kinds.length - 1) return "completed";

  return kinds[index + 1] as TournamentPhase;
}

/* ==========================================================================
 * ZAKOŃCZENIE TURNIEJU
 * ======================================================================== */

export async function completeTournament(tournamentId: string) {
  const db = getDb();
  const context = await loadContext(db, tournamentId);
  const { config } = requirePlayoffSettings(context);

  const phase = context.tournament.phase as TournamentPhase;

  if (phase === "completed") {
    throw new TournamentOperationError("Turniej jest już zakończony.");
  }

  if (phase !== "final") {
    throw new TournamentOperationError(
      "Najpierw zakończ wcześniejsze rundy fazy pucharowej."
    );
  }

  const finalKinds = getRoundKindsForPhase("final", config.thirdPlaceMatch);
  const finalRoundIds = context.rounds
    .filter((round) => finalKinds.includes(round.kind as BracketRoundKind))
    .map((round) => round.id);

  const issueTeam = makeIssueTeamFactory(context, readSeedMap(context));
  const groupNames = readGroupNames(context);
  const roundKindById = new Map(
    context.rounds.map((round) => [round.id, round.kind as BracketRoundKind])
  );

  const problems: IssueMatch[] = [];

  for (const match of context.matches) {
    const isFinalMatch =
      match.bracketRoundId && finalRoundIds.includes(match.bracketRoundId);
    const isPlacement = match.stage === "placement_group";

    if (!isFinalMatch && !isPlacement) continue;

    const kind =
      !isPlacement && match.bracketRoundId
        ? roundKindById.get(match.bracketRoundId)
        : undefined;

    const base = {
      groupName: groupNames.get(match.groupId ?? "") ?? "Turniej",
      roundLabel: isPlacement
        ? "Minigrupa klasyfikacyjna"
        : kind
          ? ROUND_LABELS[kind]
          : "Finały",
      home: issueTeam(match.homeTeamId),
      away: issueTeam(match.awayTeamId),
    };

    if (match.homeScore === null || match.awayScore === null) {
      problems.push({ ...base, reason: "missing_result" });
      continue;
    }

    if (match.homeScore === match.awayScore) {
      problems.push({ ...base, reason: "draw" });
    }
  }

  if (problems.length > 0) {
    /*
      Minigrupa NIE blokuje zamknięcia rundy pucharowej, ale blokuje
      zakończenie turnieju: bez niej klasyfikacja końcowa miałaby dziurę
      na miejscach 5-N.
    */
    throw issueError({
      title: "Nie można zakończyć turnieju",
      hint: "Uzupełnij wyniki poniższych meczów:",
      matches: problems,
    });
  }

  await db.batch([
    db
      .update(bracketRounds)
      .set({ status: "completed" })
      .where(inArray(bracketRounds.id, finalRoundIds)),
    db
      .update(tournaments)
      .set({
        phase: "completed",
        // Token ceremonii podium: nowa finalizacja => nowy reveal.
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, tournamentId)),
    bumpPublicRevisionStatement(db, tournamentId),
  ]);
}

/* ==========================================================================
 * COFANIE FAZY
 * ======================================================================== */

export type ReopenImpact = {
  targetPhase: TournamentPhase;
  targetLabel: string;
  /** Ile już wpisanych wyników zostanie skasowanych. */
  resultsToDiscard: number;
  removesBracket: boolean;
};

/** Podgląd skutków cofnięcia — UI musi go pokazać PRZED wykonaniem. */
export async function describeReopen(
  tournamentId: string
): Promise<ReopenImpact> {
  const db = getDb();
  const context = await loadContext(db, tournamentId);
  const { config } = requirePlayoffSettings(context);

  const phase = context.tournament.phase as TournamentPhase;
  const target = getPreviousPhase(phase, config.qualifiedTeamCount);

  if (!target) {
    throw new TournamentOperationError("Nie ma wcześniejszej fazy.");
  }

  if (target === "group_stage") {
    const played = context.matches.filter(
      (match) =>
        match.stage !== "group" &&
        match.homeScore !== null &&
        match.awayScore !== null
    ).length;

    return {
      targetPhase: target,
      targetLabel: PHASE_LABELS[target],
      resultsToDiscard: played,
      removesBracket: true,
    };
  }

  const kinds = getRoundKindsForPhase(phase, config.thirdPlaceMatch);
  const roundIds = context.rounds
    .filter((round) => kinds.includes(round.kind as BracketRoundKind))
    .map((round) => round.id);

  const played = context.matches.filter(
    (match) =>
      match.bracketRoundId &&
      roundIds.includes(match.bracketRoundId) &&
      match.homeScore !== null &&
      match.awayScore !== null
  ).length;

  return {
    targetPhase: target,
    targetLabel: PHASE_LABELS[target],
    resultsToDiscard: played,
    removesBracket: false,
  };
}

/**
 * Cofnięcie do poprzedniej fazy.
 *
 * Wymaga jawnego potwierdzenia, gdy operacja skasuje już wpisane wyniki.
 * NIGDY nie usuwa wyników fazy grupowej.
 */
export async function reopenPreviousPhase(input: {
  tournamentId: string;
  confirmDataLoss: boolean;
}) {
  const db = getDb();
  const context = await loadContext(db, input.tournamentId);
  const { config } = requirePlayoffSettings(context);

  const phase = context.tournament.phase as TournamentPhase;
  const impact = await describeReopen(input.tournamentId);

  if (impact.resultsToDiscard > 0 && !input.confirmDataLoss) {
    throw new TournamentOperationError(
      `Cofnięcie usunie ${impact.resultsToDiscard} wpisanych wyników. ` +
        "Operacja wymaga jawnego potwierdzenia."
    );
  }

  const statements: Statement[] = [];

  if (impact.targetPhase === "group_stage") {
    // Pełny demontaż: drabinka, minigrupa i snapshot znikają.
    // Wyniki fazy grupowej pozostają NIETKNIĘTE.
    const bracketIds = context.brackets.map((bracket) => bracket.id);

    statements.push(
      db
        .delete(matches)
        .where(
          and(
            eq(matches.tournamentId, input.tournamentId),
            inArray(matches.stage, ["bracket", "placement_group"])
          )
        ) as Statement
    );

    if (bracketIds.length > 0) {
      statements.push(
        db.delete(brackets).where(inArray(brackets.id, bracketIds)) as Statement
      );
    }

    statements.push(
      db
        .delete(standingsSnapshots)
        .where(eq(standingsSnapshots.tournamentId, input.tournamentId)) as Statement
    );
  } else {
    // Cofnięcie o jedną rundę: zerujemy wyniki i wyprowadzonych uczestników
    // bieżącej fazy, wcześniejsze rundy zostają nietknięte.
    const kinds = getRoundKindsForPhase(phase, config.thirdPlaceMatch);
    const roundIds = context.rounds
      .filter((round) => kinds.includes(round.kind as BracketRoundKind))
      .map((round) => round.id);

    const affected = context.matches.filter(
      (match) => match.bracketRoundId && roundIds.includes(match.bracketRoundId)
    );

    for (const match of affected) {
      const patch: Record<string, unknown> = {
        homeScore: null,
        awayScore: null,
        status: "scheduled",
      };

      // Uczestnik wyprowadzony z poprzedniej rundy znika; rozstawiony
      // z fazy grupowej (seed) zostaje.
      const homeSource = match.homeSource as MatchSlotSource | null;
      const awaySource = match.awaySource as MatchSlotSource | null;

      if (homeSource && homeSource.type !== "seed") patch.homeTeamId = null;
      if (awaySource && awaySource.type !== "seed") patch.awayTeamId = null;

      statements.push(
        db.update(matches).set(patch).where(eq(matches.id, match.id)) as Statement
      );
    }

    if (roundIds.length > 0) {
      statements.push(
        db
          .update(bracketRounds)
          .set({ status: "pending" })
          .where(inArray(bracketRounds.id, roundIds)) as Statement
      );
    }

    const targetKinds = getRoundKindsForPhase(
      impact.targetPhase,
      config.thirdPlaceMatch
    );
    const targetRoundIds = context.rounds
      .filter((round) => targetKinds.includes(round.kind as BracketRoundKind))
      .map((round) => round.id);

    if (targetRoundIds.length > 0) {
      statements.push(
        db
          .update(bracketRounds)
          .set({ status: "active" })
          .where(inArray(bracketRounds.id, targetRoundIds)) as Statement
      );
    }
  }

  statements.push(
    db
      .update(tournaments)
      .set({
        phase: impact.targetPhase,
        // Cofnięcie unieważnia poprzednią finalizację.
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tournaments.id, input.tournamentId)) as Statement
  );

  statements.push(bumpPublicRevisionStatement(db, input.tournamentId));

  await db.batch(statements as [Statement, ...Statement[]]);
}

/* ==========================================================================
 * DEKORACYJNE TŁA SEKCJI PLAY-OFF
 * ======================================================================== */

export type PlayoffAssetKind =
  | "playoff_bracket_background"
  | "podium_background";

/**
 * Zapisuje lub usuwa dekoracyjne tło sekcji play-off.
 *
 * Plik trafia do Cloudinary istniejącym flow (/api/admin/upload); tutaj
 * utrwalamy wyłącznie URL i public_id, per turniej. Brak assetu jest
 * poprawnym stanem — frontend ma wtedy neutralny fallback CSS.
 */
export async function setPlayoffAsset(input: {
  tournamentId: string;
  kind: PlayoffAssetKind;
  asset: {
    url: string;
    publicId: string | null;
    mimeType: string | null;
    fileName: string | null;
  } | null;
}) {
  const db = getDb();

  if (!input.asset) {
    await db
      .delete(tournamentAssets)
      .where(
        and(
          eq(tournamentAssets.tournamentId, input.tournamentId),
          eq(tournamentAssets.kind, input.kind)
        )
      );

    await bumpPublicRevision(db, input.tournamentId);
    return;
  }

  await db
    .insert(tournamentAssets)
    .values({
      id: randomUUID(),
      tournamentId: input.tournamentId,
      kind: input.kind,
      url: input.asset.url,
      mimeType: input.asset.mimeType,
      fileName: input.asset.fileName,
      publicId: input.asset.publicId,
    })
    .onConflictDoUpdate({
      target: [tournamentAssets.tournamentId, tournamentAssets.kind],
      set: {
        url: input.asset.url,
        mimeType: input.asset.mimeType,
        fileName: input.asset.fileName,
        publicId: input.asset.publicId,
      },
    });

  await bumpPublicRevision(db, input.tournamentId);
}
