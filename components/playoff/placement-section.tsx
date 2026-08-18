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

        <ul className="mt-3 space-y-2">
          {placement.matches.map((match) => {
            const played = match.homeScore !== null && match.awayScore !== null;

            return (
              <li
                key={match.externalId}
                className="ice-panel flex items-center gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <TeamCell
                    name={match.home.name}
                    logoUrl={match.home.logoUrl}
                  />
                </div>

                {/* Wynik nierozegranego meczu NIE jest pokazywany jako 0:0. */}
                <span
                  className={[
                    "stat-num shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold",
                    played
                      ? "bg-slate-900/85 text-white"
                      : "bg-white/70 text-slate-400",
                  ].join(" ")}
                >
                  {played ? `${match.homeScore} : ${match.awayScore}` : "—"}
                </span>

                <div className="min-w-0 flex-1">
                  <TeamCell
                    name={match.away.name}
                    logoUrl={match.away.logoUrl}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
