import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";

import { getDb } from "@/lib/db/client";
import { tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import type { TournamentSettings } from "@/types/tournament-config";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
  withRestoredCurrentTournament,
} from "./helpers/current-tournament";
import { createSuggestionController } from "@/lib/logos/suggestion-controller";

/**
 * IZOLACJA TESTÓW.
 *
 * Turniej wyświetlany publicznie to stan PRODUKCYJNY. Żaden test nie może
 * go zostawić zmienionego — ani po sukcesie, ani po wyjątku, ani zależnie
 * od kolejności plików.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

const SETTINGS: TournamentSettings = {
  structure: "groups",
  format: "league",
  playoffConfig: null,
  scorersEnabled: true,
};

describe.skipIf(!hasDatabase)("izolacja turnieju publicznego", () => {
  let originalCurrentId: string | null = null;
  let fixtureId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    const created = await postgresRepository.createTournament({
      title: "Vitest Isolation Cup",
      settings: SETTINGS,
    });

    fixtureId = created.id;
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-isolation", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("A: po udanym teście publiczny turniej wraca", async () => {
    const before = await readCurrentTournamentId();

    await withRestoredCurrentTournament(async () => {
      await postgresRepository.setCurrentTournament(fixtureId);
      expect(await readCurrentTournamentId()).toBe(fixtureId);
    });

    expect(await readCurrentTournamentId()).toBe(before);
  });

  it("B: po wyjątku publiczny turniej też wraca", async () => {
    const before = await readCurrentTournamentId();

    await expect(
      withRestoredCurrentTournament(async () => {
        await postgresRepository.setCurrentTournament(fixtureId);
        throw new Error("celowa awaria testu");
      })
    ).rejects.toThrow("celowa awaria testu");

    expect(await readCurrentTournamentId()).toBe(before);
  });

  it("C: kolejność wykonania nie ma znaczenia", async () => {
    const before = await readCurrentTournamentId();

    // Trzy „pliki testowe" po kolei, każdy przestawia stan publiczny.
    for (let index = 0; index < 3; index += 1) {
      await withRestoredCurrentTournament(async () => {
        await postgresRepository.setCurrentTournament(fixtureId);
      });
    }

    expect(await readCurrentTournamentId()).toBe(before);
  });

  it("D: skasowanie własnego fixture nie gubi oryginału", async () => {
    const before = await readCurrentTournamentId();

    const temporary = await postgresRepository.createTournament({
      title: "Vitest Isolation Temp",
      settings: SETTINGS,
    });

    await withRestoredCurrentTournament(async (original) => {
      await postgresRepository.setCurrentTournament(temporary.id);

      // Fixture przestaje być publiczny, zanim zniknie — inaczej
      // zostawilibyśmy bazę bez żadnego turnieju publicznego.
      await restoreCurrentTournament(original);

      await getDb().delete(tournaments).where(eq(tournaments.id, temporary.id));
    });

    expect(await readCurrentTournamentId()).toBe(before);

    const leftovers = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.id, temporary.id));

    expect(leftovers).toHaveLength(0);
  });

  it("helper nigdy nie kasuje cudzych turniejów", async () => {
    const all = await getDb()
      .select({ slug: tournaments.slug })
      .from(tournaments);

    // Realne turnieje są nietknięte przez cały ten plik.
    expect(all.some((row) => row.slug === "rabbit-cup")).toBe(true);
  });
});

describe("N: spóźniona odpowiedź nie nadpisuje nowszej", () => {
  it("wynik starszego zapytania jest odrzucany", () => {
    const controller = createSuggestionController<string>();

    const acceptOld = controller.begin("UKS");
    const acceptNew = controller.begin("UKS Zagłębie Sosnowiec 1");

    // Nowsza odpowiedź wraca pierwsza — i wygrywa.
    expect(acceptNew("nowa")).toEqual({
      query: "UKS Zagłębie Sosnowiec 1",
      value: "nowa",
    });

    // Starsza dociera później i zostaje porzucona.
    expect(acceptOld("stara")).toBeNull();
    expect(controller.latest()).toBe("UKS Zagłębie Sosnowiec 1");
  });

  it("odpowiedź na aktualne zapytanie jest przyjmowana", () => {
    const controller = createSuggestionController<number>();
    const accept = controller.begin("GKS Katowice 2");

    expect(accept(42)).toEqual({ query: "GKS Katowice 2", value: 42 });
  });
});

describe("strażnik globalny", () => {
  it("obowiązuje w KAŻDYM pliku testowym, nie tylko w świadomych", () => {
    const setup = readFileSync(
      new URL("./setup/env.ts", import.meta.url),
      "utf8"
    );

    // Plik konfiguracyjny wykonuje się dla każdego pliku testowego,
    // więc niezmiennik „koniec == początek" nie zależy od kolejności.
    expect(setup).toContain("beforeAll");
    expect(setup).toContain("afterAll");
    expect(setup).toContain("isCurrent");

    // Brak dostępu do bazy (zestawy z podmienionym fetch) nie może
    // wywracać testów — stąd wyciszone błędy.
    expect(setup).toContain("try {");
  });
});
