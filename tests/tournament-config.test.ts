import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAYOFF_CONFIG,
  MAIN_POOL_KEY,
  QUALIFIED_TEAM_COUNTS,
  TournamentConfigError,
  checkPlayoffFeasibility,
  parsePlayoffConfig,
  parseTournamentSettings,
  readTournamentSettings,
} from "@/types/tournament-config";

/**
 * Konfiguracja turnieju — dwie NIEZALEŻNE osie.
 * Ten moduł jest jedynym miejscem decydującym, co jest poprawną konfiguracją,
 * więc musi być szczelny: baza przyjmuje tylko to, co przejdzie tutaj.
 */

describe("cztery poprawne kombinacje", () => {
  it("A: single + league", () => {
    expect(
      parseTournamentSettings({ structure: "single", format: "league" })
    ).toEqual({ structure: "single", format: "league", playoffConfig: null });
  });

  it("B: groups + league", () => {
    expect(
      parseTournamentSettings({ structure: "groups", format: "league" })
    ).toEqual({ structure: "groups", format: "league", playoffConfig: null });
  });

  it("C: single + group_playoff", () => {
    const settings = parseTournamentSettings({
      structure: "single",
      format: "group_playoff",
    });

    expect(settings.structure).toBe("single");
    expect(settings.format).toBe("group_playoff");
    expect(settings.playoffConfig).toEqual(DEFAULT_PLAYOFF_CONFIG);
  });

  it("D: groups + group_playoff", () => {
    const settings = parseTournamentSettings({
      structure: "groups",
      format: "group_playoff",
      playoffConfig: {
        qualifiedTeamCount: 4,
        thirdPlaceMatch: true,
        placementMode: "placement_group",
        tieBreaker: "penalties",
      },
    });

    expect(settings.playoffConfig?.qualifiedTeamCount).toBe(4);
  });

  it("format ligowy zeruje konfigurację play-off", () => {
    const settings = parseTournamentSettings({
      structure: "groups",
      format: "league",
      playoffConfig: DEFAULT_PLAYOFF_CONFIG,
    });

    expect(settings.playoffConfig).toBeNull();
  });
});

describe("walidacja odrzuca błędne wartości", () => {
  it("nieznana struktura", () => {
    expect(() =>
      parseTournamentSettings({ structure: "pools", format: "league" })
    ).toThrow(TournamentConfigError);
  });

  it("nieznany format", () => {
    expect(() =>
      parseTournamentSettings({ structure: "groups", format: "knockout" })
    ).toThrow(TournamentConfigError);
  });

  it("brakujące wartości", () => {
    expect(() =>
      parseTournamentSettings({ structure: undefined, format: undefined })
    ).toThrow(TournamentConfigError);
  });
});

describe("qualifiedTeamCount", () => {
  it.each(QUALIFIED_TEAM_COUNTS)("akceptuje %i drużyn", (count) => {
    const config = parsePlayoffConfig({
      qualifiedTeamCount: count,
      thirdPlaceMatch: count >= 4,
      placementMode: "none",
      tieBreaker: "penalties",
    });

    expect(config.qualifiedTeamCount).toBe(count);
  });

  it.each([0, 1, 3, 5, 6, 7, 12, 32, -4, 4.5])(
    "odrzuca %s",
    (count) => {
      expect(() =>
        parsePlayoffConfig({
          qualifiedTeamCount: count,
          thirdPlaceMatch: false,
          placementMode: "none",
        })
      ).toThrow(TournamentConfigError);
    }
  );

  it("odrzuca wartość tekstową", () => {
    expect(() =>
      parsePlayoffConfig({
        qualifiedTeamCount: "4",
        thirdPlaceMatch: false,
        placementMode: "none",
      })
    ).toThrow(TournamentConfigError);
  });
});

