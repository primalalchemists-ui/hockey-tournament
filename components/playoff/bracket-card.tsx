import type { BracketTeamView } from "@/lib/data/postgres/playoff-engine";

/**
 * Wysokość karty i odstęp w parze.
 *
 * UWAGA: connectory NIE liczą już z tych stałych swojej geometrii —
 * wynika ona z layoutu (patrz .bracket-connector w globals.css).
 * Stała wysokość zostaje, bo gwarantuje równe środki obu kart w parze,
 * a więc idealnie poziome odnogi klamry.
 */
export const CARD_HEIGHT_REM = 5;
export const CARD_GAP_REM = 1.5;

type BracketCardProps = {
  home: BracketTeamView | null;
  away: BracketTeamView | null;
  homeLabel: string;
  awayLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  tone: "active" | "completed" | "pending";
  /** Token etapu — cienki akcent odróżniający rundy od siebie. */
  accent?: string;
};

function TeamLogo({ team }: { team: BracketTeamView | null }) {
  if (team?.logoUrl) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
        className="h-6 w-6 shrink-0 rounded-md bg-white/10 object-contain"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[9px] font-bold uppercase text-white/60"
    >
      {team?.logoText?.slice(0, 3) ?? "—"}
    </span>
  );
}

function TeamRow({
  team,
  label,
  score,
  isWinner,
  isFinished,
}: {
  team: BracketTeamView | null;
  label: string;
  score: number | null;
  isWinner: boolean;
  isFinished: boolean;
}) {
  return (
    <div className="relative flex flex-1 items-center gap-2 px-3">
      {/* Zwycięzca: cienki akcent przy krawędzi, bez zielonej płachty. */}
      <span
        aria-hidden="true"
        className={[
          "absolute inset-y-1 left-0 w-0.5 rounded-full",
          isWinner ? "bg-amber-300/80" : "bg-transparent",
        ].join(" ")}
      />

      <span className="stat-num w-3.5 shrink-0 text-[10px] font-semibold text-white/45">
        {team?.seed ?? ""}
      </span>

      <TeamLogo team={team} />

      {/*
        PLACEHOLDER JEST ZNAKIEM ZAPYTANIA.

        Rozbudowane opisy slotu zaśmiecały kartę — zależność między
        rundami i tak pokazują connectory oraz układ drabinki. Semantyka
        nie ginie: pełny opis zostaje w aria-label, więc czytnik ekranu
        wie, kto ma tu wejść.
      */}
      <span
        className={[
          "min-w-0 flex-1 truncate text-[13px] leading-tight",
          team
            ? isWinner
              ? "font-semibold text-white"
              : "font-medium text-white/85"
            : "font-semibold text-white/35",
        ].join(" ")}
        aria-label={team ? undefined : `${label} — jeszcze nieustalony`}
      >
        {team ? team.name : "?"}
      </span>

      {/* Wynik — najmocniejszy element karty. Brak wyniku NIE jest zerem. */}
      <span
        className={[
          "stat-num w-6 shrink-0 text-right text-base font-bold",
          isWinner ? "text-white" : "text-white/70",
        ].join(" ")}
      >
        {isFinished && score !== null ? score : ""}
      </span>
    </div>
  );
}

export function BracketCard({
  home,
  away,
  homeLabel,
  awayLabel,
  homeScore,
  awayScore,
  winnerTeamId,
  tone,
  accent,
}: BracketCardProps) {
  const isFinished = homeScore !== null && awayScore !== null;

  const toneClass =
    tone === "active"
      ? "bracket-card-active"
      : tone === "pending"
        ? "bracket-card-pending"
        : "";

  return (
    <div
      className={[
        "bracket-card flex flex-col",
        toneClass,
        // Akcent rundy: krawędź i cienki pasek, nigdy pełna płachta koloru.
        accent ? `round-accent-${accent} bracket-card-accent` : "",
      ].join(" ")}
      style={{ height: `${CARD_HEIGHT_REM}rem` }}
    >
      <TeamRow
        team={home}
        label={homeLabel}
        score={homeScore}
        isWinner={Boolean(winnerTeamId && home && winnerTeamId === home.teamId)}
        isFinished={isFinished}
      />

      <div className="mx-3 h-px bg-white/10" />

      <TeamRow
        team={away}
        label={awayLabel}
        score={awayScore}
        isWinner={Boolean(winnerTeamId && away && winnerTeamId === away.teamId)}
        isFinished={isFinished}
      />
    </div>
  );
}
