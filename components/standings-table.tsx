// components/standings-table.tsx
import type { StandingRow } from "@/types/tournament";

type StandingsTableProps = {
  groupName: string;
  rows: StandingRow[];
};

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
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm">
      {position}
    </span>
  );
}

export function StandingsTable({ groupName, rows }: StandingsTableProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Ranking</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3 text-center font-semibold">Poz.</th>
              <th className="px-3 py-3 text-left font-semibold">Drużyna</th>
              <th className="px-3 py-3 text-center font-semibold">M</th>
              <th className="px-3 py-3 text-center font-semibold">W</th>
              <th className="px-3 py-3 text-center font-semibold">R</th>
              <th className="px-3 py-3 text-center font-semibold">P</th>
              <th className="px-3 py-3 text-center font-semibold">Pkt</th>
              <th className="px-3 py-3 text-center font-semibold">G+</th>
              <th className="px-3 py-3 text-center font-semibold">G-</th>
              <th className="px-3 py-3 text-center font-semibold">Bil.</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row.teamId}
                className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50"}
              >
                <td className="px-3 py-3 text-center">
                  <div className="flex justify-center">
                    {renderPositionBadge(row.position)}
                  </div>
                </td>

                <td className="px-3 py-3">
                  <div className="flex min-w-[180px] items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {row.logoUrl ? (
                        <img
                          src={row.logoUrl}
                          alt={row.teamName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-semibold uppercase text-slate-600">
                          {row.logoText ?? "LOGO"}
                        </span>
                      )}
                    </div>

                    <span className="font-medium text-slate-900">{row.teamName}</span>
                  </div>
                </td>

                <td className="px-3 py-3 text-center">{row.played}</td>
                <td className="px-3 py-3 text-center">{row.wins}</td>
                <td className="px-3 py-3 text-center">{row.draws}</td>
                <td className="px-3 py-3 text-center">{row.losses}</td>
                <td className="px-3 py-3 text-center font-bold text-slate-900">
                  {row.points}
                </td>
                <td className="px-3 py-3 text-center">{row.goalsFor}</td>
                <td className="px-3 py-3 text-center">{row.goalsAgainst}</td>
                <td className="px-3 py-3 text-center font-semibold">
                  {row.goalDifference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}