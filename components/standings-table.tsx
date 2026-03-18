import type { StandingRow } from "@/types/tournament";

type StandingsTableProps = {
  groupName: string;
  rows: StandingRow[];
};

function renderPositionBadge(row: StandingRow) {
  if (row.isTieUnresolved) {
    return (
      <span
        title={row.tieNote ?? "Miejsce nierozstrzygnięte"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-base font-bold text-amber-700 shadow-sm"
      >
        ?
      </span>
    );
  }

  if (row.position === 1) {
    return (
      <img
        src="/images/medals/gold.png"
        alt="1 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (row.position === 2) {
    return (
      <img
        src="/images/medals/silver.png"
        alt="2 miejsce"
        className="h-9 w-9 object-contain"
      />
    );
  }

  if (row.position === 3) {
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
      {row.position}
    </span>
  );
}

export function StandingsTable({ groupName, rows }: StandingsTableProps) {
  const unresolvedRows = rows.filter((row) => row.isTieUnresolved);

  const uniqueNotes = Array.from(
    new Set(
      unresolvedRows
        .map((row) => row.tieNote)
        .filter((note): note is string => Boolean(note))
    )
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Ranking</h2>

        {uniqueNotes.length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {uniqueNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}
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
                  <div className="flex justify-center">{renderPositionBadge(row)}</div>
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

                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{row.teamName}</span>

                      {row.isTieUnresolved && row.tieNote && (
                        <span className="text-xs font-medium text-amber-700">
                          O miejscu decydują rzuty karne
                        </span>
                      )}
                    </div>
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