"use client";

import { useActionState, useEffect, useState } from "react";
import { Settings } from "lucide-react";

import {
  updateTournamentSettingsAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import { TournamentSettingsFields } from "@/components/admin/tournament-settings-fields";
import type { TournamentSettings } from "@/types/tournament-config";

type TournamentSettingsPanelProps = {
  tournamentId: string;
  title: string;
  settings: TournamentSettings;
  /** Turniej ma już drużyny/mecze/wiele grup — struktura jest zablokowana. */
  hasSportingData: boolean;
};

const initialState: TournamentActionState = { error: null };

export function describeSettings(settings: TournamentSettings) {
  const structure =
    settings.structure === "single" ? "Jedna tabela" : "Grupy";
  const format =
    settings.format === "group_playoff" ? "play-off" : "każdy z każdym";

  return `${structure} • ${format}`;
}

export function TournamentSettingsPanel({
  tournamentId,
  title,
  settings,
  hasSportingData,
}: TournamentSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateTournamentSettingsAction,
    initialState
  );

  // Escape zamyka — standard dla okna modalnego.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="btn btn-quiet text-xs"
      >
        <Settings size={14} />
        Ustawienia
      </button>

      {/*
        Telefon: pełny ekran — formularz ustawień jest długi i w małym
        dymku wymagał przewijania w oknie wewnątrz okna.
        Desktop: wyśrodkowany modal na rozmytym tle.
      */}
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ustawienia turnieju"
          data-testid="settings-modal"
          className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-6"
        >
          <button
            type="button"
            aria-label="Zamknij ustawienia"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          <div className="relative z-10 flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-white p-4 shadow-2xl sm:h-auto sm:max-h-[85vh] sm:w-[34rem] sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="section-title">Ustawienia turnieju</h2>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-quiet px-4 text-xs"
              >
                Zamknij
              </button>
            </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="tournamentId" value={tournamentId} />

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nazwa
              </span>
              <input
                name="title"
                defaultValue={title}
                required
                className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>

            <TournamentSettingsFields
              defaultStructure={settings.structure}
              defaultFormat={settings.format}
              defaultPlayoffConfig={settings.playoffConfig}
              structureLockedReason={
                hasSportingData
                  ? "Struktura jest zablokowana, bo turniej ma już drużyny, mecze lub więcej niż jedną grupę. Zmiana wymagałaby przeniesienia danych — utwórz nowy turniej z właściwą strukturą."
                  : null
              }
            />

            {state.error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
                {state.error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="btn btn-primary flex-1"
              >
                {isPending ? "Zapisywanie..." : "Zapisz ustawienia"}
              </button>
            </div>
          </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
