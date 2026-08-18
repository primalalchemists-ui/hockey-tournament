"use client";

import { ShareTableButton } from "@/components/ShareTableButton";
import type { Scorer, Team } from "@/types/tournament";

type ScorersTableProps = {
  scorers: Scorer[];
  teams: Team[];
};

function getSortedScorers(scorers: Scorer[]) {
  return [...scorers].sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });
}

function getTeamMap(teams: Team[]) {
  return new Map(teams.map((team) => [team.id, team]));
}

function renderPositionBadge(position: number) {
  if (position === 1) {
    return (
      <img
        src="/images/medals/gold.png"
        alt="1 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (position === 2) {
    return (
      <img
        src="/images/medals/silver.png"
        alt="2 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (position === 3) {
    return (
      <img
        src="/images/medals/bronze.png"
        alt="3 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 items-center justify-center stat-num rounded-full border border-[var(--surface-border)] bg-white/80 text-sm font-bold text-slate-700">
      {position}
    </span>
  );
}

export function ScorersTable({ scorers, teams }: ScorersTableProps) {
  const sortedScorers = getSortedScorers(scorers);
  const teamMap = getTeamMap(teams);

  return (
    <section className="ice-card flush-card">
      <div className="ice-card-head">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Strzelcy</h2>

          <ShareTableButton shareText="Sprawdź TOP 5 najlepszych strzelców" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="ice-table min-w-full">
          <thead>
            <tr>
              <th className="text-center">Poz.</th>
              <th className="text-left">Drużyna</th>
              <th className="text-left">Zawodnik</th>
              <th className="text-center">Nr</th>
              <th className="text-center">Bramki</th>
            </tr>
          </thead>

          <tbody>
            {sortedScorers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Brak strzelców.
                </td>
              </tr>
            ) : (
              sortedScorers.map((scorer, index) => {
                const team = teamMap.get(scorer.teamId);
                const position = index + 1;

                return (
                  <tr key={scorer.id} className="border-t border-slate-100">
                    <td>
                      <div className="flex justify-center">
                        {renderPositionBadge(position)}
                      </div>
                    </td>

                    <td>
                      <div className="flex min-w-[180px] items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--surface-border)] bg-white/70">
                          {team?.logoUrl ? (
                            <img
                              src={team.logoUrl}
                              alt={team.name}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] font-semibold uppercase text-slate-600">
                              {team?.shortName || team?.logoText || "LOGO"}
                            </span>
                          )}
                        </div>

                        <span className="font-medium text-slate-900">
                          {team?.name || "Brak drużyny"}
                        </span>
                      </div>
                    </td>

                    <td className="team-name">
                      {scorer.playerName}
                    </td>

                    <td className="text-center">
                      {scorer.jerseyNumber ?? "—"}
                    </td>

                    <td className="stat-key text-center">
                      {scorer.goals}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}