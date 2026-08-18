import type { PlacementView } from "@/lib/data/postgres/playoff-engine";
import { ColumnHelp } from "@/components/ui/column-help";
import { EdgeScroller } from "@/components/ui/edge-scroller";

type PlacementSectionProps = {
  placement: PlacementView;
};

function TeamCell({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[9px] font-semibold uppercase text-slate-500">
            {name.slice(0, 3)}
          </span>
        )}
      </span>
      <span className="team-name truncate text-sm">{name}</span>
    </div>
  );
}

type SideOutcome = "win" | "loss" | "neutral";

function sideOutcome(won: boolean, played: boolean): SideOutcome {
  if (!played) return "neutral";
  return won ? "win" : "loss";
}

/*
  Akcent zwycięzcy i przegranego korzysta DOKŁADNIE z tej samej rodziny
  kolorów, co matryca wyników (emerald / rose). Żadnych nowych tokenów
  i żadnych jaskrawych połówek: cienka obwódka i ledwie widoczne tło.
*/
const OUTCOME_CLASSES: Record<SideOutcome, string> = {
  win: "border border-emerald-200 bg-emerald-50/70",
  loss: "border border-rose-200 bg-rose-50/60",
  neutral: "border border-transparent",
};

function TeamSide({
  team,
  outcome,
  align = "start",
}: {
  team: { name: string; logoUrl: string | null };
  outcome: SideOutcome;
  align?: "start" | "end";
}) {
  return (
    <span
      data-testid="placement-team-side"
      data-outcome={outcome}
      className={[
        "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1",
        align === "end" ? "flex-row-reverse text-right" : "",
        OUTCOME_CLASSES[outcome],
      ].join(" ")}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--surface-border)] bg-white/70">
        {team.logoUrl ? (
          <img
            src={team.logoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[9px] font-semibold uppercase text-slate-500">
            {team.name.slice(0, 3)}
          </span>
        )}
      </span>

      {/* Długie nazwy klubów muszą się zmieścić w wąskiej karcie. */}
      <span className="team-name truncate text-xs sm:text-sm">{team.name}</span>
    </span>
  );
}

/**
 * Minigrupa klasyfikacyjna — to NIE jest drabinka, tylko zwykły
 * round-robin. Używa tego samego języka wizualnego co tabela grupowa:
 * ta sama karta, ta sama tabela, te same odstępy. Różni ją wyłącznie
 * nagłówek mówiący, o które miejsca toczy się walka.
 */
export function PlacementSection({ placement }: PlacementSectionProps) {
  const rangeLabel =
    placement.positionFrom === placement.positionTo
      ? `${placement.positionFrom}`
      : `${placement.positionFrom}–${placement.positionTo}`;

  return (
    <section className="ice-card flush-card" aria-label={`Klasyfikacja miejsc ${rangeLabel}`}>
      <div className="ice-card-head">
        <p className="section-eyebrow">Walka o dalsze miejsca</p>
        <h3 className="section-title mt-0.5">Klasyfikacja miejsc {rangeLabel}</h3>
      </div>

      <EdgeScroller label="Tabela minigrupy — przewijana w poziomie">
        <table className="ice-table min-w-full">
          <thead>
            <tr>
              <th className="text-center">Poz.</th>
              <th className="text-left">Drużyna</th>
              <th className="text-center">
                <ColumnHelp code="M" />
              </th>
              <th className="text-center">
                <ColumnHelp code="Pkt" />
              </th>
              <th className="text-center">
                <ColumnHelp code="Bil." />
              </th>
            </tr>
          </thead>
          <tbody>
            {placement.standings.map((row) => (
              <tr key={row.teamId}>
                <td className="text-center">
                  <span className="stat-num inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--surface-border)] bg-white/80 text-sm font-bold text-slate-700">
                    {row.isTieUnresolved
                      ? "?"
                      : placement.positionFrom + row.position - 1}
                  </span>
                </td>
                <td>
                  <TeamCell name={row.teamName} logoUrl={row.logoUrl ?? null} />
                </td>
                <td className="text-center">{row.played}</td>
                <td className="stat-key text-center">{row.points}</td>
                <td className="text-center font-semibold">{row.goalDifference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </EdgeScroller>

      <div className="border-t border-[var(--surface-line)] px-4 py-4 sm:px-6">
        <h4 className="section-eyebrow">Mecze</h4>

        {/*
          Trzy mecze minigrupy nie potrzebują pełnej szerokości karty.
          Na desktopie stoją obok siebie w jednym rzędzie, na telefonie
          układają się jeden pod drugim — bez przewijania w poziomie.
        */}
        <ul
          data-testid="placement-match-grid"
          className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3"
        >
          {placement.matches.map((match) => {
            const played = match.homeScore !== null && match.awayScore !== null;

            const homeWon = played && match.homeScore! > match.awayScore!;
            const awayWon = played && match.awayScore! > match.homeScore!;

            return (
              <li
                key={match.externalId}
                data-testid="placement-match-card"
                className="ice-panel flex min-w-0 items-center gap-2 px-2.5 py-2"
              >
                <TeamSide team={match.home} outcome={sideOutcome(homeWon, played)} />

                {/* Wynik nierozegranego meczu NIE jest pokazywany jako 0:0. */}
                <span
                  className={[
                    "stat-num shrink-0 rounded-lg px-2 py-1 text-sm font-bold",
                    played
                      ? "bg-slate-900/85 text-white"
                      : "bg-white/70 text-slate-400",
                  ].join(" ")}
                >
                  {played ? `${match.homeScore} : ${match.awayScore}` : "—"}
                </span>

                <TeamSide
                  team={match.away}
                  outcome={sideOutcome(awayWon, played)}
                  align="end"
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
