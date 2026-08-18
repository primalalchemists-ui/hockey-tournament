import type {
  BracketTeamView,
  ClassificationView,
  PlacementView,
  PlayoffRoundView,
  PlayoffScopeView,
} from "@/lib/data/postgres/playoff-engine";

/**
 * Lekkie atrapy READ MODELU dla testów renderu.
 *
 * Kształt jest pilnowany przez typy silnika, więc zmiana kontraktu
 * od razu wywala te testy — nie da się „ulepszyć” widoku w oderwaniu
 * od danych, które faktycznie do niego trafiają.
 */

export function team(id: string, name = id.toUpperCase()): BracketTeamView {
  return { teamId: id, name, logoUrl: null, logoText: null, seed: null };
}

export function round(
  overrides: Partial<PlayoffRoundView> & { kind: PlayoffRoundView["kind"] }
): PlayoffRoundView {
  return {
    label: "Półfinały",
    order: 1,
    status: "active",
    tone: "semifinal",
    matches: [],
    ...overrides,
  };
}

export function semiFinalRound(): PlayoffRoundView {
  return round({
    kind: "semifinal",
    label: "Półfinały",
    matches: [1, 2].map((slot) => ({
      externalId: `sf-${slot}`,
      kind: "semifinal" as const,
      roundOrder: 1,
      slotIndex: slot,
      home: team(`h${slot}`, `Home ${slot}`),
      away: team(`a${slot}`, `Away ${slot}`),
      provisional: false,
      homeLabel: "Zwycięzca",
      awayLabel: "Zwycięzca",
      homeScore: 3,
      awayScore: 1,
      winnerTeamId: `h${slot}`,
      isFinished: true,
    })),
  });
}

export function finalRound(): PlayoffRoundView {
  return round({
    kind: "final",
    label: "Finał",
    order: 2,
    status: "pending",
    matches: [
      {
        externalId: "final-1",
        provisional: false,
        kind: "final" as const,
        roundOrder: 2,
        slotIndex: 1,
        home: null,
        away: null,
        homeLabel: "Zwycięzca SF1",
        awayLabel: "Zwycięzca SF2",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        isFinished: false,
      },
    ],
  });
}

export function scope(overrides: Partial<PlayoffScopeView> = {}): PlayoffScopeView {
  return {
    groupKey: "A",
    groupName: "Grupa A",
    hasAnyGroupResult: true,
    ranking: [],
    teams: [],
    groupStandings: [],
    preview: null,
    snapshot: null,
    rounds: [semiFinalRound(), finalRound()],
    placement: null,
    classification: null,
    classificationSkeleton: [],
    ...overrides,
  };
}

export function classification(count: number): ClassificationView {
  return {
    complete: true,
    missing: [],
    entries: Array.from({ length: count }, (_, index) => ({
      position: index + 1,
      shared: false,
      source: "bracket",
      team: team(`t${index + 1}`, `Drużyna ${index + 1}`),
    })),
  };
}

export function placement(): PlacementView {
  return {
    teamIds: ["p1", "p2"],
    positionFrom: 5,
    positionTo: 7,
    matches: [
      {
        externalId: "pl-1",
        home: team("p1", "Piąci"),
        away: team("p2", "Szóści"),
        homeScore: null,
        awayScore: null,
      },
    ],
    standings: [
      {
        teamId: "p1",
        teamName: "Piąci",
        position: 1,
        played: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        points: 3,
        goalsFor: 4,
        goalsAgainst: 1,
        goalDifference: 3,
        isTieUnresolved: false,
        sourceOrder: 0,
      },
    ],
    complete: false,
  };
}
