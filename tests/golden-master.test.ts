import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildTournament } from "@/lib/data/airtable/mappers";
import { mergeTournamentData } from "@/lib/merge-data";
import { calculateStandings } from "@/lib/standings";

/**
 * GOLDEN MASTER produkcyjnego turnieju.
 *
 * Wejście: fixtures/airtable-raw.json — surowe rekordy Airtable pobrane
 * skryptem `npm run fixtures:export` (URL-e załączników zredagowane).
 *
 * Te snapshoty muszą pozostać identyczne po:
 *   - refaktorze warstwy danych,
 *   - migracji na PostgreSQL,
 *   - dodaniu formatu play-off.
 *
 * Jakakolwiek zmiana snapshotu oznacza zmianę wyników starego turnieju.
 */

const projectRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".."
);
const fixturePath = path.join(projectRoot, "fixtures", "airtable-raw.json");
const hasFixture = fs.existsSync(fixturePath);

type Fixture = Parameters<typeof buildTournament>[0] & {
  exportedAt: string;
};

function loadFixture(): Fixture {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;
}

describe.skipIf(!hasFixture)("golden master — produkcyjny turniej", () => {
  it("mapuje surowe rekordy Airtable na stabilny model turnieju", () => {
    const fixture = loadFixture();

    const tournament = mergeTournamentData(
      buildTournament({
        slug: fixture.slug,
        tournamentRecord: fixture.tournamentRecord,
        teamRecords: fixture.teamRecords,
        matchRecords: fixture.matchRecords,
        scorerRecords: fixture.scorerRecords,
      })
    );

    expect({
      id: tournament.id,
      title: tournament.title,
      groupKeys: tournament.groups.map((group) => group.key),
      teamCounts: tournament.groups.map((group) => group.teams.length),
      matchCounts: tournament.groups.map((group) => group.matches.length),
      scorerCount: tournament.scorers.length,
    }).toMatchSnapshot("tournament-shape");

    expect(tournament).toMatchSnapshot("tournament-full");
  });

  it("wylicza identyczną klasyfikację dla każdej grupy", () => {
    const fixture = loadFixture();

    const tournament = mergeTournamentData(
      buildTournament({
        slug: fixture.slug,
        tournamentRecord: fixture.tournamentRecord,
        teamRecords: fixture.teamRecords,
        matchRecords: fixture.matchRecords,
        scorerRecords: fixture.scorerRecords,
      })
    );

    expect(tournament.groups.length).toBeGreaterThan(0);

    for (const group of tournament.groups) {
      const standings = calculateStandings(group);

      expect(standings).toHaveLength(group.teams.length);
      expect(standings.map((row) => row.position)).toEqual(
        standings.map((_, index) => index + 1)
      );

      expect(standings).toMatchSnapshot(`standings-grupa-${group.key}`);
    }
  });

  it("klasyfikacja jest deterministyczna przy wielokrotnym wywołaniu", () => {
    const fixture = loadFixture();

    const build = () =>
      buildTournament({
        slug: fixture.slug,
        tournamentRecord: fixture.tournamentRecord,
        teamRecords: fixture.teamRecords,
        matchRecords: fixture.matchRecords,
        scorerRecords: fixture.scorerRecords,
      });

    const first = build().groups!.map((group) => calculateStandings(group));
    const second = build().groups!.map((group) => calculateStandings(group));

    expect(first).toEqual(second);
  });
});
