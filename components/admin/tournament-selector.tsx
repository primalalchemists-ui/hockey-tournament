"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";

import {
  createTournamentAction,
  setCurrentTournamentAction,
  setTournamentArchivedAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import type { TournamentSummary } from "@/lib/data/types";

type TournamentSelectorProps = {
  tournaments: TournamentSummary[];
  selectedId: string;
  /** Airtable nie obsługuje wielu turniejów — wtedy pokazujemy tylko info. */
  multiTournamentEnabled: boolean;
};

const initialState: TournamentActionState = { error: null };

export function TournamentSelector({
  tournaments,
  selectedId,
  multiTournamentEnabled,
}: TournamentSelectorProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [createState, createAction, isCreatePending] = useActionState(
    createTournamentAction,
    initialState
  );
  const [currentState, setCurrentAction, isCurrentPending] = useActionState(
    setCurrentTournamentAction,
    initialState
  );
  const [archiveState, archiveAction, isArchivePending] = useActionState(
    setTournamentArchivedAction,
    initialState
  );

  const selected = tournaments.find((item) => item.id === selectedId);
  const active = tournaments.filter((item) => !item.archivedAt);
  const archived = tournaments.filter((item) => item.archivedAt);

  const errorMessage =
    createState.error ?? currentState.error ?? archiveState.error;

  useEffect(() => {
    function closeOnOutside(event: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, []);

  function openTournament(id: string) {
    setIsOpen(false);
    // Wybrany turniej trzymamy w URL-u, nie w stanie React —
    // odświeżenie strony i przyciski wstecz/dalej działają poprawnie.
    router.push(`/admin?tournament=${id}`);
  }

  function confirmSetCurrent(target: TournamentSummary) {
    const currentTitle =
      tournaments.find((item) => item.isCurrent)?.title ?? "brak";

    return window.confirm(
      `Publiczna strona zacznie pokazywać turniej:\n${target.title}\n\n` +
        `Obecnie wyświetlany:\n${currentTitle}\n\nKontynuować?`
    );
  }

  if (!multiTournamentEnabled) {
    return (
      <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
        <span className="font-semibold text-slate-900">
          {selected?.title ?? "Turniej"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          tryb jednego turnieju
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-500">Turniej:</span>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
        >
          {selected?.title ?? "Wybierz turniej"}
          <ChevronDown size={16} />
        </button>

        {selected?.isCurrent ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Wyświetlany na stronie
          </span>
        ) : selected && !selected.archivedAt ? (
          <form
            action={setCurrentAction}
            onSubmit={(event) => {
              if (!confirmSetCurrent(selected)) event.preventDefault();
            }}
          >
            <input type="hidden" name="tournamentId" value={selected.id} />
            <button
              type="submit"
              disabled={isCurrentPending}
              className="rounded-2xl border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isCurrentPending ? "Ustawianie..." : "Ustaw jako wyświetlany"}
            </button>
          </form>
        ) : null}

        {selected?.archivedAt ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            Zarchiwizowany
          </span>
        ) : null}

        {selected ? (
          <form action={archiveAction}>
            <input type="hidden" name="tournamentId" value={selected.id} />
            <input
              type="hidden"
              name="archived"
              value={selected.archivedAt ? "false" : "true"}
            />
            <button
              type="submit"
              disabled={isArchivePending}
              className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {selected.archivedAt ? "Przywróć z archiwum" : "Archiwizuj"}
            </button>
          </form>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
          {errorMessage}
        </p>
      ) : null}

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-3xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {active.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openTournament(item.id)}
                className={[
                  "flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition",
                  item.id === selectedId
                    ? "bg-slate-100 font-semibold text-slate-900"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {item.id === selectedId ? (
                    <Check size={14} className="shrink-0" />
                  ) : (
                    <span className="w-[14px] shrink-0" />
                  )}
                  <span className="truncate">{item.title}</span>
                </span>

                {item.isCurrent ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Wyświetlany
                  </span>
                ) : null}
              </button>
            ))}

            {archived.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="mt-1 w-full rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                >
                  {showArchived ? "Ukryj archiwum" : `Archiwum (${archived.length})`}
                </button>

                {showArchived
                  ? archived.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openTournament(item.id)}
                        className={[
                          "flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition",
                          item.id === selectedId
                            ? "bg-slate-100 font-semibold text-slate-900"
                            : "text-slate-500 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span className="w-[14px] shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </button>
                    ))
                  : null}
              </>
            ) : null}
          </div>

          <div className="mt-2 border-t border-slate-200 pt-2">
            {isCreating ? (
              <form action={createAction} className="space-y-2 px-1 pb-1">
                <input
                  name="title"
                  autoFocus
                  required
                  placeholder="Nazwa turnieju"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isCreatePending}
                    className="flex-1 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {isCreatePending ? "Tworzenie..." : "Utwórz"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    Anuluj
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-slate-500">
                  Nowy turniej powstaje pusty i nie zmienia tego, co widać na
                  publicznej stronie.
                </p>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                <Plus size={16} />
                Nowy turniej
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
