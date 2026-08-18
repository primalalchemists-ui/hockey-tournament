import type {
  PlayoffRoundView,
  PlayoffScopeView,
} from "@/lib/data/postgres/playoff-engine";

import { BracketCard, CARD_GAP_REM } from "./bracket-card";

type PlayoffBracketProps = {
  scope: PlayoffScopeView;
  backgroundUrl: string | null;
};

/** Szerokość poziomej odnogi klamry; suma dwóch < odstęp między kolumnami. */
const CONNECTOR_RUN_REM = 0.65;

function toneFor(status: string) {
  if (status === "active") return "active" as const;
  if (status === "completed") return "completed" as const;
  return "pending" as const;
}

/**
 * SCENA DRABINKI.
 *
 * Grafika turnieju jest środowiskiem, nie dekoracją karty: ciemny scrim
 * i winieta gwarantują, że dynamiczne karty czytają się nad DOWOLNYM
 * artworkiem, a bez artworku scena nadal wygląda kompletnie.
 */
function BracketScene({
  backgroundUrl,
  title,
  subtitle,
  children,
  label,
}: {
  backgroundUrl: string | null;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="bracket-scene flush-card" aria-label={label}>
      {/* Tło jest dekoracyjne; brak grafiki = neutralna, ciemna tafla. */}
      <div
        data-testid="bracket-background"
        data-has-artwork={backgroundUrl ? "true" : "false"}
        className="absolute inset-0 bg-slate-900 bg-cover bg-center"
        style={
          backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined
        }
        aria-hidden="true"
      />

      {/* Scrim + winieta: separacja kart od artworku, stały kontrast. */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-950/92 via-slate-900/82 to-slate-950/94"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(148,197,236,0.16),rgba(2,6,23,0)_60%)]"
        aria-hidden="true"
      />

      <div className="relative px-4 py-5 sm:px-6 sm:py-6">
        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">
          {title}
        </h3>
        {subtitle}
        {children}
      </div>
    </section>
  );
}

function RoundColumn({
  round,
  isLast,
}: {
  round: PlayoffRoundView;
  isLast: boolean;
}) {
  const pairs: PlayoffRoundView["matches"][] = [];

  for (let index = 0; index < round.matches.length; index += 2) {
    pairs.push(round.matches.slice(index, index + 2));
  }

  return (
    <div className="flex min-w-[15rem] flex-col gap-3 sm:min-w-[16rem]">
      <div className="flex items-center gap-2">
        <h4 className="bracket-round-label">{round.label}</h4>

        {round.status === "active" ? (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-sky-300"
          />
        ) : null}
      </div>

      <div
        className="flex flex-1 flex-col justify-around"
        style={{ gap: `${CARD_GAP_REM}rem` }}
      >
        {pairs.map((pair, pairIndex) => (
          <div
            key={pairIndex}
            className="bracket-pair flex flex-col"
            style={{
              gap: `${CARD_GAP_REM}rem`,
              // Zmienne CSS zamiast magic numbers w JS — klamra liczy
              // swoją geometrię z realnej wysokości pary.
              ["--pair-gap" as string]: `${CARD_GAP_REM}rem`,
              ["--connector-run" as string]: `${CONNECTOR_RUN_REM}rem`,
            }}
          >
            {pair.map((match) => (
              <BracketCard
                key={match.externalId}
                home={match.home}
                away={match.away}
                homeLabel={match.homeLabel}
                awayLabel={match.awayLabel}
                homeScore={match.homeScore}
                awayScore={match.awayScore}
                winnerTeamId={match.winnerTeamId}
                tone={toneFor(round.status)}
              />
            ))}

            {!isLast && pair.length === 2 ? (
              <span aria-hidden="true" className="bracket-connector" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayoffBracket({ scope, backgroundUrl }: PlayoffBracketProps) {
  // Mecz o 3. miejsce nie należy do drzewa — pokazujemy go osobno,
  // tak jak robią to grafiki transmisyjne.
  const treeRounds = scope.rounds.filter((round) => round.kind !== "third_place");
  const thirdPlace = scope.rounds.find((round) => round.kind === "third_place");

  if (treeRounds.length === 0) return null;

  return (
    <BracketScene
      backgroundUrl={backgroundUrl}
      title="Faza play-off"
      label="Drabinka fazy pucharowej"
    >
      <div
        className="ice-scroll scroll-hint mt-4 overflow-x-auto pb-2"
        tabIndex={0}
        role="region"
        aria-label="Przewijana drabinka"
        data-testid="bracket-scroll"
      >
        <div className="flex min-w-max gap-6 sm:gap-8">
          {treeRounds.map((round, index) => (
            <RoundColumn
              key={round.kind}
              round={round}
              isLast={index === treeRounds.length - 1}
            />
          ))}
        </div>
      </div>

      {thirdPlace ? (
        <div className="mt-6 max-w-sm border-t border-white/10 pt-4">
          <h4 className="bracket-round-label">{thirdPlace.label}</h4>

          <div className="mt-3">
            {thirdPlace.matches.map((match) => (
              <BracketCard
                key={match.externalId}
                home={match.home}
                away={match.away}
                homeLabel={match.homeLabel}
                awayLabel={match.awayLabel}
                homeScore={match.homeScore}
                awayScore={match.awayScore}
                winnerTeamId={match.winnerTeamId}
                tone={toneFor(thirdPlace.status)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </BracketScene>
  );
}

/* ==========================================================================
 * PODGLĄD PRZED ZAMROŻENIEM
 * ======================================================================== */

export function PlayoffPreview({
  scope,
  backgroundUrl,
}: {
  scope: PlayoffScopeView;
  backgroundUrl: string | null;
}) {
  if (!scope.preview) return null;

  const { preview } = scope;

  return (
    <BracketScene
      backgroundUrl={backgroundUrl}
      title="Faza play-off"
      label="Podgląd rozstawienia fazy pucharowej"
      subtitle={
        <>
          <p className="mt-1 text-sm text-white/70">Rozstawienie na ten moment</p>
          <p className="mt-1 text-xs text-amber-200/90">
            Rozstawienie może się zmienić do zakończenia fazy grupowej.
          </p>

          {preview.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-2 rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100"
            >
              {warning}
            </p>
          ))}
        </>
      }
    >
      <div
        className="ice-scroll scroll-hint mt-4 overflow-x-auto pb-2"
        tabIndex={0}
        role="region"
        aria-label="Przewijany podgląd rozstawienia"
        data-testid="bracket-scroll"
      >
        <div className="flex min-w-max gap-6 sm:gap-8">
          <div className="flex min-w-[15rem] flex-col gap-3 sm:min-w-[16rem]">
            <h4 className="bracket-round-label">Pierwsza runda</h4>

            <div className="flex flex-col" style={{ gap: `${CARD_GAP_REM}rem` }}>
              {preview.pairs.map((pair) => (
                <BracketCard
                  key={pair.slotIndex}
                  home={
                    pair.homeTeamId
                      ? {
                          teamId: pair.homeTeamId,
                          name: pair.homeTeamName ?? pair.homeTeamId,
                          logoUrl: pair.homeLogoUrl,
                          logoText: null,
                          seed: pair.homeSeed,
                        }
                      : null
                  }
                  away={
                    pair.awayTeamId
                      ? {
                          teamId: pair.awayTeamId,
                          name: pair.awayTeamName ?? pair.awayTeamId,
                          logoUrl: pair.awayLogoUrl,
                          logoText: null,
                          seed: pair.awaySeed,
                        }
                      : null
                  }
                  homeLabel={`Miejsce ${pair.homeSeed}`}
                  awayLabel={`Miejsce ${pair.awaySeed}`}
                  homeScore={null}
                  awayScore={null}
                  winnerTeamId={null}
                  tone="pending"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </BracketScene>
  );
}
