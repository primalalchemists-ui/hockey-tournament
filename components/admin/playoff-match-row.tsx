"use client";

import { useState, useTransition } from "react";

import { savePlayoffScoreAction } from "@/app/admin/actions";
import { TeamBlock } from "@/components/admin/playoff-team-block";
import type { BracketTeamView } from "@/lib/data/postgres/playoff-engine";
import type { MatchEditability } from "@/lib/playoff/editability";
import {
  canSubmit,
  describeSaveButton,
  shouldAdoptIncoming,
  type SaveStatus,
} from "@/lib/admin/save-state";

/**
 * WIERSZ MECZU W PANELU — jeden mecz, jeden jawny stan zapisu.
 *
 * Wcześniej przycisk zmieniał się w „..." i skakała mu szerokość, przez co
 * całe pole wyniku przesuwało się w trakcie zapisu. Teraz przycisk ma stałe
 * wymiary, a stan jest jawny:
 *
 *   Zapisz → Zapisywanie… → Zapisano → (zmiana wyniku) → Zapisz
 *
 * Powrót do „Zapisz" wynika WYŁĄCZNIE z porównania wartości w inputach
 * z ostatnią zapisaną wartością. Żadnych setTimeout: jeśli nikt nic nie
 * zmienił, napis zostaje „Zapisano" tak długo, jak trzeba.
 */

export type MatchRowMatch = {
  externalId: string;
  home: BracketTeamView | null;
  away: BracketTeamView | null;
  homeLabel?: string;
  awayLabel?: string;
  homeScore: number | null;
  awayScore: number | null;
  editability: MatchEditability;
};

type PlayoffMatchRowProps = {
  tournamentId: string;
  match: MatchRowMatch;
};

/** Pusty input i brak wyniku to ta sama rzecz — porównujemy tekstem. */
function toField(score: number | null): string {
  return score === null ? "" : String(score);
}

export function PlayoffMatchRow({ tournamentId, match }: PlayoffMatchRowProps) {
  const isEditable = match.editability === "editable";

  const [persisted, setPersisted] = useState({
    home: toField(match.homeScore),
    away: toField(match.awayScore),
  });
  const [draft, setDraft] = useState(persisted);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const incoming = `${toField(match.homeScore)}|${toField(match.awayScore)}`;
  const [seenIncoming, setSeenIncoming] = useState(incoming);

  /*
    Odświeżenie danych z serwera nie może skasować tego, co administrator
    właśnie wpisuje. Przyjmujemy nową wartość tylko wtedy, gdy REALNIE
    przyszła z zewnątrz i nie mamy własnej niezapisanej zmiany.

    Korekta stanu przy zmianie propsów dzieje się w RENDERZE, a nie
    w efekcie — to zalecany wzorzec Reacta i nie wywołuje dodatkowego
    przebiegu z nieaktualnymi danymi na ekranie.
  */
  if (incoming !== seenIncoming) {
    setSeenIncoming(incoming);

    if (
      shouldAdoptIncoming({
        incomingChanged: true,
        draft,
        persisted,
        status,
      })
    ) {
      const next = {
        home: toField(match.homeScore),
        away: toField(match.awayScore),
      };

      setPersisted(next);
      setDraft(next);
    }
  }

  const hasPersistedScore = persisted.home !== "" && persisted.away !== "";
  const isSaving = status === "saving" || isPending;

  function save() {
    if (!canSubmit({ draft, persisted, status: isSaving ? "saving" : status })) {
      return;
    }

    setStatus("saving");
    setError(null);

    const snapshot = draft;

    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("matchExternalId", match.externalId);
    formData.set("homeScore", snapshot.home);
    formData.set("awayScore", snapshot.away);

    startTransition(async () => {
      const result = await savePlayoffScoreAction({ error: null }, formData);

      if (result.error) {
        setStatus("error");
        setError(result.error);
        return;
      }

      // Dopiero teraz „ostatnia zapisana wartość" jest tą z inputów.
      setPersisted(snapshot);
      setSeenIncoming(`${snapshot.home}|${snapshot.away}`);
      setStatus("saved");
    });
  }

  const button = describeSaveButton({
    draft,
    persisted,
    status: isSaving ? "saving" : status,
  });

  return (
    <div
      data-testid="playoff-match-row"
      data-editability={match.editability}
      className={[
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3 py-2",
        isEditable
          ? "border-slate-200 bg-white"
          : "border-slate-200/70 bg-slate-50/70",
      ].join(" ")}
    >
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
        <TeamBlock team={match.home} slotLabel={match.homeLabel} />
      </div>

      {isEditable ? (
        <div className="flex items-center gap-1.5">
          <input
            aria-label="Bramki gospodarza"
            data-testid="score-home"
            type="number"
            min={0}
            value={draft.home}
            onChange={(event) =>
              setDraft((value) => ({ ...value, home: event.target.value }))
            }
            className="w-14 rounded-xl border border-slate-300 px-2 py-1 text-center text-sm"
          />
          <span className="text-slate-400">:</span>
          <input
            aria-label="Bramki gościa"
            data-testid="score-away"
            type="number"
            min={0}
            value={draft.away}
            onChange={(event) =>
              setDraft((value) => ({ ...value, away: event.target.value }))
            }
            className="w-14 rounded-xl border border-slate-300 px-2 py-1 text-center text-sm"
          />
        </div>
      ) : (
        <span
          data-testid="score-readonly"
          className="stat-num min-w-[4.5rem] text-center text-sm text-slate-600"
        >
          {hasPersistedScore ? `${persisted.home} : ${persisted.away}` : "—"}
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <TeamBlock team={match.away} align="end" slotLabel={match.awayLabel} />
      </div>

      {isEditable ? (
        <button
          type="button"
          onClick={save}
          disabled={button.disabled}
          data-testid="playoff-save"
          data-state={button.state}
          /*
            Stałe min-w i wysokość: żaden stan nie może przesunąć inputów.
            Dlatego też nie ma tu wariantu „...".
          */
          className="btn btn-primary h-9 min-w-[8.5rem] justify-center px-4 text-xs"
        >
          {button.label}
        </button>
      ) : null}

      {error ? (
        <p className="w-full text-xs font-medium text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
