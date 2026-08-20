import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches, tournamentAssets, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  findArchivedTournamentIdBySlug,
  listArchivedTournamentsForPublic,
} from "@/lib/data/postgres/public-history";
import { TournamentOperationError } from "@/lib/data/types";
import type { Match, Team, Tournament } from "@/types/tournament";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * WIDOCZNOSC HISTORII.
 *
 * Jedno zrodlo prawdy: archived_at IS NOT NULL. Zakonczenie sportowe
 * turnieju NIE publikuje go w historii — to osobna, jawna decyzja
 * organizatora, czyli klikniecie „Archiwizuj".
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

function buildTeams(prefix: string): Team[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    name: `${prefix.toUpperCase()}${index + 1}`,
    sourceOrder: index + 1,
  }));
}

function buildMatches(teams: Team[]): Match[] {
  const result: Match[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      result.push({
        id: `A-${teams[i].id}-${teams[j].id}`,
        group: "A",
        homeTeamId: teams[i].id,
        awayTeamId: teams[j].id,
        homeScore: 2,
        awayScore: 1,
      });
    }
  }

  return result;
}

async function createFixture(name: string, withHero: boolean) {
  const title = `Vitest History ${name}`;
  const teams = buildTeams(name.toLowerCase().slice(0, 2));

  const created = await postgresRepository.createTournament({
    title,
    settings: {
      structure: "groups",
      format: "league",
      playoffConfig: null,
      scorersEnabled: false,
    },
  });

  const payload: Tournament = {
    id: "ignored",
    title,
    scorers: [],
    assets: {},
    groups: [{ key: "A", name: "Grupa A", teams, matches: buildMatches(teams) }],
  };

  await postgresRepository.saveTournament(created.id, payload);

  if (withHero) {
    await getDb()
      .insert(tournamentAssets)
      .values({
        tournamentId: created.id,
        kind: "hero_banner",
        url: `https://res.cloudinary.com/demo/${created.slug}.png`,
      });
  }

  return created;
}

let originalCurrentId: string | null = null;
let older = { id: "", slug: "" };
let newer = { id: "", slug: "" };
let plain = { id: "", slug: "" };

describe.skipIf(!hasDatabase)("L-S/AZ-BD: archiwum i historia", () => {
  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    older = await createFixture("Older", true);
    newer = await createFixture("Newer", false);
    plain = await createFixture("Active", true);
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-history", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("Q: turniej z wynikami, ale niezarchiwizowany, NIE jest w historii", async () => {
    const list = await listArchivedTournamentsForPublic();
    const slugs = list.map((item) => item.slug);

    expect(slugs).not.toContain(older.slug);
    expect(slugs).not.toContain(newer.slug);
    expect(slugs).not.toContain(plain.slug);
  });

  it("AZ: archiwizacja publikuje turniej w historii", async () => {
    await postgresRepository.setTournamentArchived(older.id, true);

    const list = await listArchivedTournamentsForPublic();

    expect(list.map((item) => item.slug)).toContain(older.slug);
  });

  it("S: kolejnosc od najnowszej archiwizacji", async () => {
    await postgresRepository.setTournamentArchived(newer.id, true);

    const list = await listArchivedTournamentsForPublic();
    const ours = list.filter((item) =>
      [older.slug, newer.slug].includes(item.slug)
    );

    expect(ours[0].slug).toBe(newer.slug);
    expect(ours[1].slug).toBe(older.slug);
  });

  it("O/T/U: lista niesie tylko to, czego potrzebuje karta", async () => {
    const list = await listArchivedTournamentsForPublic();
    const withHero = list.find((item) => item.slug === older.slug)!;
    const withoutHero = list.find((item) => item.slug === newer.slug)!;

    expect(withHero.heroBannerUrl).toContain("res.cloudinary.com");
    expect(withoutHero.heroBannerUrl).toBeNull();

    // Zero druzyn, meczow i strzelcow w odpowiedzi.
    expect(Object.keys(withHero).sort()).toEqual([
      "archivedAt",
      "heroBannerUrl",
      "id",
      "slug",
      "title",
    ]);
  });

  it("AG/AH/AI: strona historii istnieje wylacznie dla archiwum", async () => {
    expect(await findArchivedTournamentIdBySlug(older.slug)).toBe(older.id);
    expect(await findArchivedTournamentIdBySlug(plain.slug)).toBeNull();
    expect(await findArchivedTournamentIdBySlug("nie-ma-takiego")).toBeNull();
  });

  it("R/BA: przywrocenie usuwa turniej z historii", async () => {
    await postgresRepository.setTournamentArchived(newer.id, false);

    const list = await listArchivedTournamentsForPublic();

    expect(list.map((item) => item.slug)).not.toContain(newer.slug);
    expect(await findArchivedTournamentIdBySlug(newer.slug)).toBeNull();
  });

  it("BB/BC: archiwizacja i przywrocenie nie ruszaja danych sportowych", async () => {
    const [before] = await getDb()
      .select({ n: sql<number>`count(${matches.homeScore})::int` })
      .from(matches)
      .where(eq(matches.tournamentId, newer.id));

    await postgresRepository.setTournamentArchived(newer.id, true);
    await postgresRepository.setTournamentArchived(newer.id, false);

    const [after] = await getDb()
      .select({ n: sql<number>`count(${matches.homeScore})::int` })
      .from(matches)
      .where(eq(matches.tournamentId, newer.id));

    expect(after.n).toBe(before.n);
    expect(after.n).toBe(6);
  });

  it("BD: nie da sie zarchiwizowac turnieju wyswietlanego publicznie", async () => {
    await postgresRepository.setCurrentTournament(plain.id);

    await expect(
      postgresRepository.setTournamentArchived(plain.id, true)
    ).rejects.toThrow(TournamentOperationError);

    // Ochrona zostaje nietknieta - turniej nadal nie jest w historii.
    expect(await findArchivedTournamentIdBySlug(plain.slug)).toBeNull();
  });

  it("P: turniej wyswietlany publicznie nigdy nie trafia do karuzeli", async () => {
    const [current] = await getDb()
      .select({ slug: tournaments.slug })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true))
      .limit(1);

    const list = await listArchivedTournamentsForPublic();

    expect(list.map((item) => item.slug)).not.toContain(current.slug);
  });
});
