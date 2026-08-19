import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { groups, teams, tournaments } from "@/lib/db/schema";
import { getPlayoffState } from "@/lib/data/postgres/playoff-engine";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { calculatePlannedMatchCount } from "@/lib/playoff/planned-matches";
import {
  countPlayedMatches,
  describeMatchProgress,
} from "@/lib/public/match-progress";
import { TournamentHeader } from "@/components/tournament-header";
import type { PlayoffConfig, TournamentFormat } from "@/types/tournament-config";

/**
 * LICZNIK POSTĘPU W NAGŁÓWKU.
 *
 * Mianownik pochodzi z konfiguracji, licznik wyłącznie z meczów, które
 * naprawdę mają wynik. Po zakończeniu turnieju „56 meczów" czytało się
 * jak rozmiar wydarzenia; „56 / 56 meczów" mówi, że jest po wszystkim.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const RESULTS_CTA = {
  kind: "results" as const,
  label: "Sprawdź wyniki",
  shine: false,
  targetId: "wyniki",
};

function renderBadge(played: number, planned: number) {
  return renderToStaticMarkup(
    <TournamentHeader
      title="Turniej"
      scorers={[]}
      teams={[]}
      plannedMatchCount={planned}
      playedMatchCount={played}
      cta={RESULTS_CTA}
    />
  );
}

async function progressForSlug(slug: string) {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);

  const loaded = await postgresRepository.getTournamentById(row.id);
  if (loaded.status !== "ok") throw new Error("brak turnieju");

  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.tournamentId, row.id));

  const teamRows = await db
    .select({ groupId: teams.groupId })
    .from(teams)
    .where(eq(teams.tournamentId, row.id));

  const planned = calculatePlannedMatchCount({
    format: row.format as TournamentFormat,
    playoffConfig: row.playoffConfig as PlayoffConfig | null,
    scopes: groupRows.map((group) => ({
      teamCount: teamRows.filter((team) => team.groupId === group.id).length,
    })),
  });

  const playoffState =
    row.format === "group_playoff" ? await getPlayoffState(row.id) : null;

  const played = countPlayedMatches({
    groups: loaded.tournament.groups ?? [],
    playoffState,
  });

  return describeMatchProgress({ played, planned });
}

describe("F/G: licznik zlicza wszystkie etapy", () => {
  it("F: faza grupowa, drabinka, mecz o 3. miejsce i minigrupa", () => {
    const played = countPlayedMatches({
      groups: [{ matches: [1, 2, 3] }, { matches: [4] }],
      playoffState: {
        scopes: [
          {
            rounds: [
              {
                matches: [
                  { homeScore: 3, awayScore: 1 },
                  // Mecz bez wyniku nie liczy się do postępu.
                  { homeScore: null, awayScore: null },
                ],
              },
              { matches: [{ homeScore: 2, awayScore: 0 }] },
            ],
            placement: { matches: [{ homeScore: 5, awayScore: 4 }] },
          },
        ],
      },
    });

    expect(played).toBe(4 + 2 + 1);
  });

  it("G: mianownik nie zależy od tego, ile meczów istnieje w bazie", () => {
    const config: PlayoffConfig = {
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
      tieBreaker: "penalties",
    };

    const planned = calculatePlannedMatchCount({
      format: "group_playoff",
      playoffConfig: config,
      scopes: [{ teamCount: 7 }, { teamCount: 7 }],
    });

    expect(planned).toBe(56);

    // Ten sam plan przy zerowym i przy pełnym stanie bazy.
    expect(describeMatchProgress({ played: 0, planned }).planned).toBe(56);
    expect(describeMatchProgress({ played: 56, planned }).planned).toBe(56);
  });

  it("licznik nigdy nie przebija mianownika", () => {
    expect(describeMatchProgress({ played: 99, planned: 56 }).played).toBe(56);
    expect(describeMatchProgress({ played: -5, planned: 56 }).played).toBe(0);
  });
});

describe("badge w nagłówku", () => {
  it("B: przed pierwszym gwizdkiem pokazuje 0 / 56", () => {
    const html = renderBadge(0, 56);

    expect(html).toContain('data-testid="match-progress"');
    expect(html).toContain(">0<");
    expect(html).toContain(">56<");
    expect(html).toContain('data-complete="false"');
    expect(html).not.toContain('data-testid="match-progress-complete"');
  });

  it("C: w trakcie turnieju pokazuje 42 / 56", () => {
    const html = renderBadge(42, 56);

    expect(html).toContain(">42<");
    expect(html).toContain('data-complete="false"');
  });

  it("D: po zakończeniu pokazuje komplet z drobnym znacznikiem", () => {
    const html = renderBadge(56, 56);

    expect(html).toContain('data-complete="true"');
    expect(html).toContain('data-testid="match-progress-complete"');
    // Badge zostaje licznikiem — nie zamienia się w komunikat o końcu.
    expect(html).not.toContain("ZAKOŃCZONY");
    expect(html).not.toContain("Turniej zakończony");
  });
});

describe.skipIf(!hasDatabase)("A-E: realne turnieje", () => {
  it("A/B: realny SUN CUP U8 to 0 / 56", async () => {
    const progress = await progressForSlug("sun-cup-2026-u8");

    expect(progress.planned).toBe(56);
    expect(progress.played).toBe(0);
    expect(progress.isComplete).toBe(false);
  });

  it("D: zakończony visual rehearsal to 56 / 56", async () => {
    const progress = await progressForSlug("sun-cup-u8-visual-rehearsal");

    expect(progress.planned).toBe(56);
    expect(progress.played).toBe(56);
    expect(progress.isComplete).toBe(true);
  });

  it("E: realny SUN CUP U10 to 0 / 90", async () => {
    const progress = await progressForSlug("sun-cup-2026-u10");

    expect(progress.planned).toBe(90);
    expect(progress.played).toBe(0);
  });

  it("C: rozegrana faza grupowa liczy się w całości", async () => {
    // Rabbit Cup ma komplet wyników fazy grupowej i format ligowy.
    const progress = await progressForSlug("rabbit-cup");

    expect(progress.played).toBe(72);
    expect(progress.planned).toBeGreaterThanOrEqual(72);
  });
});