describe("pozostałe pola konfiguracji play-off", () => {
  it("tieBreaker zawsze wychodzi jako penalties", () => {
    const config = parsePlayoffConfig({
      qualifiedTeamCount: 4,
      thirdPlaceMatch: true,
      placementMode: "placement_group",
    });

    expect(config.tieBreaker).toBe("penalties");
  });

  it("odrzuca inny sposób rozstrzygania remisu", () => {
    expect(() =>
      parsePlayoffConfig({
        qualifiedTeamCount: 4,
        thirdPlaceMatch: true,
        placementMode: "none",
        tieBreaker: "coin_toss",
      })
    ).toThrow(TournamentConfigError);
  });

  it("odrzuca nieznany placementMode", () => {
    expect(() =>
      parsePlayoffConfig({
        qualifiedTeamCount: 4,
        thirdPlaceMatch: true,
        placementMode: "consolation_bracket",
      })
    ).toThrow(TournamentConfigError);
  });

  it("odrzuca mecz o 3. miejsce przy drabince 2-drużynowej", () => {
    expect(() =>
      parsePlayoffConfig({
        qualifiedTeamCount: 2,
        thirdPlaceMatch: true,
        placementMode: "none",
      })
    ).toThrow(TournamentConfigError);
  });

  it("dopuszcza drabinkę 2-drużynową bez meczu o 3. miejsce", () => {
    const config = parsePlayoffConfig({
      qualifiedTeamCount: 2,
      thirdPlaceMatch: false,
      placementMode: "none",
    });

    expect(config.qualifiedTeamCount).toBe(2);
  });

  it("odrzuca thirdPlaceMatch o typie innym niż boolean", () => {
    expect(() =>
      parsePlayoffConfig({
        qualifiedTeamCount: 4,
        thirdPlaceMatch: "tak",
        placementMode: "none",
      })
    ).toThrow(TournamentConfigError);
  });
});

describe("readTournamentSettings — odczyt danych historycznych", () => {
  it("nie rzuca przy uszkodzonym JSON-ie, tylko wraca do wartości domyślnych", () => {
    const settings = readTournamentSettings({
      structure: "groups",
      format: "group_playoff",
      playoffConfig: { qualifiedTeamCount: 999 },
    });

    expect(settings.playoffConfig).toEqual(DEFAULT_PLAYOFF_CONFIG);
  });

  it("nieznana struktura wraca do 'groups' — zgodność wstecz", () => {
    const settings = readTournamentSettings({
      structure: null,
      format: null,
      playoffConfig: null,
    });

    expect(settings).toEqual({
      structure: "groups",
      format: "league",
      playoffConfig: null,
    });
  });
});

describe("checkPlayoffFeasibility — ostrzeżenie, nie blokada", () => {
  it("format ligowy zawsze przechodzi", () => {
    expect(
      checkPlayoffFeasibility({
        settings: { structure: "groups", format: "league", playoffConfig: null },
        teamCountsPerGroup: [0],
      })
    ).toEqual({ ok: true });
  });

  it("pusty turniej play-off jest DOZWOLONY przy tworzeniu", () => {
    // Drużyny są dodawane później — konfiguracja nie może tego blokować.
    const settings = parseTournamentSettings({
      structure: "groups",
      format: "group_playoff",
    });

    expect(settings.playoffConfig?.qualifiedTeamCount).toBe(4);
  });

  it("sygnalizuje zbyt małą grupę", () => {
    const result = checkPlayoffFeasibility({
      settings: parseTournamentSettings({
        structure: "groups",
        format: "group_playoff",
      }),
      teamCountsPerGroup: [7, 3],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("4");
  });

  it("przechodzi, gdy każda grupa ma dość drużyn", () => {
    expect(
      checkPlayoffFeasibility({
        settings: parseTournamentSettings({
          structure: "groups",
          format: "group_playoff",
        }),
        teamCountsPerGroup: [7, 7],
      })
    ).toEqual({ ok: true });
  });
});

describe("klucz technicznej puli", () => {
  it("nie przypomina nazwy grupy widocznej dla użytkownika", () => {
    expect(MAIN_POOL_KEY).toBe("__main__");
    expect(MAIN_POOL_KEY).not.toMatch(/^[A-Z]$/);
  });
});
