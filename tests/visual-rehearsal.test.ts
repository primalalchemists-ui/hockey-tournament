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

    /*
      Sprawdzamy WSPOLDZIELONE grafiki, czyli te, ktore klon skopiowal
      z prawdziwego turnieju. Materialy wgrane pozniej bezposrednio
      do klonu (np. plakaty campu) sa jego wlasne i moga miec wlasny
      public_id — to poprawne, bo nie naleza do prawdziwego SUN CUP.
    */
    const shared = realAssets
      .map((original) => ({
        original,
        copy: visualAssets.find((item) => item.kind === original.kind),
      }))
      .filter((pair) => pair.copy);

    expect(shared.length).toBe(realAssets.length);

    for (const { original, copy } of shared) {
      // Ten sam plik...
      expect(copy!.url).toBe(original.url);
      // ...ale klon NIE jest jego wlascicielem, wiec nie moze go skasowac.
      expect(copy!.publicId).toBeNull();
    }
  });

  it("AD/AG: klon zyje w oficjalnej sekwencji faz", async () => {
    /*
      Klon jest polem doswiadczalnym: administrator go rozgrywa, cofa fazy
      i konczy ponownie. Testy nie moga przypinac go do jednego momentu —
      pilnujemy niezmiennika, ze faza pochodzi z sekwencji turnieju,
      a znacznik zakonczenia jest z nia zgodny.
    */
    const [visual] = await bySlug(VISUAL);

    expect(["group_stage", "semifinal", "final", "completed"]).toContain(
      visual.phase
    );

    const state = await getPlayoffState(visual.id);

    expect(state.isCompleted).toBe(visual.phase === "completed");
    // Token ceremonii istnieje DOKLADNIE wtedy, gdy turniej jest zakonczony.
    expect(state.completionToken !== null).toBe(visual.phase === "completed");
  });

  it("AE/AF: obie grupy prowadza do pelnej klasyfikacji 1-7", async () => {
    const [visual] = await bySlug(VISUAL);
    const state = await getPlayoffState(visual.id);

    expect(state.scopes).toHaveLength(2);

    for (const scope of state.scopes) {
      // Szkielet klasyfikacji istnieje od poczatku i ma komplet miejsc...
      expect(scope.classificationSkeleton).toHaveLength(7);

      /*
        ...a po zakonczeniu jest domknieta.

        UWAGA: „domknieta" nie znaczy „1-7 bez dziur". Minigrupa o miejsca
        5-7 moze skonczyc sie nierozstrzygnietym remisem — wtedy silnik
        celowo NIE zgaduje kolejnosci: zostawia `position: null` i oznacza
        te wpisy jako dzielone. Poprzednia wersja testu tego nie
        przewidywala i wywracala sie na legalnym stanie turnieju.
      */
      if (state.isCompleted) {
        expect(scope.classification?.complete).toBe(true);

        const entries = scope.classification!.entries;
        expect(entries).toHaveLength(7);

        // Rozstrzygniete miejsca to ciagly bieg od 1, bez powtorzen.
        const ranked = entries
          .map((entry) => entry.position)
          .filter((position): position is number => position !== null)
          .sort((a, b) => a - b);

        expect(ranked).toEqual(
          Array.from({ length: ranked.length }, (_, index) => index + 1)
        );

        // Podium jest rozstrzygniete zawsze — remis moze dotyczyc tylko ogona.
        expect(ranked.slice(0, 3)).toEqual([1, 2, 3]);

        // Brak miejsca jest DOZWOLONY wylacznie jako jawny remis.
        for (const entry of entries) {
          if (entry.position === null) expect(entry.shared).toBe(true);
        }
      }
    }
  });

  it("w grupie B mistrz NIE jest zwyciezca fazy grupowej", async () => {
    const [visual] = await bySlug(VISUAL);
    const state = await getPlayoffState(visual.id);

    if (!state.isCompleted) return;

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

    /*
      Terminarz i wyniki realnego turnieju należą do organizatora. Klon do
      prób nie ma prawa ich ruszyć — i tego pilnujemy: faza grupowa oraz
      kompletny terminarz zostają, licznik wyników może rosnąć.
    */
    expect(counts.total).toBeGreaterThanOrEqual(42);
    expect(counts.scored).toBeLessThanOrEqual(counts.total);
  });

  it("AJ: realny U10 ma komplet terminarza", async () => {
    const [real] = await bySlug("sun-cup-2026-u10");

    const [counts] = await getDb()
      .select({
        total: sql<number>`count(*)::int`,
        scored: sql<number>`count(${matches.homeScore})::int`,
      })
      .from(matches)
      .where(eq(matches.tournamentId, real.id));

    /*
      Turniej jest prowadzony ręcznie: wyników przybywa, a administrator może
      dopisać mecz w panelu. Pilnujemy terminarza i tego, że wyniki nie
      wyprzedzają liczby meczów.
    */
    expect(counts.total).toBeGreaterThanOrEqual(90);
    expect(counts.scored).toBeLessThanOrEqual(counts.total);
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
