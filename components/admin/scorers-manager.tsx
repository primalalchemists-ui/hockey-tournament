"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Scorer, Team } from "@/types/tournament";

type ScorersManagerProps = {
  scorers: Scorer[];
  teams: Team[];
  onAddScorer: () => void;
  onRemoveScorer: (scorerId: string) => void;
  onUpdateScorer: (
    scorerId: string,
    field: "playerName" | "jerseyNumber" | "goals" | "teamId",
    value: string
  ) => void;
};

export function ScorersManager({
  scorers,
  teams,
  onAddScorer,
  onRemoveScorer,
  onUpdateScorer,
}: ScorersManagerProps) {
  const sortedScorers = [...scorers].sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.playerName.localeCompare(b.playerName);
  });

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Strzelcy</h2>

        <button
          type="button"
          onClick={onAddScorer}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Dodaj zawodnika
        </button>
      </div>

      <div className="space-y-3 p-4 sm:p-6">
        {sortedScorers.length === 0 ? (
          <div className="text-sm text-slate-500">Brak zawodników.</div>
        ) : (
          sortedScorers.map((scorer, index) => (
            <div
              key={scorer.id}
              className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[70px_minmax(220px,1.4fr)_120px_120px_minmax(220px,1fr)_44px]"
            >
              <div className="flex items-center text-sm font-semibold text-slate-900">
                {index + 1}.
              </div>

              <input
                value={scorer.playerName}
                onChange={(event) =>
                  onUpdateScorer(scorer.id, "playerName", event.target.value)
                }
                placeholder="Imię i nazwisko"
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />

              <input
                value={scorer.jerseyNumber ?? ""}
                onChange={(event) =>
                  onUpdateScorer(scorer.id, "jerseyNumber", event.target.value)
                }
                placeholder="Numer"
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />

              <input
                value={scorer.goals}
                onChange={(event) =>
                  onUpdateScorer(scorer.id, "goals", event.target.value)
                }
                placeholder="Bramki"
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />

              <select
                value={scorer.teamId}
                onChange={(event) =>
                  onUpdateScorer(scorer.id, "teamId", event.target.value)
                }
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              >
                <option value="">Wybierz drużynę</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onRemoveScorer(scorer.id)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-300 text-rose-700 transition hover:bg-rose-50"
                title="Usuń zawodnika"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}