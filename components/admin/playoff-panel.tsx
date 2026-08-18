"use client";

import { useActionState } from "react";

import {
  completeCurrentRoundAction,
  completeGroupStageAction,
  completeTournamentAction,
  reopenPreviousPhaseAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import { OperationError } from "@/components/admin/operation-error";
import { PlayoffMatchRow } from "@/components/admin/playoff-match-row";
import type {
  PlayoffScopeView,
  PlayoffStateView,
} from "@/lib/data/postgres/playoff-engine";
import {
  describeEditabilityLabel,
  type MatchEditability,
} from "@/lib/playoff/editability";

type PlayoffPanelProps = {
  tournamentId: string;
  state: PlayoffStateView;
};

const initialState: TournamentActionState = { error: null };

/**
 * PANEL STEROWANIA FAZAMI TURNIEJU.
 *
 * Zasada porządkująca cały ekran: administrator edytuje WYLACZNIE etap,
 * który trwa. Rundy przyszłe i rozegrane są widoczne, ale wyszarzone
 * i bez inputów — inaczej przy półfinałach panel pokazywał siedem
 * jednakowo aktywnych sekcji i nie było wiadomo, co jest teraz grane.
 *
 * Minigrupa jest wyjątkiem: to niezależna gałąź, którą w hali gra się
 * równolegle z drabinką, więc jest aktywna przez cały play-off.
 */
export function PlayoffPanel({ tournamentId, state }: PlayoffPanelProps) {
  const [groupState, completeGroup, isGroupPending] = useActionState(
    completeGroupStageAction,
    initialState
  );
  const [roundState, completeRound, isRoundPending] = useActionState(
    completeCurrentRoundAction,
    initialState
  );
  const [finishState, finishTournament, isFinishPending] = useActionState(
    completeTournamentAction,
    initialState
  );
  const [reopenState, reopen, isReopenPending] = useActionState(
    reopenPreviousPhaseAction,
    initialState
  );

  const failed = [groupState, roundState, finishState, reopenState].find(
    (item) => item.error
  );

  const activeRoundLabel = state.scopes
    .flatMap((scope) => scope.rounds)
    .find((round) => round.status === "active")?.label;

  return (
    <section className="ice-surface flush-card space-y-4 p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-eyebrow">Aktualna faza</p>
          <p className="text-lg font-bold text-slate-900">{state.phaseLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {state.phase === "group_stage" ? (
            <form action={completeGroup}>
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <button
                type="submit"
                disabled={isGroupPending}
                className="btn btn-primary h-10 min-w-[13rem] justify-center text-sm"
              >
                {isGroupPending ? "Zamykanie\u2026" : "Zakończ fazę grupową"}
              </button>
            </form>
          ) : null}

          {state.phase !== "group_stage" &&
          state.phase !== "final" &&
          state.phase !== "completed" ? (
            <form action={completeRound}>
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <button
                type="submit"
                disabled={isRoundPending}
                className="btn btn-primary h-10 min-w-[13rem] justify-center text-sm"
              >
                {isRoundPending
                  ? "Zamykanie\u2026"
                  : `Zakończ ${activeRoundLabel ?? state.phaseLabel}`}
              </button>
            </form>
          ) : null}

          {state.phase === "final" ? (
            <form action={finishTournament}>
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <button
                type="submit"
                disabled={isFinishPending}
                className="btn btn-primary h-10 min-w-[13rem] justify-center text-sm"
              >
                {isFinishPending ? "Kończenie\u2026" : "Zakończ turniej"}
              </button>
            </form>
          ) : null}

          {state.phase !== "group_stage" ? (
            <form
              action={reopen}
              onSubmit={(event) => {
                const confirmed = window.confirm(
                  "Cofnięcie do poprzedniej fazy usunie wyniki i uczestników bieżącego etapu.\n\n" +
                    "Wyniki fazy grupowej pozostaną nietknięte.\n\nKontynuować?"
                );

                if (!confirmed) event.preventDefault();
              }}
            >
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="confirmDataLoss" value="true" />
              <button
                type="submit"
                disabled={isReopenPending}
                className="btn btn-quiet h-10 min-w-[13rem] justify-center border-amber-300 text-sm text-amber-800"
              >
                {isReopenPending ? "Cofanie\u2026" : "Cofnij do poprzedniej fazy"}
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <OperationError
        message={failed?.error ?? null}
        details={failed?.details ?? null}
      />

      {state.scopes.map((scope) => (
        <ScopeCard
          key={scope.groupKey}
          tournamentId={tournamentId}
          scope={scope}
        />
      ))}
    </section>
  );
}

/** Plakietka etapu — jeden język dla rund i minigrupy. */
function StatusPill({ status }: { status: MatchEditability }) {
  const tone =
    status === "editable"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "completed"
        ? "border-slate-200 bg-slate-100 text-slate-500"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      data-testid="round-status"
      data-status={status}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}
    >
      {describeEditabilityLabel(status)}
    </span>
  );
}

function ScopeCard({
  tournamentId,
  scope,
}: {
  tournamentId: string;
  scope: PlayoffScopeView;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-bold text-slate-900">{scope.groupName}</h3>

      {scope.preview ? (
        <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">
            Podgląd rozstawienia (może się jeszcze zmienić)
          </p>
          {scope.preview.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-amber-700">
              {warning}
            </p>
          ))}
          <ul className="mt-2 space-y-0.5">
            {scope.preview.pairs.map((pair) => (
              <li key={pair.slotIndex}>
                #{pair.homeSeed} {pair.homeTeamName ?? "\u2014"} vs #
                {pair.awaySeed} {pair.awayTeamName ?? "\u2014"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scope.rounds.map((round) => {
        const status = round.matches[0]?.editability ?? "locked";

        return (
          <div key={round.kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="section-eyebrow">{round.label}</p>
              <StatusPill status={status} />
            </div>

            {round.matches.map((match) => (
              <PlayoffMatchRow
                key={match.externalId}
                tournamentId={tournamentId}
                match={match}
              />
            ))}
          </div>
        );
      })}

      {scope.placement ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="section-eyebrow">
              Klasyfikacja miejsc {scope.placement.positionFrom}
              {"\u2013"}
              {scope.placement.positionTo}
            </p>
            <StatusPill
              status={scope.placement.matches[0]?.editability ?? "locked"}
            />
          </div>

          {scope.placement.matches.map((match) => (
            <PlayoffMatchRow
              key={match.externalId}
              tournamentId={tournamentId}
              match={match}
            />
          ))}
        </div>
      ) : null}

      {scope.classification?.complete ? (
        <div className="rounded-2xl bg-emerald-50 p-3 text-xs text-emerald-900">
          <p className="font-semibold">Klasyfikacja końcowa</p>
          <ol className="mt-1 space-y-0.5">
            {scope.classification.entries.map((entry) => (
              <li key={entry.team.teamId}>
                {entry.position ?? "?"}. {entry.team.name}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
