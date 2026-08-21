"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";

import {
  createTournamentAction,
  setCurrentTournamentAction,
  setTournamentArchivedAction,
  deleteTournamentAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import { TournamentSettingsFields } from "@/components/admin/tournament-settings-fields";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TournamentSummary } from "@/lib/data/types";

type TournamentSelectorProps = {
  tournaments: TournamentSummary[];
  selectedId: string;
  /** Airtable nie obsługuje wielu turniejów — wtedy pokazujemy tylko info. */
  multiTournamentEnabled: boolean;
};

const initialState: TournamentActionState = { error: null };

export function TournamentSelector({
  extraActions,
  tournaments,
  selectedId,
  multiTournamentEnabled,
}: TournamentSelectorProps & { extraActions?: React.ReactNode }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [confirmCurrent, setConfirmCurrent] = useState(false);
  const setCurrentFormRef = useRef<HTMLFormElement | null>(null);
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
  const [deleteState, deleteAction, isDeletePending] = useActionState(
    deleteTournamentAction,
    initialState
  );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement | null>(null);
  const archiveFromDialogRef = useRef<HTMLFormElement | null>(null);

  /*
    Okno zamykamy dopiero, gdy operacja NAPRAWDĘ się powiodła. Zamknięcie
    zaraz po kliknięciu udawałoby sukces także wtedy, gdy serwer odmówił —
    a odmawia na przykład dla turnieju wyświetlanego publicznie.
  */
  const [deleteRequested, setDeleteRequested] = useState(false);

  if (deleteRequested && !isDeletePending) {
    setDeleteRequested(false);
    if (!deleteState.error) setDeleteOpen(false);
  }

  const selected = tournaments.find((item) => item.id === selectedId);
  const active = tournaments.filter((item) => !item.archivedAt);
  const archived = tournaments.filter((item) => item.archivedAt);

  const errorMessage =
    createState.error ??
    currentState.error ??
    archiveState.error ??
    deleteState.error;

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

  /** Tytuł turnieju, który kibic widzi w tej chwili. */
  const currentTitle =
    tournaments.find((item) => item.isCurrent)?.title ?? "brak";

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

  const dropdown = (
    <>
        {isOpen ? (
          <div className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-96 overflow-y-auto ice-surface rounded-3xl p-2 shadow-lg">
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
              <form action={createAction} className="space-y-4 px-1 pb-1">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nazwa
                  </span>
                  <input
                    name="title"
                    autoFocus
                    required
                    placeholder="Nazwa turnieju"
                    className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </label>

                <TournamentSettingsFields />

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
    </>
  );

  return (
    <div ref={containerRef} className="space-y-2 lg:contents">
      {/* Rzad 1: ktory turniej edytujemy i czy jest publiczny. */}
      <div className="flex flex-wrap items-center gap-2 lg:contents">
        <span className="text-sm font-medium text-slate-500">Turniej:</span>

        {/* Lista rozwijana kotwiczy sie do samego przycisku. */}
        <span className="relative inline-flex">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="btn btn-quiet"
          >
            {selected?.title ?? "Wybierz turniej"}
            <ChevronDown size={16} />
          </button>
          {dropdown}
        </span>

        {selected?.isCurrent ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Wyświetlany na stronie
          </span>
        ) : selected && !selected.archivedAt ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmCurrent(true)}
              disabled={isCurrentPending}
              className="btn btn-primary text-xs"
            >
              {isCurrentPending ? "Ustawianie…" : "Ustaw jako wyświetlany"}
            </button>

            {/*
              Zamiast okna systemowego: własny dialog, który mówi wprost,
              co kibic zobaczy po zmianie. Formularz jest ukryty i wysyłany
              dopiero po potwierdzeniu.
            */}
            <ConfirmDialog
              open={confirmCurrent}
              title="Zmienić wyświetlany turniej?"
              confirmLabel="Ustaw jako wyświetlany"
              busyLabel="Ustawianie…"
              isBusy={isCurrentPending}
              onCancel={() => setConfirmCurrent(false)}
              onConfirm={() => {
                setConfirmCurrent(false);
                setCurrentFormRef.current?.requestSubmit();
              }}
            >
              <p>
                Aktualnie na stronie:{" "}
                <span className="font-semibold text-slate-900">
                  {currentTitle}
                </span>
              </p>
              <p>
                Po zmianie:{" "}
                <span className="font-semibold text-slate-900">
                  {selected.title}
                </span>
              </p>
              <p>
                Od tej chwili odwiedzający stronę wyników zobaczą wybrany
                turniej.
              </p>
            </ConfirmDialog>

            <form ref={setCurrentFormRef} action={setCurrentAction} className="hidden">
              <input type="hidden" name="tournamentId" value={selected.id} />
            </form>
          </>
        ) : null}

        {selected?.archivedAt ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            Zarchiwizowany
          </span>
        ) : null}

      </div>

      {/* Rzad 2: operacje na turnieju. */}
      <div className="flex flex-wrap items-center gap-2 lg:contents">
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
              className="btn btn-quiet text-xs"
            >
              {selected.archivedAt ? "Przywróć z archiwum" : "Archiwizuj"}
            </button>
          </form>
        ) : null}

        {selected ? (
          <button
            type="button"
            data-testid="tournament-delete"
            onClick={() => setDeleteOpen(true)}
            className="btn btn-quiet text-xs"
          >
            Usuń turniej
          </button>
        ) : null}

        {extraActions}
      </div>

      {selected ? (
        <>
          {/*
            DWA WYJŚCIA, JEDNO OKNO.

            Kasowanie turnieju i przeniesienie go do archiwum to dwie różne
            odpowiedzi na to samo pytanie „co z tym turniejem". Pokazanie
            wyłącznie destrukcyjnej opcji zmuszałoby do zamknięcia okna
            i szukania bezpieczniejszej gdzie indziej.
          */}
          <ConfirmDialog
            open={deleteOpen}
            tone="danger"
            icon="warning"
            title="Co zrobić z turniejem?"
            confirmLabel="Usuń trwale"
            busyLabel="Usuwanie…"
            isBusy={isDeletePending}
            showCancel={false}
            onCancel={() => setDeleteOpen(false)}
            onConfirm={() => {
              setDeleteRequested(true);
              deleteFormRef.current?.requestSubmit();
            }}
            secondaryAction={{
              label: "Archiwizuj",
              busyLabel: "Archiwizowanie…",
              isBusy: isArchivePending,
              onClick: () => archiveFromDialogRef.current?.requestSubmit(),
            }}
          >
            {/*
              Dwa krótkie zdania. Konsekwencja i wyjście awaryjne — resztę
              mówią same przyciski, a ściana tekstu w oknie decyzyjnym i tak
              nie jest czytana.
            */}
            <p>
              <strong>{selected.title}</strong>
            </p>
            <p>
              Usunięcie jest nieodwracalne. Możesz też zachować turniej
              w archiwum.
            </p>
          </ConfirmDialog>

          <form ref={deleteFormRef} action={deleteAction} className="hidden">
            <input type="hidden" name="tournamentId" value={selected.id} />
          </form>

          {/* Archiwizacja z okna korzysta z TEJ SAMEJ akcji co przycisk obok. */}
          <form
            ref={archiveFromDialogRef}
            action={archiveAction}
            className="hidden"
          >
            <input type="hidden" name="tournamentId" value={selected.id} />
            <input type="hidden" name="archived" value="true" />
          </form>
        </>
      ) : null}

      {errorMessage ? (
        <p className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 lg:mt-0 lg:basis-full">
          {errorMessage}
        </p>
      ) : null}

    </div>
  );
}
