// components/match-matrix.tsx
import type { Group, Match } from "@/types/tournament";

type MatchMatrixProps = {
  group: Group;
};

type ResultTone = "neutral" | "win" | "draw" | "loss";

function findMatches(group: Group, homeTeamId: string, awayTeamId: string): Match[] {
  return group.matches.filter(
    (item) => item.homeTeamId === homeTeamId && item.awayTeamId === awayTeamId
  );
}

function getResultTone(matches: Match[], rowTeamId: string): ResultTone {
  if (matches.length === 0) return "neutral";

  const totals = matches.reduce(
    (acc, match) => {
      const isHome = match.homeTeamId === rowTeamId;
      acc.scored += isHome ? match.homeScore : match.awayScore;
      acc.conceded += isHome ? match.awayScore : match.homeScore;
      return acc;
    },
    { scored: 0, conceded: 0 }
  );

  if (totals.scored > totals.conceded) return "win";
  if (totals.scored < totals.conceded) return "loss";
  return "draw";
}

function getResultClasses(tone: ResultTone) {
  if (tone === "win") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (tone === "loss") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (tone === "draw") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function ResultLegend() {
  const items = [
    { label: "Wygrana", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { label: "Remis", className: "border-amber-200 bg-amber-50 text-amber-700" },
    { label: "Porażka", className: "border-rose-200 bg-rose-50 text-rose-700" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.label}
          className={[
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
            item.className,
          ].join(" ")}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function MatchMatrix({ group }: MatchMatrixProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Wyniki</h2>
          {/* <ResultLegend /> */}
        </div>
      </div>

     <div className="overflow-x-auto pb-4">
  <table className="w-full border-collapse text-xs sm:text-sm p-16">
    <thead className="w-full">
      <tr>
        <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-600"></th>

        {group.teams.map((team) => (
          <th
            key={team.id}
            className="bg-slate-50 px-2 py-3 text-center font-semibold text-slate-600"
          >
            <div className="mx-auto flex w-20 flex-col items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[9px] font-semibold uppercase text-slate-600">
                {team.logoText}
              </div>
              {/* <span className="line-clamp-2 text-[11px] leading-tight sm:text-xs">
                {team.name}
              </span> */}
            </div>
          </th>
        ))}
      </tr>
    </thead>

    <tbody>
      {group.teams.map((rowTeam, rowIndex) => (
        <tr
          key={rowTeam.id}
          className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
        >
          <td
            className={[
              "sticky left-0 z-30 px-3 py-3 font-medium text-slate-900",
              "overflow-hidden isolate will-change-transform [transform:translateZ(0)] [backface-visibility:hidden]",
              rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50",
            ].join(" ")}
          >
            <div
              className={[
                "relative z-10 flex items-center gap-3",
                "will-change-transform [transform:translateZ(0)] [backface-visibility:hidden]",
                rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50",
              ].join(" ")}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-[9px] font-semibold uppercase text-slate-600">
                {rowTeam.logoText}
              </div>

              <span className="truncate">{rowTeam.name}</span>
            </div>
          </td>

          {group.teams.map((colTeam, colIndex) => {
            const isSame = rowTeam.id === colTeam.id;
            const matches = findMatches(group, rowTeam.id, colTeam.id);
            const tone = isSame ? "neutral" : getResultTone(matches, rowTeam.id);
            const isLastCol = colIndex === group.teams.length - 1;

            return (
              <td
                key={colTeam.id}
                className={isLastCol ? "pl-2 pr-4 py-2 text-center" : "px-2 py-2 text-center"}
              >
                <div
                  className={[
                    "mx-auto flex min-h-10 flex-col items-center justify-center rounded-xl border text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]",
                    isSame
                      ? "border-slate-200 bg-slate-100 text-slate-400"
                      : getResultClasses(tone),
                  ].join(" ")}
                >
                  {isSame ? (
                    "-"
                  ) : matches.length > 0 ? (
                    matches.map((match) => (
                      <span key={match.id} className="leading-tight">
                        {match.homeScore} : {match.awayScore}
                      </span>
                    ))
                  ) : (
                    "—"
                  )}
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
</div>
    </section>
  );
}