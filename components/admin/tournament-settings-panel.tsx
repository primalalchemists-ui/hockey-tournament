"use client";

import { useActionState, useEffect, useState } from "react";
import { Settings, X} from "lucide-react";

import {
  updateTournamentSettingsAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import { TournamentSettingsFields } from "@/components/admin/tournament-settings-fields";
import { ModalPortal } from "@/components/ui/modal-portal";
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
        <ModalPortal>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ustawienia turnieju"
          data-testid="settings-modal"
          className="dialog-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
        >
          <button
            type="button"
            aria-label="Zamknij ustawienia"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/*
            Ta sama karta na każdym ekranie. Wariant pełnoekranowy na
            telefonie czytał się jak osobna podstrona, choć jest oknem —
            i gubił kontekst tego, co zostało pod spodem.
          */}
          <div className="ice-scroll dialog-card relative z-10 flex max-h-[88dvh] w-full flex-col overflow-y-auto overscroll-contain rounded-3xl bg-white p-4 shadow-2xl sm:w-[34rem] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="section-title">Ustawienia turnieju</h2>

              {/* Standard okien: zamknięcie to ikona w prawym górnym rogu. */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Zamknij"
                data-testid="dialog-close"
                className="dialog-close inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
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
              defaultScorersEnabled={settings.scorersEnabled}
              structureLockedReason={
                hasSportingData
                  ? "Turniej ma już dane, więc struktury nie można zmienić. Utwórz nowy turniej z właściwą strukturą."
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
        </ModalPortal>
      ) : null}
    </>
  );
}
