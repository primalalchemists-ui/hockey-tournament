import type { StandingRow } from "@/types/tournament";

/**
 * MINIGRUPA KLASYFIKACYJNA — rozstrzyganie remisów nie do rozstrzygnięcia.
 *
 * Minigrupa o miejsca poza podium liczy się normalnym `calculateStandings`
 * i w większości turniejów to wystarcza. Bywa jednak układ zamknięty:
 * trzy drużyny, każda z jedną wygraną i jedną porażką, komplet po 3 punkty,
 * bilans 0, bramki 1:1. Tabela nie ma czym ich rozdzielić i słusznie
 * oznacza je jako nierozstrzygnięte.
 *
 * Organizator rozstrzyga to regulaminowo: liczy się BILANS Z FAZY GRUPOWEJ.
 * Ta funkcja robi dokładnie to i nic więcej.
 *
 * DLACZEGO OSOBNA FUNKCJA, A NIE ROZSZERZENIE `calculateStandings`:
 * tamta liczy tabelę round-robin i nie ma prawa wiedzieć o istnieniu
 * wcześniejszej fazy. Ta reguła należy wyłącznie do play-offu, więc mieszka
 * w warstwie play-offu.
 */

/** Wiersz zamrożonej tabeli grupowej — tylko to, czego reguła potrzebuje. */
export type FrozenGroupRow = {
  teamId: string;
  /** Oficjalne miejsce w fazie grupowej. */
  position: number;
  goalDifference: number;
};

export type PlacementResolution = {
  /** Kolejność po zastosowaniu reguły; pozycje przenumerowane od 1. */
  standings: StandingRow[];
  /**
   * Drużyny, których NIE dało się rozdzielić.
   *
   * Puste w normalnym turnieju. Niepuste znaczy, że zabrakło zamrożonej
   * tabeli — i wtedy świadomie nie udajemy, że miejsce jest znane.
   */
  unresolvedTeamIds: string[];
};

/** Klucz zbioru remisujących — ta sama grupa dostaje ten sam klucz. */
function tieKey(row: StandingRow): string {
  return [row.teamId, ...(row.tieWithTeamIds ?? [])].sort().join("|");
}

/**
 * Rozstrzyga remisy w minigrupie bilansem z fazy grupowej.
 *
 * KOLEJNOŚĆ KRYTERIÓW (tylko dla wierszy, których minigrupa nie rozdzieliła):
 *
 *   1. wynik `calculateStandings` minigrupy — nietknięty,
 *   2. różnica bramek z zamrożonej tabeli grupowej (większa = wyżej),
 *   3. miejsce w zamrożonej tabeli grupowej (mniejsze = wyżej).
 *
 * Miejsce w grupie jest ostatnim krokiem CELOWO: to już jest werdykt
 * oficjalnego rankingu fazy grupowej, więc nie trzeba dokładać kolejnych
 * wymyślonych kryteriów. Świadomie NIE używamy `sourceOrder`, kolejności
 * rejestracji, alfabetu ani identyfikatorów — to nie są rozstrzygnięcia
 * sportowe.
 */
export function resolvePlacementStandings(input: {
  /** Wynik `calculateStandings` dla minigrupy. */
  standings: StandingRow[];
  /** Zamrożona tabela fazy grupowej. Pusta = brak czym rozstrzygać. */
  frozen: FrozenGroupRow[];
}): PlacementResolution {
  const { standings, frozen } = input;

  const frozenByTeam = new Map(frozen.map((row) => [row.teamId, row]));

  /* Nierozstrzygnięte wiersze, pogrupowane po zbiorze remisujących drużyn. */
  const blocks = new Map<string, number[]>();

  standings.forEach((row, index) => {
    if (!row.isTieUnresolved) return;

    const key = tieKey(row);
    const list = blocks.get(key) ?? [];
    list.push(index);
    blocks.set(key, list);
  });

  if (blocks.size === 0) {
    return { standings, unresolvedTeamIds: [] };
  }

  const resolved = [...standings];
  const unresolvedTeamIds: string[] = [];

  for (const indices of blocks.values()) {
    const rows = indices.map((index) => standings[index]);

    /*
      Rozstrzygamy WYŁĄCZNIE komplet. Gdyby choć jednej drużynie brakowało
      zamrożonego wiersza, porównanie byłoby loterią — wtedy zostawiamy blok
      nietknięty i zgłaszamy go wyżej.
    */
    const complete = rows.every((row) => frozenByTeam.has(row.teamId));

    if (!complete) {
      unresolvedTeamIds.push(...rows.map((row) => row.teamId));
      continue;
    }

    const ordered = [...rows].sort((left, right) => {
      const a = frozenByTeam.get(left.teamId)!;
      const b = frozenByTeam.get(right.teamId)!;

      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }

      return a.position - b.position;
    });

    // Rozstrzygnięte wiersze wracają dokładnie w te same miejsca tabeli.
    indices.forEach((index, slot) => {
      resolved[index] = {
        ...ordered[slot],
        isTieUnresolved: false,
        tieWithTeamIds: [],
        tieNote: undefined,
      };
    });
  }

  return {
    standings: resolved.map((row, index) => ({ ...row, position: index + 1 })),
    unresolvedTeamIds,
  };
}
