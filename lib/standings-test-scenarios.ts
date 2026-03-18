import type { Group, Match } from "@/types/tournament";
import {
  ACTIVE_STANDINGS_TEST_SCENARIO,
  STANDINGS_TEST_GROUP_NAME,
  STANDINGS_TEST_MODE,
} from "@/lib/standings-test-config";

export type StandingsTestScenarioKey =
  | "default"
  | "test-points"
  | "test-direct-match"
  | "test-goal-difference"
  | "test-goals-for"
  | "test-unresolved-tie-2"
  | "test-three-way-tie"
  | "test-unresolved-tie-3";

function makeMatch(
  id: string,
  group: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number
): Match {
  return {
    id,
    group,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
  };
}

function getTeamIds(group: Group) {
  return {
    t1: group.teams[0]?.id,
    t2: group.teams[1]?.id,
    t3: group.teams[2]?.id,
    t4: group.teams[3]?.id,
    t5: group.teams[4]?.id,
    t6: group.teams[5]?.id,
    t7: group.teams[6]?.id,
    t8: group.teams[7]?.id,
    t9: group.teams[8]?.id,
  };
}

function makeKey(a: string, b: string) {
  return [a, b].sort().join("__");
}

function buildCompleteScenario(
  group: Group,
  topFourMatches: Array<[string, string, number, number]>
): Match[] {
  const ids = getTeamIds(group);

  if (
    !ids.t1 ||
    !ids.t2 ||
    !ids.t3 ||
    !ids.t4 ||
    !ids.t5 ||
    !ids.t6 ||
    !ids.t7 ||
    !ids.t8 ||
    !ids.t9
  ) {
    return group.matches;
  }

  const groupKey = group.key;
  const allTeams = [
    ids.t1,
    ids.t2,
    ids.t3,
    ids.t4,
    ids.t5,
    ids.t6,
    ids.t7,
    ids.t8,
    ids.t9,
  ];

  const topSet = new Set([ids.t1, ids.t2, ids.t3, ids.t4]);
  const bottomTeams = [ids.t5, ids.t6, ids.t7, ids.t8, ids.t9];

  const overrides = new Map<string, { homeScore: number; awayScore: number }>();
  for (const [home, away, homeScore, awayScore] of topFourMatches) {
    overrides.set(makeKey(home, away), { homeScore, awayScore });
  }

  const matches: Match[] = [];
  let counter = 1;

  for (let i = 0; i < allTeams.length; i += 1) {
    for (let j = i + 1; j < allTeams.length; j += 1) {
      const home = allTeams[i];
      const away = allTeams[j];
      const key = makeKey(home, away);

      const override = overrides.get(key);
      if (override) {
        matches.push(
          makeMatch(
            `m${counter++}`,
            groupKey,
            home,
            away,
            override.homeScore,
            override.awayScore
          )
        );
        continue;
      }

      const homeIsTop = topSet.has(home);
      const awayIsTop = topSet.has(away);

      // Mecze top4 vs pozostałe 5 drużyn:
      // każda z top4 wygrywa 1:0, żeby tabela była pełna
      // i żeby dodatki były równe dla czołowych drużyn.
      if (homeIsTop && !awayIsTop) {
        matches.push(makeMatch(`m${counter++}`, groupKey, home, away, 1, 0));
        continue;
      }

      if (!homeIsTop && awayIsTop) {
        // ponieważ home zawsze jest allTeams[i], a away to allTeams[j],
        // ta gałąź praktycznie nie zajdzie przy obecnej kolejności,
        // ale zostawiam ją dla bezpieczeństwa
        matches.push(makeMatch(`m${counter++}`, groupKey, home, away, 0, 1));
        continue;
      }

      // Mecze między drużynami z dołu tabeli:
      // niższy indeks wygrywa 1:0, żeby zrobić pełną i czytelną hierarchię
      const homeBottomIndex = bottomTeams.indexOf(home);
      const awayBottomIndex = bottomTeams.indexOf(away);

      if (homeBottomIndex !== -1 && awayBottomIndex !== -1) {
        matches.push(makeMatch(`m${counter++}`, groupKey, home, away, 1, 0));
        continue;
      }

      // awaryjnie
      matches.push(makeMatch(`m${counter++}`, groupKey, home, away, 0, 0));
    }
  }

  return matches;
}

function getScenarioMatches(
  group: Group,
  scenario: StandingsTestScenarioKey
): Match[] {
  if (scenario === "default") {
    return group.matches;
  }

  const ids = getTeamIds(group);

  if (
    !ids.t1 ||
    !ids.t2 ||
    !ids.t3 ||
    !ids.t4 ||
    !ids.t5 ||
    !ids.t6 ||
    !ids.t7 ||
    !ids.t8 ||
    !ids.t9
  ) {
    return group.matches;
  }

  switch (scenario) {
    case "test-points":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 2, 0],
        [ids.t1, ids.t3, 1, 0],
        [ids.t1, ids.t4, 3, 0],
        [ids.t2, ids.t3, 2, 0],
        [ids.t2, ids.t4, 1, 0],
        [ids.t3, ids.t4, 1, 0],
      ]);

    case "test-direct-match":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 2, 1],
        [ids.t1, ids.t3, 0, 1],
        [ids.t1, ids.t4, 2, 0],
        [ids.t2, ids.t3, 2, 0],
        [ids.t2, ids.t4, 1, 0],
        [ids.t3, ids.t4, 0, 1],
      ]);

    case "test-goal-difference":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 1, 1],
        [ids.t1, ids.t3, 3, 0],
        [ids.t1, ids.t4, 0, 1],
        [ids.t2, ids.t3, 2, 0],
        [ids.t2, ids.t4, 0, 1],
        [ids.t3, ids.t4, 0, 1],
      ]);

    case "test-goals-for":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 1, 1],
        [ids.t1, ids.t3, 4, 2],
        [ids.t1, ids.t4, 0, 1],
        [ids.t2, ids.t3, 3, 1],
        [ids.t2, ids.t4, 0, 1],
        [ids.t3, ids.t4, 0, 1],
      ]);

    case "test-unresolved-tie-2":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 1, 1],
        [ids.t1, ids.t3, 2, 0],
        [ids.t1, ids.t4, 0, 1],
        [ids.t2, ids.t3, 2, 0],
        [ids.t2, ids.t4, 0, 1],
        [ids.t3, ids.t4, 0, 1],
      ]);

    case "test-three-way-tie":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 1, 0],
        [ids.t1, ids.t3, 0, 2],
        [ids.t1, ids.t4, 3, 0],
        [ids.t2, ids.t3, 2, 0],
        [ids.t2, ids.t4, 1, 0],
        [ids.t3, ids.t4, 1, 0],
      ]);

    case "test-unresolved-tie-3":
      return buildCompleteScenario(group, [
        [ids.t1, ids.t2, 1, 0],
        [ids.t1, ids.t3, 0, 1],
        [ids.t1, ids.t4, 2, 1],
        [ids.t2, ids.t3, 1, 0],
        [ids.t2, ids.t4, 2, 1],
        [ids.t3, ids.t4, 2, 1],
      ]);

    default:
      return group.matches;
  }
}

export function applyGroupTestScenario(group: Group): Group {
  if (!STANDINGS_TEST_MODE) return group;
  if (group.name !== STANDINGS_TEST_GROUP_NAME) return group;

  return {
    ...group,
    matches: getScenarioMatches(group, ACTIVE_STANDINGS_TEST_SCENARIO),
  };
}