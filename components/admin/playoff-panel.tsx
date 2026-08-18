"use client";

import { useActionState } from "react";

import {
  completeCurrentRoundAction,
  completeGroupStageAction,
  completeTournamentAction,
  reopenPreviousPhaseAction,
  savePlayoffScoreAction,
  type TournamentActionState,
} from "@/app/admin/actions";
import type {
  PlayoffMatchView,
  PlayoffStateView,
} from "@/lib/data/postgres/playoff-engine";

type PlayoffPanelProps = {
  tournamentId: string;
  state: PlayoffStateView;
};

const initialState: TournamentActionState = { error: null };

/**
 * MINIMALNY panel sterowania fazami turnieju.
 *
 * Świadomie bez designu drabinki — publiczne UI powstanie w kolejnym etapie.
 * Tutaj chodzi wyłącznie o to, żeby dało się przeprowadzić turniej.
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

  const error =
    groupState.error ?? roundState.error ?? finishState.error ?? reopenState.error;

  const activeRoundLabel = state.scopes
    .flatMap((scope) => scope.rounds)
    .find((round) => round.status === "active")?.label;

  return (
    <section className="space-y-4 ice-surface flush-card sm:rounded-3xl p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aktualna faza
          </p>
          <p className="text-lg font-bold text-slate-900">{state.phaseLabel}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {state.phase === "group_stage" ? (
            <form action={completeGroup}>
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <button
                type="submit"
                disabled={isGroupPending}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isGroupPending ? "Zamykanie..." : "Zakończ fazę grupową"}
              </button>
            </form>
          ) : null}

          {state.phase !== "group_stage" && state.phase !== "final" && state.phase !== "completed" ? (
            <form action={completeRound}>
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <button
                type="submit"
                disabled={isRoundPending}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isRoundPending
                  ? "Zamykanie..."
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
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isFinishPending ? "Kończenie..." : "Zakończ turniej"}
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
                className="rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
              >
                {isReopenPending ? "Cofanie..." : "Cofnij do poprzedniej fazy"}
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {error ? (
        <pre className="whitespace-pre-wrap rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {error}
        </pre>
      ) : null}

      {state.scopes.map((scope) => (
        <div
          key={scope.groupKey}
          className="space-y-3 rounded-2xl border border-slate-200 p-4"
        >
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
                    #{pair.homeSeed} {pair.homeTeamName ?? "—"} vs #{pair.awaySeed}{" "}
                    {pair.awayTeamName ?? "—"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {scope.rounds.map((round) => (
            <div key={round.kind} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {round.label} · {round.status}
              </p>

              {round.matches.map((match) => (
                <MatchScoreForm
                  key={match.externalId}
                  tournamentId={tournamentId}
                  match={match}
                />
              ))}
            </div>
          ))}

          {scope.placement ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Minigrupa klasyfikacyjna
              </p>

              {scope.placement.matches.map((match) => (
                <MatchScoreForm
                  key={match.externalId}
                  tournamentId={tournamentId}
                  match={{
                    externalId: match.externalId,
                    homeLabel: match.home.name,
                    awayLabel: match.away.name,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                  }}
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
      ))}
    </section>
  );
}

type MatchLike = Pick<
  PlayoffMatchView,
  "externalId" | "homeLabel" | "awayLabel" | "homeScore" | "awayScore"
>;

function MatchScoreForm({
  tournamentId,
  match,
}: {
  tournamentId: string;
  match: MatchLike;
}) {
  const [state, action, isPending] = useActionState(
    savePlayoffScoreAction,
    initialState
  );

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2"
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="matchExternalId" value={match.externalId} />

      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
        {match.homeLabel} — {match.awayLabel}
      </span>

      <input
        name="homeScore"
        type="number"
        min={0}
        defaultValue={match.homeScore ?? ""}
        className="w-14 rounded-xl border border-slate-300 px-2 py-1 text-center text-sm"
      />
      <span className="text-slate-400">:</span>
      <input
        name="awayScore"
        type="number"
        min={0}
        defaultValue={match.awayScore ?? ""}
        className="w-14 rounded-xl border border-slate-300 px-2 py-1 text-center text-sm"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "..." : "Zapisz"}
      </button>

      {state.error ? (
        <span className="w-full text-xs font-medium text-rose-700">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
