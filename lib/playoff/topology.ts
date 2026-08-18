import type { QualifiedTeamCount } from "@/types/tournament-config";

import { planBracket, type MatchSlotSource } from "./bracket-plan";
import type { BracketRoundKind, BracketRoundStatus } from "./phases";
import { ROUND_LABELS } from "./phases";
import { describeRoundTone, type StageTone } from "./stage";

/**
 * PEŁNA TOPOLOGIA DRABINKI — czysta funkcja, zero IO.
 *
 * Kibic widzi całe drzewko OD POCZĄTKU turnieju: półfinały, finał i mecz
 * o 3. miejsce istnieją jako sloty, zanim ktokolwiek zagra. Wcześniej
 * przed zamrożeniem pokazywana była wyłącznie pierwsza runda, więc format
 * turnieju nie był czytelny.
 *
 * Uczestnicy pojawiają się WYŁĄCZNIE tam, gdzie są znani:
 *
 *  - pierwsza runda przed zamrożeniem — z bieżącej tabeli, ale dopiero
 *    gdy w tej grupie padł pierwszy wynik,
 *  - dalsze rundy — dopiero z rzeczywistego rozstrzygnięcia meczu.
 *
 * Nigdy nie przewidujemy zwycięzcy meczu, który się nie odbył.
 */

export type TopologyMatch = {
  externalId: string;
  kind: BracketRoundKind;
  roundOrder: number;
  slotIndex: number;
  homeSource: MatchSlotSource;
  awaySource: MatchSlotSource;
  /** null = uczestnik jeszcze nieznany. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** true, gdy skład tej pary wynika z bieżącej, niezamrożonej tabeli. */
  provisional: boolean;
};

export type TopologyRound = {
  kind: BracketRoundKind;
  label: string;
  order: number;
  status: BracketRoundStatus;
  tone: StageTone;
  matches: TopologyMatch[];
};

/** Mecz zapisany w bazie — pełni rolę źródła prawdy, gdy istnieje. */
export type OfficialMatch = {
  externalId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export function buildBracketTopology(input: {
  scopeKey: string;
  size: QualifiedTeamCount;
  thirdPlaceMatch: boolean;
  /** Mecze oficjalnej drabinki (po zamrożeniu). Puste przed nim. */
  officialMatches?: OfficialMatch[];
  /** Statusy rund z bazy, po externalId rundy. */
  roundStatusByKind?: Map<BracketRoundKind, BracketRoundStatus>;
  /**
   * Rozstawienie z BIEŻĄCEJ tabeli: miejsce → identyfikator drużyny.
   * Używane tylko przed zamrożeniem i tylko gdy padł pierwszy wynik.
   */
  liveSeeding?: Map<number, string> | null;
}): TopologyRound[] {
  const {
    scopeKey,
    size,
    thirdPlaceMatch,
    officialMatches = [],
    roundStatusByKind,
    liveSeeding = null,
  } = input;

  const plan = planBracket({ scopeKey, size, thirdPlaceMatch });
  const officialByExternalId = new Map(
    officialMatches.map((match) => [match.externalId, match])
  );

  const hasOfficialBracket = officialMatches.length > 0;

  return plan.rounds.map((round) => {
    const matches: TopologyMatch[] = round.matches.map((planned) => {
      const official = officialByExternalId.get(planned.externalId);

      if (official) {
        return {
          externalId: planned.externalId,
          kind: round.kind,
          roundOrder: round.order,
          slotIndex: planned.slotIndex,
          homeSource: planned.homeSource,
          awaySource: planned.awaySource,
          homeTeamId: official.homeTeamId,
          awayTeamId: official.awayTeamId,
          homeScore: official.homeScore,
          awayScore: official.awayScore,
          provisional: false,
        };
      }

      // Bez oficjalnej drabinki uczestnika zna wyłącznie pierwsza runda,
      // i tylko wtedy, gdy tabela ma już sportowe podstawy.
      const resolve = (source: MatchSlotSource): string | null =>
        source.type === "seed" && liveSeeding
          ? (liveSeeding.get(source.seed) ?? null)
          : null;

      return {
        externalId: planned.externalId,
        kind: round.kind,
        roundOrder: round.order,
        slotIndex: planned.slotIndex,
        homeSource: planned.homeSource,
        awaySource: planned.awaySource,
        homeTeamId: resolve(planned.homeSource),
        awayTeamId: resolve(planned.awaySource),
        homeScore: null,
        awayScore: null,
        provisional: !hasOfficialBracket,
      };
    });

    return {
      kind: round.kind,
      label: ROUND_LABELS[round.kind],
      order: round.order,
      status: roundStatusByKind?.get(round.kind) ?? "pending",
      tone: describeRoundTone(round.kind),
      matches,
    };
  });
}
