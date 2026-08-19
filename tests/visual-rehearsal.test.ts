import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches, teams, tournamentAssets, tournaments } from "@/lib/db/schema";
import { getPlayoffState } from "@/lib/data/postgres/playoff-engine";
import { planVisualSetup } from "@/scripts/visual-rehearsal-setup";

/**
 * SUN CUP U8 - VISUAL REHEARSAL.
 *
 * Klon realnego U8 sluzacy WYLACZNIE do ogladania oprawy. Testy pilnuja
 * dwoch rzeczy naraz: ze klon jest kompletny i ze prawdziwy turniej
 * pozostal nietkniety.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const VISUAL = "sun-cup-u8-visual-rehearsal";
const REAL = "sun-cup-2026-u8";

async function bySlug(slug: string) {
  return getDb().select().from(tournaments).where(eq(tournaments.slug, slug));
}

async function teamNames(tournamentId: string, groupKey: string) {
  const rows = await getDb().execute<{ name: string }>(sql`
    select te.name
    from teams te
    join groups g on g.id = te.group_id
    where te.tournament_id = ${tournamentId} and g.key = ${groupKey}
    order by te.source_order
  `);

  return (rows as unknown as { rows: Array<{ name: string }> }).rows.map(
    (row) => row.name
  );
}

describe.skipIf(!hasDatabase)("W-AG: klon do ogladania", () => {
  it("W: istnieje dokladnie jeden klon", async () => {
    const rows = await bySlug(VISUAL);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("SUN CUP U8 — VISUAL REHEARSAL");
  });

  it("X: setup nigdy sam nie robi z klonu turnieju publicznego", async () => {
    /*
      Klon POWSTAJE jako niepubliczny, ale to administrator decyduje, co
      widzi kibic — i faktycznie przełącza na niego stronę, żeby obejrzeć
      oprawę. Niezmiennikiem jest brak takiej operacji w skrypcie.
    */
    const setup = readFileSync(
      new URL("../scripts/visual-rehearsal-setup.ts", import.meta.url),
      "utf8"
    );

    expect(setup).not.toContain("setCurrentTournament");
    expect(setup).not.toContain("isCurrent: true");

    const rows = await getDb()
      .select({ slug: tournaments.slug })
      .from(tournaments)
      .where(eq(tournaments.isCurrent, true));

    expect(rows).toHaveLength(1);
  });

  it("Y: konfiguracja jest identyczna z realnym U8", async () => {
    const [visual] = await bySlug(VISUAL);
    const [real] = await bySlug(REAL);

    expect(visual.structure).toBe(real.structure);
    expect(visual.format).toBe(real.format);
    expect(visual.scorersEnabled).toBe(real.scorersEnabled);
    expect(visual.playoffConfig).toEqual(real.playoffConfig);
  });

  it("Z: te same grupy i te same nazwy druzyn", async () => {
    const [visual] = await bySlug(VISUAL);
    const [real] = await bySlug(REAL);

    for (const groupKey of ["A", "B"]) {
      expect(await teamNames(visual.id, groupKey)).toEqual(
        await teamNames(real.id, groupKey)
      );
    }
  });

  it("AA: herby to te same wpisy biblioteki, nie kopie", async () => {
    const [visual] = await bySlug(VISUAL);
    const [real] = await bySlug(REAL);

    const shared = await getDb().execute<{ n: number }>(sql`
      select count(*)::int as n
      from teams a
      join teams b
        on a.logo_asset_id = b.logo_asset_id and a.name = b.name
      where a.tournament_id = ${real.id} and b.tournament_id = ${visual.id}
    `);

    const [visualTeams] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(teams)
      .where(eq(teams.tournamentId, visual.id));

    expect((shared as unknown as { rows: Array<{ n: number }> }).rows[0].n).toBe(
      visualTeams.n
    );
  });

  it("AB/AC: grafiki wspoldzielone przez URL, bez wlasnosci pliku", async () => {
    const [visual] = await bySlug(VISUAL);
    const [real] = await bySlug(REAL);

    const visualAssets = await getDb()
      .select()
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, visual.id));

    const realAssets = await getDb()
      .select()
      .from(tournamentAssets)
      .where(eq(tournamentAssets.tournamentId, real.id));

    expect(visualAssets.map((a) => a.kind).sort()).toEqual(
      realAssets.map((a) => a.kind).sort()
    );

    for (const asset of visualAssets) {
      const original = realAssets.find((item) => item.kind === asset.kind)!;

      // Ten sam plik...
      expect(asset.url).toBe(original.url);
      // ...ale klon NIE jest jego wlascicielem, wiec nie moze go skasowac.
      expect(asset.publicId).toBeNull();
    }
  });

  it("AD/AG: klon jest zakonczony i ma token ceremonii", async () => {
    const [visual] = await bySlug(VISUAL);

    expect(visual.phase).toBe("completed");
    expect(visual.completedAt).not.toBeNull();

    const state = await getPlayoffState(visual.id);

    expect(state.isCompleted).toBe(true);
    expect(state.completionToken).not.toBeNull();
  });

  it("AE/AF: obie grupy maja pelna klasyfikacje 1-7", async () => {
    const [visual] = await bySlug(VISUAL);
    const state = await getPlayoffState(visual.id);

    expect(state.scopes).toHaveLength(2);

    for (const scope of state.scopes) {
      expect(scope.classification?.complete).toBe(true);
      expect(
        scope.classification?.entries.map((entry) => entry.position)
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("w grupie B mistrz NIE jest zwyciezca fazy grupowej", async () => {
    const [visual] = await bySlug(VISUAL);
    const state = await getPlayoffState(visual.id);

    const groupB = state.scopes.find((scope) => scope.groupKey === "B")!;

    const seedOne = groupB.snapshot?.[0].teamId;
    const champion = groupB.classification?.entries[0].team.teamId;

    // Celowa niespodzianka: podium pokazuje realny wynik play-off.
    expect(champion).not.toBe(seedOne);
  });

  it("ponowny setup nie tworzy kopii kopii", () => {
    expect(planVisualSetup(null, false)).toBe("create");
    expect(planVisualSetup({ phase: "completed" }, false)).toBe("skip");
    expect(planVisualSetup({ phase: "completed" }, true)).toBe("rebuild");
  });
});

describe.skipIf(!hasDatabase)("AH-AK: prawdziwe dane bez zmian", () => {
  it("AH/AI: realny U8 nadal bez wynikow i w fazie grupowej", async () => {
    const [real] = await bySlug(REAL);

    expect(real.phase).toBe("group_stage");

    const [counts] = await getDb()
      .select({
        total: sql<number>`count(*)::int`,
        scored: sql<number>`count(${matches.homeScore})::int`,
      })
      .from(matches)
      .where(eq(matches.tournamentId, real.id));

    expect(counts.total).toBe(42);
    expect(counts.scored).toBe(0);
  });

  it("AJ: realny U10 nadal bez wynikow", async () => {
    const [real] = await bySlug("sun-cup-2026-u10");

    const [counts] = await getDb()
      .select({
        total: sql<number>`count(*)::int`,
        scored: sql<number>`count(${matches.homeScore})::int`,
      })
      .from(matches)
      .where(eq(matches.tournamentId, real.id));

    expect(counts.total).toBe(90);
    expect(counts.scored).toBe(0);
  });

  it("AK: Rabbit Cup nietkniety", async () => {
    const [rabbit] = await bySlug("rabbit-cup");

    const [counts] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .where(eq(matches.tournamentId, rabbit.id));

    expect(counts.n).toBe(72);
    expect(rabbit.phase).toBe("group_stage");
  });
});
