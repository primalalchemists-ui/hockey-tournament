import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { groups, teams, tournaments } from "@/lib/db/schema";
import { calculatePlannedMatchCount } from "@/lib/playoff/planned-matches";
import { TournamentHeader } from "@/components/tournament-header";
import type { PlayoffConfig, TournamentFormat } from "@/types/tournament-config";

/**
 * PLANOWANA LICZBA MECZÓW W PUBLICZNYM HEADERZE.
 *
 * Badge ma pokazywać skalę wydarzenia wynikającą z KONFIGURACJI. Realne
 * SUN CUP U8 ma dziś w bazie 42 zmaterializowane mecze grupowe i to jest
 * poprawne — kibic i tak ma zobaczyć 56.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const RESULTS_CTA = {
  kind: "results" as const,
  label: "Sprawdź wyniki",
  shine: false,
  targetId: "wyniki",
  cinematic: false,
};

/** Liczba planowana wyliczona z tego, co realnie stoi w bazie. */
async function plannedCountForSlug(slug: string) {
  const db = getDb();

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);

  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.tournamentId, tournament.id));

  const teamRows = await db
    .select({ groupId: teams.groupId })
    .from(teams)
    .where(eq(teams.tournamentId, tournament.id));

  const scopes = groupRows.map((group) => ({
    teamCount: teamRows.filter((team) => team.groupId === group.id).length,
  }));

  return calculatePlannedMatchCount({
    format: tournament.format as TournamentFormat,
    playoffConfig: tournament.playoffConfig as PlayoffConfig | null,
    scopes,
  });
}

describe.skipIf(!hasDatabase)("A/B: realne turnieje SUN CUP", () => {
  it("A: U8 planuje 56 meczów, mimo 42 rekordów w bazie", async () => {
    expect(await plannedCountForSlug("sun-cup-2026-u8")).toBe(56);
  });

  it("B: U10 planuje 90 meczów", async () => {
    expect(await plannedCountForSlug("sun-cup-2026-u10")).toBe(90);
  });
});

describe("C: licznik nie zależy od stanu bazy", () => {
  const config: PlayoffConfig = {
    qualifiedTeamCount: 4,
    thirdPlaceMatch: true,
    placementMode: "placement_group",
    tieBreaker: "penalties",
  };

  it("C: ta sama konfiguracja daje 56 na każdym etapie turnieju", () => {
    /*
      Helper w ogóle nie przyjmuje meczów — to jest właśnie gwarancja
      stabilności. Wystarczy, że skład grup się nie zmienia.
    */
    const before = calculatePlannedMatchCount({
      format: "group_playoff",
      playoffConfig: config,
      scopes: [{ teamCount: 7 }, { teamCount: 7 }],
    });

    const afterBracket = calculatePlannedMatchCount({
      format: "group_playoff",
      playoffConfig: config,
      scopes: [{ teamCount: 7 }, { teamCount: 7 }],
    });

    expect(before).toBe(56);
    expect(afterBracket).toBe(before);
  });
});

describe("badge w publicznym headerze", () => {
  function renderHeader(plannedMatchCount: number, playedMatchCount = 0) {
    return renderToStaticMarkup(
      <TournamentHeader
        title="SUN CUP 2026 — U8"
        scorers={[]}
        teams={[]}
        plannedMatchCount={plannedMatchCount}
        playedMatchCount={playedMatchCount}
        cta={RESULTS_CTA}
      />
    );
  }

  it("pokazuje planowaną liczbę, a nie liczbę rozegranych meczów", () => {
    const html = renderHeader(56);

    expect(html).toContain('data-testid="planned-match-count"');
    expect(html).toContain(">56<");
    expect(html).toContain('data-testid="match-progress"');
    expect(html).toContain("meczów");
  });

  it("odmienia liczebnik po polsku", () => {
    expect(renderHeader(1)).toContain("mecz<");
    expect(renderHeader(24)).toContain("mecze");
    expect(renderHeader(90)).toContain("meczów");
  });
});
