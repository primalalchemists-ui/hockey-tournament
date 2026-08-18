import { describe, expect, it } from "vitest";

import {
  calculatePlannedMatchCount,
  plannedMatchesForScope,
  roundRobinMatchCount,
} from "@/lib/playoff/planned-matches";
import type { PlayoffConfig } from "@/types/tournament-config";

/**
 * PLANOWANA LICZBA MECZÓW.
 *
 * Wynika z konfiguracji turnieju, nie z liczby rekordów w bazie.
 */

const U8_CONFIG: PlayoffConfig = {
  qualifiedTeamCount: 4,
  thirdPlaceMatch: true,
  placementMode: "placement_group",
  tieBreaker: "penalties",
};

describe("format ligowy", () => {
  it("liczy każdego z każdym", () => {
    expect(roundRobinMatchCount(7)).toBe(21);
    expect(roundRobinMatchCount(10)).toBe(45);
    expect(roundRobinMatchCount(1)).toBe(0);
  });

  it("B: SUN CUP U10 to 90 meczów", () => {
    expect(
      calculatePlannedMatchCount({
        format: "league",
        playoffConfig: null,
        scopes: [{ teamCount: 10 }, { teamCount: 10 }],
      })
    ).toBe(90);
  });

  it("grupy o różnych rozmiarach liczone są osobno", () => {
    expect(
      calculatePlannedMatchCount({
        format: "league",
        playoffConfig: null,
        scopes: [{ teamCount: 7 }, { teamCount: 5 }],
      })
    ).toBe(21 + 10);
  });
});

describe("format z play-offem", () => {
  it("A: grupa SUN CUP U8 to 28 meczów", () => {
    // 21 grupowych + 3 drabinka + 1 o 3. miejsce + 3 minigrupa
    expect(
      plannedMatchesForScope({
        teamCount: 7,
        format: "group_playoff",
        playoffConfig: U8_CONFIG,
      })
    ).toBe(28);
  });

  it("A: cały SUN CUP U8 to 56 meczów", () => {
    expect(
      calculatePlannedMatchCount({
        format: "group_playoff",
        playoffConfig: U8_CONFIG,
        scopes: [{ teamCount: 7 }, { teamCount: 7 }],
      })
    ).toBe(56);
  });

  it("bez minigrupy zostaje 25 meczów przy siedmiu drużynach", () => {
    expect(
      plannedMatchesForScope({
        teamCount: 7,
        format: "group_playoff",
        playoffConfig: { ...U8_CONFIG, placementMode: "none" },
      })
    ).toBe(21 + 3 + 1);
  });

  it("bez meczu o 3. miejsce i bez minigrupy zostają 24 mecze", () => {
    expect(
      plannedMatchesForScope({
        teamCount: 7,
        format: "group_playoff",
        playoffConfig: {
          ...U8_CONFIG,
          thirdPlaceMatch: false,
          placementMode: "none",
        },
      })
    ).toBe(21 + 3);
  });

  it("drabinka ma zawsze q-1 meczów", () => {
    const sizes: Array<[2 | 4 | 8 | 16, number]> = [
      [2, 1],
      [4, 3],
      [8, 7],
      [16, 15],
    ];

    for (const [qualified, knockout] of sizes) {
      const planned = plannedMatchesForScope({
        teamCount: 16,
        format: "group_playoff",
        playoffConfig: {
          qualifiedTeamCount: qualified,
          thirdPlaceMatch: false,
          placementMode: "none",
          tieBreaker: "penalties",
        },
      });

      expect(planned - roundRobinMatchCount(16)).toBe(knockout);
    }
  });

  it("mecz o 3. miejsce nie powstaje przy drabince dwudrużynowej", () => {
    // Bez półfinałów nie ma przegranych półfinalistów.
    expect(
      plannedMatchesForScope({
        teamCount: 6,
        format: "group_playoff",
        playoffConfig: {
          ...U8_CONFIG,
          qualifiedTeamCount: 2,
          thirdPlaceMatch: true,
        },
      })
    ).toBe(15 + 1 + roundRobinMatchCount(4));
  });
});
