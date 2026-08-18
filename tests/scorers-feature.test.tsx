import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";

import { getDb } from "@/lib/db/client";
import { scorers, tournaments } from "@/lib/db/schema";
import { postgresRepository } from "@/lib/data/postgres/repository";
import { parseTournamentSettings, readTournamentSettings } from "@/types/tournament-config";
import { ScorersTable } from "@/components/scorers-table";
import {
  deleteOwnFixtures,
  readCurrentTournamentId,
  restoreCurrentTournament,
} from "./helpers/current-tournament";

/**
 * KLASYFIKACJA STRZELCÓW — cecha POJEDYNCZEGO turnieju.
 *
 * Rabbit Cup ją prowadzi, SUN CUP U8/U10 nie. Wyłączenie ukrywa zakładkę,
 * ale NIGDY nie kasuje wpisanych goli.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("B: domyślne zachowanie", () => {
  it("brak informacji o strzelcach = klasyfikacja włączona", () => {
    // Turnieje sprzed wprowadzenia opcji zachowują się jak wcześniej.
    expect(
      readTournamentSettings({
        structure: "groups",
        format: "league",
        playoffConfig: null,
      }).scorersEnabled
    ).toBe(true);

    expect(
      parseTournamentSettings({ structure: "groups", format: "league" })
        .scorersEnabled
    ).toBe(true);
  });

  it("wartość z formularza jest respektowana w obie strony", () => {
    for (const value of [true, false]) {
      expect(
        parseTournamentSettings({
          structure: "groups",
          format: "league",
          scorersEnabled: value,
        }).scorersEnabled
      ).toBe(value);
    }
  });
});

describe("C/D: ukrywanie w interfejsie", () => {
  it("C: publiczna zakładka Strzelcy znika, a nie jest pusta", () => {
    const code = source("components/tournament-shell.tsx");

    // Zakładka jest ODFILTROWANA z listy — nie ma pustego ani wyszarzonego stanu.
    expect(code).toContain('tab.key !== "scorers" || scorersEnabled');
    expect(code).toContain("visibleTabs");
    // Link ?tab=scorers na turniej bez strzelców wraca na wyniki.
    expect(code).toContain('activeTab === "scorers" && !scorersEnabled ? "live"');
  });

  it("D: panel nie pokazuje edytora strzelców", () => {
    const code = source("components/admin/admin-shell.tsx");

    expect(code).toContain('tab.key !== "scorers" || settings.scorersEnabled');
    // Logika zostaje w kodzie — Rabbit Cup nadal jej używa.
    expect(code).toContain("ScorersManager");
  });

  it("sama tabela strzelców nadal działa dla turniejów, które ją mają", () => {
    const html = renderToStaticMarkup(
      <ScorersTable scorers={[]} teams={[]} />
    );

    expect(html).toContain("Strzelcy");
  });
});

describe.skipIf(!hasDatabase)("E/F: dane i wersja publiczna", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    const created = await postgresRepository.createTournament({
      title: "Vitest Scorers Toggle",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        scorersEnabled: true,
      },
    });

    tournamentId = created.id;

    await postgresRepository.saveTournament(tournamentId, {
      id: tournamentId,
      title: "Vitest Scorers Toggle",
      scorers: [
        {
          id: "vs-1",
          playerName: "Tester Strzelec",
          jerseyNumber: 9,
          goals: 3,
          teamId: "vs-a1",
        },
      ],
      assets: {
        scheduleImage: "",
        scheduleImageType: "",
        scheduleImageName: "",
        regulationImage: "",
        regulationImageType: "",
        regulationImageName: "",
      },
      groups: [
        {
          key: "A",
          name: "Grupa A",
          teams: [
            { id: "vs-a1", name: "Vitest A1", shortName: "A1", logoText: "A1", sourceOrder: 1 },
            { id: "vs-a2", name: "Vitest A2", shortName: "A2", logoText: "A2", sourceOrder: 2 },
          ],
          matches: [],
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-scorers", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  async function revisionOf() {
    const rows = await getDb()
      .select({ revision: tournaments.publicRevision })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    return rows[0].revision;
  }

  it("E: wyłączenie i ponowne włączenie zachowuje wpisane gole", async () => {
    const before = await getDb()
      .select({ id: scorers.id })
      .from(scorers)
      .where(eq(scorers.tournamentId, tournamentId));

    expect(before).toHaveLength(1);

    await postgresRepository.updateTournamentSettings(tournamentId, {
      scorersEnabled: false,
    });

    const afterOff = await getDb()
      .select({ id: scorers.id, goals: scorers.goals })
      .from(scorers)
      .where(eq(scorers.tournamentId, tournamentId));

    // Wyłączenie UKRYWA klasyfikację — nie kasuje danych.
    expect(afterOff).toHaveLength(1);
    expect(afterOff[0].goals).toBe(3);

    await postgresRepository.updateTournamentSettings(tournamentId, {
      scorersEnabled: true,
    });

    const result = await postgresRepository.getTournamentById(tournamentId);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.scorersEnabled).toBe(true);
    expect(result.tournament.scorers?.[0]?.goals).toBe(3);
  });

  it("F: zmiana ustawienia podnosi wersję publiczną", async () => {
    const before = await revisionOf();

    await postgresRepository.updateTournamentSettings(tournamentId, {
      scorersEnabled: false,
    });

    expect(await revisionOf()).toBeGreaterThan(before);
  });

  it("ustawienie przetrwa odczyt przez repozytorium", async () => {
    const result = await postgresRepository.getTournamentById(tournamentId);
    if (result.status !== "ok") throw new Error("brak turnieju");

    expect(result.settings.scorersEnabled).toBe(false);
  });
});

describe.skipIf(!hasDatabase)("audyt własności: zapis z ukrytą zakładką", () => {
  let originalCurrentId: string | null = null;
  let tournamentId = "";

  beforeAll(async () => {
    originalCurrentId = await readCurrentTournamentId();

    const created = await postgresRepository.createTournament({
      title: "Vitest Scorers Ownership",
      settings: {
        structure: "groups",
        format: "league",
        playoffConfig: null,
        // Zakładka strzelców jest UKRYTA w panelu.
        scorersEnabled: false,
      },
    });

    tournamentId = created.id;
  });

  afterAll(async () => {
    try {
      await deleteOwnFixtures("vitest-scorers", originalCurrentId);
    } finally {
      await restoreCurrentTournament(originalCurrentId);
    }
  });

  it("strzelcy przeżywają zapis turnieju, choć panel ich nie pokazuje", async () => {
    const payload = {
      id: tournamentId,
      title: "Vitest Scorers Ownership",
      scorers: [
        {
          id: "vso-1",
          playerName: "Ukryty Strzelec",
          jerseyNumber: 7,
          goals: 5,
          teamId: "vso-a1",
        },
      ],
      assets: {
        scheduleImage: "",
        scheduleImageType: "",
        scheduleImageName: "",
        regulationImage: "",
        regulationImageType: "",
        regulationImageName: "",
      },
      groups: [
        {
          key: "A",
          name: "Grupa A",
          teams: [
            { id: "vso-a1", name: "Vitest A1", shortName: "A1", logoText: "A1", sourceOrder: 1 },
            { id: "vso-a2", name: "Vitest A2", shortName: "A2", logoText: "A2", sourceOrder: 2 },
          ],
          matches: [],
        },
      ],
    };

    await postgresRepository.saveTournament(tournamentId, payload);

    /*
      Kluczowe pytanie audytu własności: czy payload panelu POTRAFI wyrazić
      strzelców, gdy ich zakładka jest ukryta? Tak — draft powstaje z
      odczytu, a odczyt zwraca strzelców niezależnie od scorersEnabled.
      Kolejny zapis przenosi ich z powrotem, więc brak w UI nie oznacza
      braku w payloadzie.
    */
    const loaded = await postgresRepository.getTournamentById(tournamentId);
    if (loaded.status !== "ok") throw new Error("brak turnieju");

    expect(loaded.tournament.scorers).toHaveLength(1);
    expect(loaded.settings.scorersEnabled).toBe(false);

    // Zapis odczytanego stanu — dokładnie to robi przycisk „Zapisz".
    await postgresRepository.saveTournament(tournamentId, {
      ...payload,
      scorers: loaded.tournament.scorers ?? [],
    });

    const after = await getDb()
      .select({ id: scorers.id, goals: scorers.goals })
      .from(scorers)
      .where(eq(scorers.tournamentId, tournamentId));

    expect(after).toHaveLength(1);
    expect(after[0].goals).toBe(5);
  });
});
