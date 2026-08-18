import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import {
  completeCurrentRound,
  completeGroupStage,
  completeTournament,
  getPlayoffState,
  reopenPreviousPhase,
  savePlayoffMatchResult,
} from "@/lib/data/postgres/playoff-engine";
import type { Match, Team, Tournament } from "@/types/tournament";

/**
 * TOKEN FINALIZACJI (completed_at) — klucz ceremonii podium.
 * Cofnięcie czyści, ponowne zakończenie ustawia nową wartość.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

function teamsOf(n: number): Team[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i + 1}`, name: `Ekipa A${i + 1}`, shortName: `A${i + 1}`,
    logoText: `A${i + 1}`, sourceOrder: i + 1,
  }));
}

function rr(t: Team[]): Match[] {
  const out: Match[] = [];
  for (let i = 0; i < t.length; i += 1)
    for (let j = i + 1; j < t.length; j += 1)
      out.push({ id: `A-${t[i].id}-${t[j].id}`, group: "A",
        homeTeamId: t[i].id, awayTeamId: t[j].id, homeScore: 1, awayScore: 0 });
  return out;
}

function payload(title: string, t: Team[]): Tournament {
  return { id: "x", title, scorers: [],
    assets: { scheduleImage: "", scheduleImageType: "", scheduleImageName: "",
      regulationImage: "", regulationImageType: "", regulationImageName: "" },
    groups: [{ key: "A", name: "Grupa A", teams: t, matches: rr(t) }] };
}

/** Dogrywa turniej do końca z DOWOLNEJ fazy pucharowej. */
async function playToCompletion(id: string) {
  let state = await getPlayoffState(id);

  // Cofnięcie z "completed" wraca do fazy finałowej, a nie półfinałowej —
  // wtedy półfinały są już rozegrane i nie zamykamy rundy ponownie.
  if (state.phase !== "final") {
    for (const match of state.scopes[0].rounds[0].matches) {
      if (!match.isFinished) {
        await savePlayoffMatchResult({ tournamentId: id,
          matchExternalId: match.externalId, homeScore: 3, awayScore: 1 });
      }
    }

    await completeCurrentRound(id);
    state = await getPlayoffState(id);
  }

  await savePlayoffMatchResult({ tournamentId: id,
    matchExternalId: state.scopes[0].rounds[1].matches[0].externalId,
    homeScore: 4, awayScore: 2 });
  await savePlayoffMatchResult({ tournamentId: id,
    matchExternalId: state.scopes[0].rounds[2].matches[0].externalId,
    homeScore: 3, awayScore: 1 });

  for (const match of state.scopes[0].placement!.matches) {
    if (match.homeScore === null) {
      await savePlayoffMatchResult({ tournamentId: id,
        matchExternalId: match.externalId, homeScore: 2, awayScore: 1 });
    }
  }

  await completeTournament(id);
}

describe.skipIf(!hasDatabase)("token finalizacji", () => {
  let originalCurrentId: string | null = null;
  let id = "";

  beforeAll(async () => {
    const current = await getDb().select({ id: tournaments.id }).from(tournaments)
      .where(eq(tournaments.isCurrent, true)).limit(1);
    originalCurrentId = current[0]?.id ?? null;

    const created = await postgresRepository.createTournament({
      title: "Vitest Completion Token",
      settings: { structure: "groups", format: "group_playoff",
        playoffConfig: { qualifiedTeamCount: 4, thirdPlaceMatch: true,
          placementMode: "placement_group", tieBreaker: "penalties" } },
    });

    id = created.id;
    await postgresRepository.saveTournament(id, payload("Vitest Completion Token", teamsOf(7)));
    await completeGroupStage(id);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(tournaments).where(
      originalCurrentId
        ? and(like(tournaments.slug, "vitest-%"), sql`${tournaments.id} <> ${originalCurrentId}`)
        : like(tournaments.slug, "vitest-%"));
    if (originalCurrentId) {
      await db.update(tournaments).set({ isCurrent: true })
        .where(eq(tournaments.id, originalCurrentId));
    }
  });

  it("A: przed zakończeniem token jest pusty, a szkielet już istnieje", async () => {
    const state = await getPlayoffState(id);

    expect(state.completionToken).toBeNull();
    expect(state.isCompleted).toBe(false);
    // Puste podium ma z czego powstać już teraz.
    expect(state.scopes[0].classificationSkeleton).toHaveLength(7);
  });

  it("E: zakończenie ustawia token i kompletną klasyfikację", async () => {
    await playToCompletion(id);

    const state = await getPlayoffState(id);

    expect(state.isCompleted).toBe(true);
    expect(state.completionToken).not.toBeNull();
    expect(state.scopes[0].classification?.complete).toBe(true);
    expect(state.scopes[0].classification?.entries).toHaveLength(7);
  });

  it("Q: cofnięcie czyści token, ponowne zakończenie daje NOWY", async () => {
    const before = (await getPlayoffState(id)).completionToken;
    expect(before).not.toBeNull();

    await reopenPreviousPhase({ tournamentId: id, confirmDataLoss: true });

    let state = await getPlayoffState(id);
    expect(state.completionToken).toBeNull();
    expect(state.isCompleted).toBe(false);

    // Odczekanie gwarantuje inny znacznik czasu.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await playToCompletion(id);

    state = await getPlayoffState(id);

    expect(state.completionToken).not.toBeNull();
    expect(state.completionToken).not.toBe(before);
  });

  it("S: turniej ligowy nie dostaje szkieletu podium", async () => {
    const created = await postgresRepository.createTournament({
      title: "Vitest League No Podium",
      settings: { structure: "groups", format: "league", playoffConfig: null },
    });

    await postgresRepository.saveTournament(
      created.id, payload("Vitest League No Podium", teamsOf(4)));

    const state = await getPlayoffState(created.id);

    expect(state.format).toBe("league");
    expect(state.completionToken).toBeNull();
    expect(state.scopes[0].classificationSkeleton).toEqual([]);
    expect(state.scopes[0].classification).toBeNull();
  });
});
