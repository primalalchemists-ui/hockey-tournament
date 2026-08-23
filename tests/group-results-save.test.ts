import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { matches, teams, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { TournamentOperationError } from "@/lib/data/types";
import type { GroupResultInput } from "@/lib/data/types";
import type { Tournament } from "@/types/tournament";
import { completeGroupStage } from "@/lib/data/postgres/playoff-engine";

import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";
import { createU8Fixture } from "./torture/helpers/lifecycle";

/**
 * ZAPIS SAMYCH WYNIKÓW.
 *
 * Wąska ścieżka dla przycisku przy tabeli. Sens tych testów jest jeden:
 * udowodnić, że wpisanie wyniku NIE MOŻE ruszyć niczego poza wynikami —
 * bo pełny zapis wysyła cały turniej i właśnie tym potrafił skasować
 * drużynę razem z jej meczami.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("kontrakt UI", () => {
  const matrix = source("components/admin/editable-match-matrix.tsx");
  const shell = source("components/admin/admin-shell.tsx");

  it("przycisk stoi przy tabeli, nie tylko na górze strony", () => {
    expect(matrix).toContain('data-testid="results-save"');
    expect(matrix).toContain("Zapisz wyniki");
    // Górny przycisk zostaje i zapisuje wszystko.
    expect(shell).toContain("saveAdminDraftAction");
  });

  it("status stoi przy przycisku, ma stałą wysokość i podaje powód", () => {
    expect(matrix).toContain('data-testid="results-save-status"');
    expect(matrix).toContain('role="status"');
    expect(matrix).toContain("saveState.message");

    // Stała wysokość: pojawienie się komunikatu nie przesuwa tabeli.
    expect(matrix).toContain("min-h-5");

    /*
      Odpowiedź ma być tam, gdzie przed chwilą był wzrok i palec — obok
      przycisku, nie na środku nagłówka.
    */
    expect(matrix).toContain("items-center justify-end gap-3");
    expect(matrix).not.toContain("sm:text-center");
    expect(matrix.indexOf('data-testid="results-save-status"')).toBeLessThan(
      matrix.indexOf('data-testid="results-save"')
    );
  });

  it("komunikat o błędzie nie gaśnie przy dalszym wpisywaniu", () => {
    /*
      To był realny sposób na utratę wyników: zapis padał, czerwony
      komunikat mrugał, a pierwsze dotknięcie kratki go kasowało.
    */
    expect(shell).toContain(
      'prev.status === "saved" ? { status: "idle", message: null } : prev'
    );
  });

  it("po zamrożeniu fazy przycisk jest wyłączony, a powód widoczny", () => {
    /*
      Serwer i tak odrzuci taki zapis, ale odmowa PO kliknięciu to zła
      kolejność — człowiek zdąży wpisać partię wyników, zanim się dowie.
    */
    expect(matrix).toContain("locked || !dirty}");
    expect(matrix).toContain("Faza grupowa zamrożona");
    expect(matrix).toContain('data-locked={locked ? "true" : "false"}');

    // Warunek blokady jest DOKŁADNIE tym, czego pilnuje baza.
    expect(shell).toContain('playoffState.phase !== "group_stage"');
    expect(shell).toContain("if (resultsLocked || !resultsDirty) return;");
  });

  it("bez zmian nie ma czego zapisywać — przycisk gaśnie", () => {
    expect(matrix).toContain("disabled={isSaving || locked || !dirty}");
    expect(matrix).toContain('data-dirty={dirty ? "true" : "false"}');

    /*
      Porównujemy PODPIS, nie obiekty: ta sama para bywa zapisana raz jako
      A–B, raz jako B–A, a kolejność w tablicy zmienia się przy każdym
      wczytaniu. Bez normalizacji przycisk świeciłby zawsze.
    */
    expect(shell).toContain("const resultsDirty = resultsSignature(draft) !== savedResults");
    expect(shell).toContain("function resultsSignature");
    expect(shell).toContain("[match.homeTeamId, match.awayTeamId].sort()");
  });

  it("udany zapis znów gasi przycisk, kolejna zmiana go zapala", () => {
    // Punkt odniesienia przesuwa się WYŁĄCZNIE po potwierdzonym zapisie.
    expect(shell).toContain("setSavedResults(signature)");
    const save = shell.slice(shell.indexOf("function handleSaveResults"));
    expect(save.indexOf("setSavedResults(signature)")).toBeLessThan(
      save.indexOf('setResultsSave({ status: "saved"')
    );

    /*
      Nieudany zapis NIE przesuwa punktu odniesienia: gałąź błędu kończy się
      wcześniej, więc zmiany dalej czekają, a przycisk zostaje zapalony.
    */
    expect(save).toContain('setResultsSave({ status: "error", message: result.error });');
    expect(save.indexOf('message: result.error')).toBeLessThan(
      save.indexOf("setSavedResults(signature)")
    );

    // Pełny zapis też utrwala wyniki, więc dolny przycisk musi to wiedzieć.
    expect(shell).toContain("setSavedResults(resultsSignature(draft))");

    expect(shell).toContain("if (resultsLocked || !resultsDirty) return;");
  });

  it("turniej ligowy nie jest blokowany", () => {
    // Brak silnika pucharowego znaczy, że faza grupowa nigdy się nie kończy.
    expect(shell).toContain("const resultsLocked = playoffState");
    expect(shell).toContain(": false;");
  });

  it("wynik wpisuje się w dwa pola, dwukropek jest na stałe", () => {
    /*
      Jedno pole wymagało wstukania dwukropka — na telefonie to zmiana
      układu klawiatury dla jednego znaku, przy stu wynikach w turnieju.
      Panel play-off od dawna ma dwa pola; macierz robi to samo.
    */
    expect(matrix).toContain('data-testid="cell-home"');
    expect(matrix).toContain('data-testid="cell-away"');
    expect(matrix).toContain('inputMode="numeric"');
    expect(matrix).toContain('aria-label="Gole gospodarza"');
    expect(matrix).toContain('aria-label="Gole gościa"');

    // Same cyfry, najwyżej dwie.
    expect(matrix).toContain('raw.replace(/[^0-9]/g, "").slice(0, 2)');

    /*
      DWUCYFROWE WYNIKI MUSZĄ WCHODZIĆ.

      Automatyczny skok na drugie pole po pierwszej cyfrze uniemożliwiał
      wpisanie 10:2 — druga cyfra lądowała u gości. Przechodzenie między
      polami należy do Taba i myszy.
    */
    expect(matrix).not.toContain("awayRef");
    expect(matrix).not.toContain(".focus()");

    // Wyszarzone „0" mówi „tu się wpisuje"; lustro obok pokazuje „—".
    expect(matrix).toContain('placeholder="0"');
  });

  it("w trakcie zapisu status milczy — mówi przycisk", () => {
    // Dwa razy to samo słowo obok siebie to szum, nie informacja.
    expect(matrix).toContain("const statusText = isSaving");
    expect(matrix).toContain("? null");
    expect(matrix).toContain('<span>Zapisywanie</span>');
  });

  it("niekompletny wynik nie rusza draftu — koniec ze skakaniem macierzy", () => {
    /*
      ŹRÓDŁO PROBLEMU. Wynik bez dwukropka nie parsował się, więc po
      pierwszym znaku mecz znikał z draftu: kratka traciła kolor, a tabela
      nad macierzą przeliczała się i przestawiała drużyny. Przy każdym
      wyniku, trzy razy.
    */
    expect(matrix).toContain('if (next.home !== "" && next.away !== "")');

    // Wyczyszczenie działa, ale dopiero przy opuszczeniu kratki.
    expect(matrix).toContain("function handleBlur()");
    expect(matrix).toContain('fields.home === "" && fields.away === ""');

    // Wejście w pole nie chowa kratki pod nieruchomą kolumną nazw.
    expect(matrix).toContain("scrollMarginLeft");
  });

  it("wysyłamy wyniki ze wszystkich grup, nie tylko z widocznej zakładki", () => {
    expect(shell).toContain("draft.groups.flatMap((group) =>");
    expect(shell).toContain("saveGroupResultsAction(tournamentId, results)");
  });
});

describe.skipIf(!hasDatabase)("zapis wyników w bazie", () => {
  let originalCurrentId: string | null = null;
  let id = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();
    id = await createU8Fixture("Vitest Group Results");
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  async function load(): Promise<Tournament> {
    const result = await postgresRepository.getTournamentById(id);
    if (result.status !== "ok") throw new Error("brak fixture");
    return result.tournament as Tournament;
  }

  function toInputs(tournament: Tournament) {
    return tournament.groups.flatMap((group) =>
      group.matches.map((match) => ({
        groupKey: group.key,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      }))
    ) as GroupResultInput[];
  }

  it("zapisuje zmieniony wynik", async () => {
    const inputs = toInputs(await load());
    inputs[0] = { ...inputs[0], homeScore: 6, awayScore: 1 };

    await postgresRepository.saveGroupResults(id, inputs);

    const after = await load();
    const changed = after.groups
      .flatMap((group) => group.matches)
      .find(
        (match) =>
          match.homeTeamId === inputs[0].homeTeamId &&
          match.awayTeamId === inputs[0].awayTeamId
      );

    expect(changed?.homeScore).toBe(6);
    expect(changed?.awayScore).toBe(1);
  });

  it("wyczyszczona kratka znika z bazy, a ponowny wpis ją przywraca", async () => {
    const before = toInputs(await load());
    const dropped = before[0];

    await postgresRepository.saveGroupResults(id, before.slice(1));

    const cleared = await load();
    expect(
      cleared.groups
        .flatMap((group) => group.matches)
        .some(
          (match) =>
            match.homeTeamId === dropped.homeTeamId &&
            match.awayTeamId === dropped.awayTeamId
        )
    ).toBe(false);

    await postgresRepository.saveGroupResults(id, before);

    const restored = await load();
    expect(restored.groups.flatMap((group) => group.matches)).toHaveLength(
      before.length
    );
  });

  it("NIE rusza drużyn — nawet gdy wynik ich nie wymienia", async () => {
    const db = getDb();
    const teamsBefore = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.tournamentId, id));

    // Zapis JEDNEGO wyniku. Pełny zapis w tym miejscu skasowałby
    // wszystkie drużyny spoza payloadu — razem z ich meczami.
    const inputs = toInputs(await load());
    await postgresRepository.saveGroupResults(id, inputs);

    const teamsAfter = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.tournamentId, id));

    expect(teamsAfter.length).toBe(teamsBefore.length);
    expect(teamsBefore.length).toBe(14);
  });

  it("nie dotyka meczów drabinki ani minigrupy", async () => {
    const other = await createU8Fixture("Vitest Group Results Playoff");
    await completeGroupStage(other);

    const db = getDb();
    const nonGroupBefore = await db
      .select({ id: matches.id, stage: matches.stage })
      .from(matches)
      .where(eq(matches.tournamentId, other));

    const playoffCount = nonGroupBefore.filter(
      (row) => row.stage !== "group"
    ).length;
    expect(playoffCount).toBeGreaterThan(0);

    /*
      Po zamrożeniu fazy grupowej ten zapis MUSI zostać odrzucony — tak samo
      jak pełny. Inaczej wąska ścieżka byłaby obejściem bezpiecznika.
    */
    await expect(
      postgresRepository.saveGroupResults(other, [])
    ).rejects.toBeInstanceOf(TournamentOperationError);

    const nonGroupAfter = await db
      .select({ id: matches.id, stage: matches.stage })
      .from(matches)
      .where(eq(matches.tournamentId, other));

    expect(nonGroupAfter.filter((row) => row.stage !== "group").length).toBe(
      playoffCount
    );
  });

  it("podbija wersję publiczną, więc kibic widzi wynik bez odświeżania", async () => {
    /*
      Strona kibica odpytuje licznik `public_revision`, a NIE `updated_at`.
      Bez inkrementu wynik siedziałby w bazie i był niewidoczny na stronie
      do najbliższego pełnego zapisu.
    */
    const db = getDb();
    const before = await db
      .select({ revision: tournaments.publicRevision })
      .from(tournaments)
      .where(eq(tournaments.id, id));

    await postgresRepository.saveGroupResults(id, toInputs(await load()));

    const after = await db
      .select({ revision: tournaments.publicRevision })
      .from(tournaments)
      .where(eq(tournaments.id, id));

    expect(after[0].revision).toBeGreaterThan(before[0].revision);
  });

  it("odmawia zapisu dla nieistniejącego turnieju", async () => {
    await expect(
      postgresRepository.saveGroupResults(
        "00000000-0000-0000-0000-000000000000",
        []
      )
    ).rejects.toBeInstanceOf(TournamentOperationError);
  });
});
